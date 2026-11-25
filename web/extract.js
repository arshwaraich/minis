// Photo -> trait measurements, fully in the browser.
// Uses MediaPipe FaceLandmarker (478 pts + blendshapes) and the multiclass
// selfie segmenter (0 bg, 1 hair, 2 body skin, 3 face skin, 4 clothes, 5 other).
// Output is raw, face-normalised measurements + colours; avatar.js turns them
// into a character, so mapping can be retuned without re-running the models.

import { TRAITS_VERSION } from './version.js';
import { FilesetResolver, FaceLandmarker, ImageSegmenter } from './vendor/mediapipe/vision_bundle.js';

const BASE = new URL('.', import.meta.url).href;
let tasksP = null;

function loadTasks() {
  if (tasksP) return tasksP;
  tasksP = (async () => {
    const fs = await FilesetResolver.forVisionTasks(BASE + 'vendor/mediapipe/wasm');
    const [face, seg] = await Promise.all([
      FaceLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: BASE + 'models/face_landmarker.task', delegate: 'CPU' },
        runningMode: 'IMAGE', numFaces: 1, outputFaceBlendshapes: true,
      }),
      ImageSegmenter.createFromOptions(fs, {
        baseOptions: { modelAssetPath: BASE + 'models/selfie_multiclass_256x256.tflite', delegate: 'CPU' },
        runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: false,
      }),
    ]);
    return { face, seg };
  })();
  return tasksP;
}

export function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('could not load image ' + src));
    img.src = src;
  });
}

const lerp = (a, b, t) => a + (b - a) * t;
const hex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
function median(arr) {
  if (!arr.length) return null;
  const s = Float32Array.from(arr).sort();
  return s[s.length >> 1];
}
function medianColor(rs, gs, bs) {
  if (rs.length < 8) return null;
  return [median(rs), median(gs), median(bs)];
}

export async function extractTraits(src, opts = {}) {
  const img = typeof src === 'string' ? await loadImage(src) : src;
  // Work on a bounded canvas so huge photos stay fast.
  const scale = Math.min(1, 768 / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const w = Math.round((img.naturalWidth || img.width) * scale);
  const h = Math.round((img.naturalHeight || img.height) * scale);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;

  // Is this a black-and-white photo (possibly tinted: sepia, cool, warm)? In such a photo every
  // pixel's colour is a function of its brightness alone. Fit chroma ~ quadratic(brightness) and
  // measure what's left over; colour photos leave a lot (skin vs clothes vs background).
  const monoResid = (() => {
    const n = 7; // [1,Y,Y^2] normal equations for cb and cr
    const A = new Float64Array(9), bcb = new Float64Array(3), bcr = new Float64Array(3);
    const samples = [];
    const stepPx = Math.max(1, Math.round(Math.sqrt((w * h) / 20000)));
    for (let y = 0; y < h; y += stepPx) for (let x = 0; x < w; x += stepPx) {
      const i = (y * w + x) * 4, r = px[i], g = px[i + 1], b = px[i + 2];
      const Y = (0.299 * r + 0.587 * g + 0.114 * b) / 255, cb = b - Y * 255, cr = r - Y * 255;
      const f = [1, Y, Y * Y];
      for (let a = 0; a < 3; a++) { bcb[a] += f[a] * cb; bcr[a] += f[a] * cr; for (let c = 0; c < 3; c++) A[a * 3 + c] += f[a] * f[c]; }
      samples.push(Y, cb, cr);
    }
    const solve = (M, v) => { // 3x3 Cramer's rule with a little ridge for stability
      const m = Array.from(M); m[0] += 1e-6; m[4] += 1e-6; m[8] += 1e-6;
      const det = (q) => q[0] * (q[4] * q[8] - q[5] * q[7]) - q[1] * (q[3] * q[8] - q[5] * q[6]) + q[2] * (q[3] * q[7] - q[4] * q[6]);
      const D = det(m);
      return [0, 1, 2].map((k) => { const q = m.slice(); for (let r = 0; r < 3; r++) q[r * 3 + k] = v[r]; return det(q) / D; });
    };
    const kb = solve(A, bcb), kr = solve(A, bcr);
    let ss = 0;
    for (let i = 0; i < samples.length; i += 3) {
      const Y = samples[i];
      const eb = samples[i + 1] - (kb[0] + kb[1] * Y + kb[2] * Y * Y), er = samples[i + 2] - (kr[0] + kr[1] * Y + kr[2] * Y * Y);
      ss += eb * eb + er * er;
    }
    return Math.sqrt(ss / (samples.length / 3));
  })();

  const { face, seg } = await loadTasks();
  const fr = face.detect(cv);
  if (!fr.faceLandmarks || !fr.faceLandmarks.length) throw new Error('no face found');
  const L = fr.faceLandmarks[0].map((p) => [p.x * w, p.y * h]);
  const bs = {};
  (fr.faceBlendshapes?.[0]?.categories || []).forEach((c) => (bs[c.categoryName] = c.score));

  const sr = seg.segment(cv);
  const mask = sr.categoryMask.getAsUint8Array().slice();
  const mw = sr.categoryMask.width, mh = sr.categoryMask.height;
  sr.close?.();
  const cat = (x, y) => {
    const mx = Math.min(mw - 1, Math.max(0, Math.round((x / w) * mw)));
    const my = Math.min(mh - 1, Math.max(0, Math.round((y / h) * mh)));
    return mask[my * mw + mx];
  };

  // ---- face frame: origin at nose bridge, u right, v down, unit = cheek-to-cheek width
  const d = (a, b) => Math.hypot(L[a][0] - L[b][0], L[a][1] - L[b][1]);
  const W = d(234, 454);
  const ex = [(L[454][0] - L[234][0]) / W, (L[454][1] - L[234][1]) / W];
  const ey = [-ex[1], ex[0]];
  const C = L[168];
  const toF = (x, y) => [((x - C[0]) * ex[0] + (y - C[1]) * ex[1]) / W, ((x - C[0]) * ey[0] + (y - C[1]) * ey[1]) / W];
  const fromF = (u, v) => [C[0] + (u * ex[0] + v * ey[0]) * W, C[1] + (u * ex[1] + v * ey[1]) * W];
  const F = (i) => toF(L[i][0], L[i][1]);
  const inImg = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const rgbAt = (x, y) => {
    const i = (Math.round(y) * w + Math.round(x)) * 4;
    return [px[i], px[i + 1], px[i + 2]];
  };
  const grayAt = (x, y) => {
    if (!inImg(x, y)) return NaN;
    const c = rgbAt(x, y);
    return lum(c[0], c[1], c[2]);
  };

  // Median colour of a disc (radius in face units) around a face-space point.
  function patch(u, v, r, filter) {
    const R = [], G = [], B = [];
    const steps = 7;
    for (let i = -steps; i <= steps; i++) for (let j = -steps; j <= steps; j++) {
      if (i * i + j * j > steps * steps) continue;
      const [x, y] = fromF(u + (i / steps) * r, v + (j / steps) * r);
      if (!inImg(x, y)) continue;
      if (filter && !filter(x, y)) continue;
      const c = rgbAt(x, y);
      R.push(c[0]); G.push(c[1]); B.push(c[2]);
    }
    return medianColor(R, G, B);
  }
  const lmPatch = (idx, r, f) => {
    const cols = idx.map((i) => patch(...F(i), r, f)).filter(Boolean);
    if (!cols.length) return null;
    return [0, 1, 2].map((k) => median(cols.map((c) => c[k])));
  };
  const Y = (c) => (c ? lum(c[0], c[1], c[2]) : NaN);

  // ---- geometry
  const vTop = F(10)[1], vChin = F(152)[1];
  const vEye = (F(159)[1] + F(145)[1] + F(386)[1] + F(374)[1]) / 4;
  const vBrow = (F(105)[1] + F(334)[1]) / 2;
  const browPairs = [[70, 46], [63, 53], [105, 52], [66, 65], [107, 55], [300, 276], [293, 283], [334, 282], [296, 295], [336, 285]];
  const geo = {
    faceH: d(10, 152) / W,
    jaw: d(172, 397) / W,
    chin: d(176, 400) / W,
    eyeW: (d(33, 133) + d(362, 263)) / 2 / W,
    eyeOpen: (d(159, 145) / d(33, 133) + d(386, 374) / d(362, 263)) / 2,
    eyeGap: d(133, 362) / W,
    browGap: vEye - vBrow,
    browThick: browPairs.reduce((s, [a, b]) => s + d(a, b), 0) / browPairs.length / W,
    browTilt: ((F(70)[1] - F(107)[1]) + (F(300)[1] - F(336)[1])) / 2, // + = outer end lower
    noseW: d(98, 327) / W,
    mouthW: d(61, 291) / W,
    lips: d(0, 17) / W,
    smile: ((bs.mouthSmileLeft || 0) + (bs.mouthSmileRight || 0)) / 2,
    open: bs.jawOpen || 0,
  };

  // ---- brow centre-lines relative to each eye centre (for brow shape)
  const browLine = (up, lo, a, b) => {
    const ec = [(F(a)[0] + F(b)[0]) / 2, (F(a)[1] + F(b)[1]) / 2];
    return up.map((u, i) => {
      const p = F(u), q = F(lo[i]);
      return [+(((p[0] + q[0]) / 2) - ec[0]).toFixed(4), +(((p[1] + q[1]) / 2) - ec[1]).toFixed(4), +(Math.hypot(p[0] - q[0], p[1] - q[1])).toFixed(4)];
    });
  };
  const brows = [
    browLine([107, 66, 105, 63, 70], [55, 65, 52, 53, 46], 33, 133),
    browLine([336, 296, 334, 293, 300], [285, 295, 282, 283, 276], 362, 263),
  ].map((b) => ({ side: Math.sign(b[2][0] + (b === null ? 0 : 0)) || 0, pts: b }));

  // ---- colours
  const skinC = lmPatch([50, 280, 151], 0.045);
  const browC = (() => {
    const cols = [];
    for (const i of [105, 334, 66, 296, 63, 293, 52, 282]) {
      const [u, v] = F(i);
      for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
        const [x, y] = fromF(u + a * 0.006, v + b * 0.006);
        if (inImg(x, y)) cols.push(rgbAt(x, y));
      }
    }
    cols.sort((p, q) => lum(...p) - lum(...q));
    const dark = cols.slice(0, Math.max(1, cols.length >> 2));
    return [0, 1, 2].map((k) => median(dark.map((c) => c[k])));
  })();
  const irisC = (() => {
    const cols = [];
    for (const [c0, a, b] of [[468, 469, 471], [473, 474, 476]]) {
      const [cu, cv] = F(c0), r = d(a, b) / 2 / W;
      for (let k = 0; k < 24; k++) for (const f of [0.6, 0.75, 0.88]) {
        const ang = (k / 24) * Math.PI * 2;
        if (Math.sin(ang) < -0.3) continue; // upper lid shadow
        const [x, y] = fromF(cu + Math.cos(ang) * r * f, cv + Math.sin(ang) * r * f);
        if (inImg(x, y)) cols.push(rgbAt(x, y));
      }
    }
    if (cols.length < 8) return null;
    return [0, 1, 2].map((k) => median(cols.map((c) => c[k])));
  })();
  const lipC = lmPatch([16, 15], 0.012);

  // ---- segmentation-derived hair / clothes / headwear
  const hairR = [], hairG = [], hairB = [], clR = [], clG = [], clB = [];
  let hairTop = Infinity, headTop = Infinity, skinTop = Infinity, sideLow = -Infinity, hairWide = 0, hairArea = 0;
  const sideRows = [{}, {}];
  let earN = 0, earHair = 0;
  const glR = [], glG = [], glB = [], hwR = [], hwG = [], hwB = [];
  let eyeN = 0, eyeAcc = 0, hwN = 0, hwAcc = 0, bangN = 0, bangHair = 0;
  const skinPx = [], hairLine = [-Infinity, -Infinity], glBox = [[9, -9, 9, -9], [9, -9, 9, -9]], glPx = [];
  let hwMinV = Infinity, hwMaxV = -Infinity, crownN = 0, crownHw = 0, earN5 = 0, earRingN = 0, lapSum = 0, lapN = 0, hairLumSum = 0;
  const erR = [], erG = [], erB = [];
  const step = Math.max(1, Math.round(W / 90));
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const c = cat(x, y);
    const [u, v] = toF(x, y);
    const au = Math.abs(u);
    if (c === 3 && au < 0.4 && v > vEye + 0.08 && v < vChin - 0.18) skinPx.push(rgbAt(x, y));
    if (c === 1 && au > 0.04 && au < 0.36 && v < vBrow) hairLine[u < 0 ? 0 : 1] = Math.max(hairLine[u < 0 ? 0 : 1], v);
    if (c === 5 && au < 0.6 && v > vEye - 0.2 && v < vEye + 0.2) {
      const b = glBox[u < 0 ? 0 : 1];
      b[0] = Math.min(b[0], u); b[1] = Math.max(b[1], u); b[2] = Math.min(b[2], v); b[3] = Math.max(b[3], v);
      glPx.push(rgbAt(x, y));
    }
    if (c === 5 && au < 0.75 && v < vTop + 0.05 && v > vTop - 0.9) { hwMinV = Math.min(hwMinV, v); hwMaxV = Math.max(hwMaxV, v); }
    if (au > 0.42 && au < 0.85 && v > vEye + 0.35 && v < vChin + 0.35) { earN5++; if (c === 5) { earRingN++; const p = rgbAt(x, y); erR.push(p[0]); erG.push(p[1]); erB.push(p[2]); } }
    if (c === 1 && au < 0.8 && x > 1 && y > 1 && x < w - 2 && y < h - 2) {
      const g0 = grayAt(x, y);
      const lap = Math.abs(4 * g0 - grayAt(x - 2, y) - grayAt(x + 2, y) - grayAt(x, y - 2) - grayAt(x, y + 2));
      lapSum += lap; lapN++; hairLumSum += g0;
    }
    if (c === 1) {
      hairArea++;
      if (au < 0.9 && v < vChin + 1.5) {
        const p = rgbAt(x, y);
        hairR.push(p[0]); hairG.push(p[1]); hairB.push(p[2]);
      }
      if (au < 0.3) hairTop = Math.min(hairTop, v);
      if (au > 0.5 && au < 1.1 && v > vTop && v < vChin + 2.5) {
        const bin = Math.floor((v - vTop) / 0.03), sd = u < 0 ? 0 : 1;
        sideRows[sd][bin] = (sideRows[sd][bin] || 0) + 1;
      }
      if (v > vTop && v < vEye) hairWide = Math.max(hairWide, au);
    } else if (c === 4) {
      if (v > vChin - 0.3) { const p = rgbAt(x, y); clR.push(p[0]); clG.push(p[1]); clB.push(p[2]); }
    }
    if (au > 0.5 && au < 0.66 && v > vEye + 0.05 && v < vEye + 0.4) { earN++; if (c === 1) earHair++; }
    if (au < 0.3 && (c === 1 || c === 3 || c === 5)) headTop = Math.min(headTop, v);
    if (au < 0.22 && c === 3 && v < vTop + 0.1) skinTop = Math.min(skinTop, v);
    if (au < 0.55 && v > vEye - 0.13 && v < vEye + 0.13) { eyeN++; if (c === 5) { eyeAcc++; const p = rgbAt(x, y); glR.push(p[0]); glG.push(p[1]); glB.push(p[2]); } }
    if (au < 0.75 && v > vTop - 0.7 && v < vTop + 0.05 && (c === 1 || c === 5)) { hwN++; if (c === 5) { hwAcc++; const p = rgbAt(x, y); hwR.push(p[0]); hwG.push(p[1]); hwB.push(p[2]); } }
    if (au < 0.28 && v > vTop + 0.04 && v < vBrow - 0.06) { bangN++; if (c === 1) bangHair++; }
  }
  // Lowest row (per side) where the hair band is at least ~0.08 face-widths wide.
  for (const rows of sideRows) for (const [bin, n] of Object.entries(rows)) {
    if (n * step / W >= 0.08) sideLow = Math.max(sideLow, vTop + (+bin + 1) * 0.03);
  }
  // crown coverage by accessories (scarf/hat vs a band)
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const [u, v] = toF(x, y);
    if (Math.abs(u) < 0.3 && v > headTop && v < headTop + 0.18) { crownN++; if (cat(x, y) === 5) crownHw++; }
  }
  // Is the top of the head inside the photo at all?
  const topInImg = inImg(...fromF(0, vTop - 0.45));
  // Bare skin above the forehead landmark, as a share of the forehead-to-crown span.
  const recede = topInImg && isFinite(headTop) && isFinite(skinTop) ? Math.max(0, vTop - skinTop) / Math.max(0.05, vTop - headTop) : null;
  const area = hairArea * step * step / (W * W);

  // ---- facial hair: darkness of chin / upper lip relative to cheeks
  const cheekY = Y(lmPatch([50, 280], 0.04));
  const chinY = Y(lmPatch([199, 200, 175], 0.03));
  const jawY = Y(lmPatch([136, 365, 150, 379], 0.03));
  const philY = Y(lmPatch([164], 0.02));
  const chinC = lmPatch([199, 200, 175], 0.03);
  const sat = (c) => (c ? (Math.max(...c) - Math.min(...c)) / Math.max(1, Math.max(...c)) : NaN);
  const cheekC = lmPatch([50, 280], 0.04), philC = lmPatch([164], 0.02);
  // fine-grain texture (stubble is speckle, shadow is smooth): mean |laplacian| / brightness
  const texAt = (idx, r) => {
    let sum = 0, n = 0, lsum = 0;
    const k = Math.max(1, Math.round(W / 220));
    for (const id of idx) {
      const [u0, v0] = F(id);
      for (let a = -6; a <= 6; a++) for (let b = -6; b <= 6; b++) {
        if (a * a + b * b > 36) continue;
        const [x, y] = fromF(u0 + (a / 6) * r, v0 + (b / 6) * r);
        if (x < k || y < k || x >= w - k || y >= h - k) continue;
        const g0 = grayAt(x, y);
        sum += Math.abs(4 * g0 - grayAt(x - k, y) - grayAt(x + k, y) - grayAt(x, y - k) - grayAt(x, y + k));
        lsum += g0; n++;
      }
    }
    return n ? sum / n / Math.max(20, lsum / n) : NaN;
  };
  const texCheek = texAt([50, 280, 101, 330], 0.04);

  // ---- glasses: sharp dark valleys where frames would sit, skin should be smooth there
  function valley(u0, v0, u1, v1) {
    const n = 48, g = [];
    for (let i = 0; i < n; i++) { const t = i / (n - 1); g.push(grayAt(...fromF(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t))); }
    let best = 0;
    for (let i = 4; i < n - 4; i++) {
      const a = (g[i - 4] + g[i - 3]) / 2, b = (g[i + 3] + g[i + 4]) / 2;
      const dip = (Math.min(a, b) - g[i]) / Math.max(30, (a + b) / 2);
      if (dip > best) best = dip;
    }
    return best;
  }
  const eL = F(468), eR = F(473), lidL = F(145)[1], lidR = F(374)[1];
  const glassesParts = {
    bridge: valley(0, vEye - 0.16, 0, vEye + 0.06),
    underL: valley(eL[0], lidL + 0.02, eL[0], lidL + 0.22),
    underR: valley(eR[0], lidR + 0.02, eR[0], lidR + 0.22),
    sideL: valley(F(33)[0] + 0.01, F(33)[1], -0.5, F(33)[1]),
    sideR: valley(F(263)[0] - 0.01, F(263)[1], 0.5, F(263)[1]),
  };
  const gp = glassesParts;
  const glassesScore = gp.bridge + Math.min(gp.underL, gp.underR) + (gp.sideL + gp.sideR) / 2;
  const lensY = Y(lmPatch([468, 473], 0.06));

  const band = (px, lo, hi) => {
    if (px.length < 8) return null;
    const sorted = px.slice().sort((a, b) => lum(...a) - lum(...b));
    const sl = sorted.slice(Math.floor(sorted.length * lo), Math.max(Math.floor(sorted.length * lo) + 1, Math.floor(sorted.length * hi)));
    return [0, 1, 2].map((k) => median(sl.map((c) => c[k])));
  };
  // Eye whites as a neutral reference for the photo's colour cast.
  const sclera = (() => {
    const px = [];
    for (const [ic, inner, outer] of [[468, 133, 33], [473, 362, 263]]) {
      const c0 = F(ic);
      for (const corner of [inner, outer]) {
        const c1 = F(corner);
        for (let t = 0.45; t <= 0.8; t += 0.05) for (const dv of [-0.006, 0, 0.006]) {
          const [x, y] = fromF(lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t) + dv);
          if (inImg(x, y)) px.push(rgbAt(x, y));
        }
      }
    }
    return band(px, 0.6, 0.95);
  })();
  let wb = [1, 1, 1];
  if (sclera && lum(...sclera) > 70) {
    const m = (sclera[0] + sclera[1] + sclera[2]) / 3;
    wb = sclera.map((c) => Math.max(0.85, Math.min(1.18, m / Math.max(1, c))));
  }
  const skinBright = band(skinPx, 0.72, 0.95);
  const glassFrame = band(glPx, 0, 0.3);
  const glDims = glBox.filter((b) => b[1] > b[0]).map((b) => [b[1] - b[0], b[3] - b[2]]);
  const hairC = (() => {
    if (hairR.length < 8) return null;
    const idx = hairR.map((_, i) => i).sort((a, b) => lum(hairR[a], hairG[a], hairB[a]) - lum(hairR[b], hairG[b], hairB[b]));
    const sl = idx.slice(Math.floor(idx.length * 0.55), Math.floor(idx.length * 0.88));
    return medianColor(sl.map((i) => hairR[i]), sl.map((i) => hairG[i]), sl.map((i) => hairB[i]));
  })();
  let debug;
  if (opts.debug) {
    const pal = [[0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 128, 255], [255, 255, 0], [255, 0, 255]];
    const id = ctx.getImageData(0, 0, w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = pal[cat(x, y)], i = (y * w + x) * 4;
      for (let k = 0; k < 3; k++) id.data[i + k] = id.data[i + k] * 0.55 + c[k] * 0.45;
    }
    ctx.putImageData(id, 0, 0);
    ctx.fillStyle = '#fff';
    for (const i of [10, 152, 168, 234, 454]) ctx.fillRect(L[i][0] - 3, L[i][1] - 3, 6, 6);
    debug = cv.toDataURL('image/jpeg', 0.8);
  }
  return {
    debug,
    v: TRAITS_VERSION,
    mono: { resid: +monoResid.toFixed(2) },
    geo,
    brows: brows.map((b, i) => ({ u: i === 0 ? Math.sign(F(33)[0]) : Math.sign(F(263)[0]), pts: b.pts })),
    wb,
    color: {
      skin: skinC && hex(skinC),
      skinBright: skinBright && hex(skinBright),
      sclera: sclera && hex(sclera),
      earrings: erR.length > 4 ? hex(medianColor(erR, erG, erB)) : null,
      hair: hairC && hex(hairC),
      brow: browC && hex(browC),
      iris: irisC && hex(irisC),
      lip: lipC && hex(lipC),
      shirt: clR.length > 8 ? hex(medianColor(clR, clG, clB)) : null,
      chin: chinC && hex(chinC),
      glasses: glassFrame && hex(glassFrame),
      headwear: hwR.length > 8 ? hex(medianColor(hwR, hwG, hwB)) : null,
    },
    hair: {
      area,
      recede, skinAbove: isFinite(skinTop) ? vTop - skinTop : 0, headAbove: isFinite(headTop) ? vTop - headTop : 0,
      headwear: hwN > 20 ? hwAcc / hwN : 0,
      bangs: bangN ? bangHair / bangN : 0,
      height: isFinite(hairTop) ? vTop - hairTop : 0,
      side: isFinite(sideLow) ? (sideLow - vTop) / (vChin - vTop) : 0,
      width: hairWide,
      ears: earN ? earHair / earN : 0,
      texture: lapN ? lapSum / lapN / Math.max(20, hairLumSum / lapN) : 0,
      fringeSide: isFinite(hairLine[0]) && isFinite(hairLine[1]) ? hairLine[1] - hairLine[0] : 0, // + = hair lower on image-right
      hwTop: isFinite(hwMinV) ? vTop - hwMinV : 0, hwBottom: isFinite(hwMaxV) ? vTop - hwMaxV : 0,
      crownHw: crownN ? crownHw / crownN : 0,
      hwArea: hwAcc * step * step / (W * W),
    },
    beard: { chin: chinY / cheekY, jaw: jawY / cheekY, lip: philY / cheekY, chinSat: sat(chinC) / sat(cheekC), lipSat: sat(philC) / sat(cheekC), chinTex: texAt([199, 200, 175, 18], 0.03) / texCheek, lipTex: texAt([164, 167, 393], 0.02) / texCheek },
    glasses: { score: glassesScore, seg: eyeN ? eyeAcc / eyeN : 0, parts: gp, lens: lensY / cheekY, w: glDims.length ? median(glDims.map((d) => d[0])) : 0, h: glDims.length ? median(glDims.map((d) => d[1])) : 0 },
    earrings: earN5 ? earRingN / earN5 : 0,
  };
}
