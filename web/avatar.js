// Traits (from extract.js) -> chibi params -> procedural Three.js character.
// Style: big soft head, stubby body, sculpted glossy hair locks, big shiny
// eyes, one shared stylised paint shader (style.js), painted canvas faces. All geometry is procedural (no art assets).

import * as THREE from 'three';
import { paint, paintTex, paintHair, setBand, outlineMat } from './style.js';
import { MarchingCubes } from 'three/addons/MarchingCubes.js';
import { mergeVertices } from 'three/addons/BufferGeometryUtils.js';

// ---------------------------------------------------------------- helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const Z = new THREE.Vector3(0, 0, 1);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) {
  let a = seed || 1;
  return () => ((a = Math.imul(a ^ (a >>> 15), 1 | a) + 0x6d2b79f5 | 0), ((a ^ (a >>> 14)) >>> 0) / 4294967296);
}
function hexLum(h) {
  const c = new THREE.Color(h);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; // linear
}
// Photo colours are muddied by lighting; nudge them toward clean toy colours.
function tidy(hex, { lift = 0.06, sat = 1.15, minL = 0.12, maxL = 0.9 } = {}) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h, clamp(hsl.s * sat, 0, 1), clamp(hsl.l + lift, minL, maxL), THREE.SRGBColorSpace);
  return '#' + c.getHexString();
}
function mix(a, b, t) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}
function shade(hex, dl, ds = 1) {
  const c = new THREE.Color(hex), hsl = {};
  c.getHSL(hsl, THREE.SRGBColorSpace);
  c.setHSL(hsl.h, clamp(hsl.s * ds, 0, 1), clamp(hsl.l + dl, 0, 1), THREE.SRGBColorSpace);
  return '#' + c.getHexString();
}

const PANTS = ['#4a5a86', '#3a3f52', '#8a6d4f', '#5d7a5a', '#6d5a8a', '#c9a66b'];
const SHOES = ['#fbf7ef', '#5a3d30', '#e0604f', '#3a3a44', '#f1c75b', '#7cc3d6'];
const SHIRTS = ['#f28b82', '#7fb8e6', '#9bd88a', '#f6cd61', '#c3a3ef', '#f5a8c8', '#6fd0c6'];

// Art-style presets: same traits, different design language.
export const STYLES = {
  gumdrop: { label: 'Gumdrop', body: 'stubby', eyes: 'gem', headK: 0.85, warm: 0.25, eyeK: 1, gapAdd: 0, pitchEye: -0.25, brow: 1, nose: 'bump', mouthK: 1, blushK: 1, band: [0.36, 0.6], outline: 0, skinSat: 1 },
  sprout: { label: 'Sprout', body: 'lithe', eyes: 'sclera', headK: 0.74, warm: 0.5, eyeK: 1.2, gapAdd: 0.06, pitchEye: -0.16, brow: 0.6, nose: 'dot', mouthK: 2, blushK: 1.25, band: [0.42, 0.56], outline: 0, skinSat: 1.18 },
  mochi: { label: 'Mochi', body: 'bean', eyes: 'bean', headK: 0.92, warm: 0.4, eyeK: 0.9, gapAdd: 0.04, pitchEye: -0.3, brow: 0.55, nose: 'none', mouthK: 0.8, blushK: 1.55, band: [0.3, 0.66], outline: 0, skinSat: 1.05, sxK: 1.07, syK: 0.95 },
  storybook: { label: 'Storybook', body: 'lithe', eyes: 'lash', headK: 0.76, warm: 0.45, eyeK: 1, gapAdd: 0.03, pitchEye: -0.2, brow: 0.8, nose: 'dot', mouthK: 1, blushK: 1.1, band: [0.48, 0.5], outline: 0.028, skinSat: 1.12 },
};

// Black-and-white photos: estimate natural colours from brightness alone.
const srgbLum = (h) => { const c = new THREE.Color(h); c.convertLinearToSRGB(); return (c.r + c.g + c.b) / 3; };
const srgbSat = (h) => { const c = new THREE.Color(h), o = {}; c.getHSL(o, THREE.SRGBColorSpace); return o.s; };
function ramp(stops, x) {
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (x <= stops[i][0]) {
    const [x0, c0] = stops[i - 1], [x1, c1] = stops[i];
    return mix(c0, c1, (x - x0) / (x1 - x0));
  }
  return stops[stops.length - 1][1];
}
const SKIN_RAMP = [[0.35, '#6b4430'], [0.5, '#9a6a4f'], [0.62, '#c08a6f'], [0.72, '#d9a68f'], [0.82, '#f0c6b4'], [0.9, '#f8dccf']];
const HAIR_RAMP = [[0.15, '#231a16'], [0.3, '#4a3428'], [0.45, '#7a5a3e'], [0.6, '#a88458'], [0.75, '#d2b585']];
function colouriseMono(c, seed) {
  const r = rng(seed);
  const out = { ...c };
  if (c.skinBright || c.skin) out.skinBright = out.skin = ramp(SKIN_RAMP, srgbLum(c.skinBright || c.skin));
  if (c.hair) out.hair = ramp(HAIR_RAMP, srgbLum(c.hair));
  if (c.brow) out.brow = ramp(HAIR_RAMP, srgbLum(c.brow) * 0.9);
  out.iris = '#4a3020';
  if (c.shirt) { const L = srgbLum(c.shirt); out.shirt = mix(SHIRTS[Math.floor(r() * SHIRTS.length)], L < 0.5 ? '#000000' : '#ffffff', Math.abs(L - 0.5) * 0.8); }
  if (c.headwear) out.headwear = ['#c0392b', '#2e86c1', '#f1c40f', '#8e44ad'][Math.floor(r() * 4)];
  return out;
}

export function traitsToParams(t, name = '') {
  const r = rng(hashStr(name || JSON.stringify(t.color || {})));
  const g = t.geo || {};
  let c = t.color || {};
  // a greyscale photo: every sampled colour has (almost) no saturation
  const mono = [c.skinBright || c.skin, c.hair, c.iris].filter(Boolean).every((h) => srgbSat(h) < 0.06) && !!(c.skin || c.hair);
  if (mono) c = colouriseMono(c, hashStr(name + 'mono'));
  const H = t.hair || {};
  // half-strength white balance from the eye whites
  const wb = [1, 1, 1]; // eye-white balance measured (t.wb) but sclera is too pink to trust
  const fix = (h) => {
    if (!h) return h;
    const cc = new THREE.Color(h);
    cc.convertLinearToSRGB();
    cc.r = clamp(cc.r * wb[0], 0, 1); cc.g = clamp(cc.g * wb[1], 0, 1); cc.b = clamp(cc.b * wb[2], 0, 1);
    cc.convertSRGBToLinear();
    return '#' + cc.getHexString();
  };
  const kid = (g.faceH ?? 1.2) < 1.1;

  // hair length: hair that never reaches the ears reads as short even when a
  // thin strand behind the ear goes lower.
  let side = H.side ?? 0.4;
  if ((H.ears ?? 0) < 0.25 && side < 0.92) side = Math.min(side, 0.42);
  const length = side < 0.5 ? 'short' : side < 1.25 ? 'medium' : 'long';

  const smile = g.smile ?? 0.5;
  const squint = (g.eyeOpen ?? 0.3) < 0.215 && smile > 0.6;
  const irisL = c.iris ? hexLum(c.iris) : 0;
  const irisHsl = {};
  if (c.iris) new THREE.Color(fix(c.iris)).getHSL(irisHsl, THREE.SRGBColorSpace);
  // light eyes = blue / green / grey, not merely bright brown
  const lightEyes = !!c.iris && irisHsl.l > 0.2 && ((irisHsl.h > 0.15 && irisHsl.h < 0.75 && irisHsl.s > 0.06) || irisHsl.s < 0.06);

  const beardAmt = t.beard ? clamp((0.92 - Math.min(t.beard.chinSat ?? 1, t.beard.lipSat ?? 1)) / 0.15, 0, 1) : 0;
  const glassesOn = !!t.glasses && ((t.glasses.seg ?? 0) > 0.03 || (t.glasses.score ?? 0) > 0.95);

  const skin = tidy((c.skinBright && c.skin ? mix(c.skinBright, c.skin, 0.45) : c.skinBright || c.skin) || '#e8b99a', { lift: 0.0, sat: 1.0, minL: 0.25, maxL: 0.88 });
  const rawHair = fix(c.hair || c.brow) || '#3a2a20';
  const hh = {};
  new THREE.Color(rawHair).getHSL(hh, THREE.SRGBColorSpace);
  const grey = hh.s < 0.16 && hh.l > 0.5;
  const light = !grey && hh.l > 0.45;
  const hairCol = grey ? tidy(rawHair, { lift: 0.02, sat: 0.3, maxL: 0.8 })
    : light ? tidy(rawHair, { lift: 0.06, sat: 1.35, maxL: 0.75 })
    : tidy(rawHair, { lift: -0.04, sat: 1.1, minL: 0.06, maxL: 0.8 });
  return {
    name,
    mono,
    kid,
    skin,
    hair: hairCol,
    brow: mix(tidy(c.brow || c.hair || '#3a2a20', { lift: -0.02, sat: 1.1 }), hairCol, 0.4),
    eye: lightEyes ? tidy(fix(c.iris), { lift: 0.08, sat: 2.2, maxL: 0.6 }) : tidy(fix(c.iris || '#3a2a22'), { lift: 0, sat: 1.4, minL: 0.1, maxL: 0.24 }),
    lightEyes,
    lip: c.lip || '#d98b8f',
    shirt: c.shirt ? tidy(fix(c.shirt), { lift: 0.08, sat: 1.25, minL: 0.15, maxL: 0.85 }) : SHIRTS[Math.floor(r() * SHIRTS.length)],
    pants: PANTS[Math.floor(r() * PANTS.length)],
    shoes: SHOES[Math.floor(r() * SHOES.length)],
    // head shape (caricatured around population means)
    sx: clamp(1.13 - ((g.faceH ?? 1.2) - 1.2) * 0.9, 1.02, 1.26),
    sy: clamp(0.96 + ((g.faceH ?? 1.2) - 1.2) * 1.5, 0.84, 1.12),
    jaw: clamp(0.5 + ((g.jaw ?? 0.81) - 0.81) / 0.04, 0, 1),
    eyeScale: clamp(1 + ((g.eyeW ?? 0.19) - 0.19) / 0.02 * 0.18, 0.78, 1.25) * (kid ? 1.15 : 1),
    eyeOpen: clamp(0.88 + ((g.eyeOpen ?? 0.3) - 0.3) * 4, 0.62, 1.2),
    eyeGap: clamp(0.36 + ((g.eyeGap ?? 0.24) - 0.24) * 1.6, 0.3, 0.44),
    squint,
    smileSquash: smile > 0.6 && !squint ? clamp(1 - (smile - 0.6) * 0.6, 0.78, 1) : 1,
    browThick: clamp(0.65 + (c.skin && c.brow ? (hexLum(c.skin) - hexLum(c.brow)) / Math.max(0.05, hexLum(c.skin)) : 0.5) * 0.7, 0.65, 1.3),
    browTilt: clamp((g.browTilt ?? 0) * 3, -0.35, 0.35),
    mouthW: clamp(1 + ((g.mouthW ?? 0.42) - 0.42) / 0.05 * 0.15, 0.75, 1.35),
    mouth: smile > 0.7 || (g.open ?? 0) > 0.25 ? 'grin' : smile > 0.35 ? 'smile' : 'neutral',
    nose: clamp(1 + ((g.noseW ?? 0.27) - 0.27) * 3, 0.8, 1.3),
    // hair
    hairLength: length,
    sideLen: side,
    bangs: (H.bangs ?? 0) > 0.25,
    volume: clamp(((H.width ?? 0.72) - 0.7) * 2.2, 0, 0.6),
    recede: (H.recede ?? 0) > 0.55 ? clamp(((H.recede ?? 0) - 0.5) * 6, 0.3, 1) : 0,
    part: (H.fringeSide ?? 0) > 0.08 ? -1 : (H.fringeSide ?? 0) < -0.08 ? 1 : r() < 0.5 ? -1 : 1,
    messy: clamp(((H.texture ?? 0.4) - 0.35) * 3, 0, 1),
    curly: (H.texture ?? 0) > 0.54,
    brows: t.brows || null,
    tuft: false,
    headwear: (H.headwear ?? 0) > 0.15 ? tidy(c.headwear || '#c0392b', { sat: 1.3 }) : null,
    glasses: glassesOn ? tidy(c.glasses || '#222222', { lift: -0.02, sat: 1.2, maxL: 0.45 }) : null,
    glassesSize: clamp((t.glasses?.h || 0.23) / 0.23, 0.8, 1.3),
    glassesThick: clamp(0.6 + (t.glasses?.seg ?? 0.1) * 4, 0.7, 1.6),
    earrings: (t.earrings ?? 0) > 0.02,
    tint: glassesOn && (t.glasses.lens ?? 1) < 0.28,
    beard: beardAmt > 0.3 ? beardAmt : 0,
    blush: 0.55 + r() * 0.2,
    pattern: ['plain', 'stripes', 'collar', 'emblem', 'stripes', 'emblem'][Math.floor(r() * 6)],
    emblem: ['heart', 'star', 'flower'][Math.floor(r() * 3)],
    height: kid ? 0.82 : 0.96 + r() * 0.08,
  };
}

// ---------------------------------------------------------------- materials
const matCache = new Map();
function soft(hex, { kind = 'default', rim = 0.16, gloss = 0, side, extra = {} } = {}) {
  return paint(hex, gloss ? 'hair' : kind, {
    rim: Math.min(rim, 0.25), ring: gloss ? 0.6 : 0, side,
    transparent: !!extra.transparent, opacity: extra.opacity,
  });
}
function basic(hex, extra = {}) {
  const key = 'b|' + hex + JSON.stringify(extra);
  let m = matCache.get(key);
  if (!m) matCache.set(key, (m = new THREE.MeshBasicMaterial({ color: hex, ...extra })));
  return m;
}
const texCache = new Map();
function radialTex(inner, outer) {
  const key = inner + outer;
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
export function blobShadowMaterial() {
  return basic('#ffffff', { map: radialTex('rgba(40,60,30,0.32)', 'rgba(40,60,30,0)'), transparent: true, depthWrite: false });
}

const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}
const SPHERE = () => cached('sphere', () => new THREE.SphereGeometry(1, 28, 20));
const mesh = (geo, material) => new THREE.Mesh(geo, material);

// Painted strand lines: vertical streaks, tileable horizontally (u = around, v = along).
let strandTexture = null;
function strandTex() {
  if (strandTexture) return strandTexture;
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  const r = rng(5);
  for (let i = 0; i < 26; i++) {
    const x = r() * 256, w = 1.5 + r() * 3.5, a = 0.25 + r() * 0.45;
    for (const dx of [-256, 0, 256]) {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, `rgba(0,0,0,${a * 0.3})`); gr.addColorStop(0.5, `rgba(0,0,0,${a})`); gr.addColorStop(1, `rgba(0,0,0,${a * 0.6})`);
      g.strokeStyle = gr; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x + dx, 0); g.bezierCurveTo(x + dx + 6, 90, x + dx - 6, 170, x + dx + 3, 256); g.stroke();
    }
  }
  strandTexture = new THREE.CanvasTexture(cv);
  strandTexture.wrapS = strandTexture.wrapT = THREE.RepeatWrapping;
  return strandTexture;
}

// ---------------------------------------------------------------- head surface
function makeHeadFrame(P) {
  const SZ = 0.96;
  const deform = (d) => {
    let x = d.x * P.sx, y = d.y * P.sy, z = d.z * SZ;
    // fuller cheeks just below the eyes, a slightly rounder back of the head
    const cheek = 1 + 0.06 * Math.exp(-Math.pow((d.y + 0.38) / 0.24, 2)) * (d.z > 0 ? 1 : 0.4);
    x *= cheek;
    if (d.z < 0) z *= 1.05;
    if (d.y < 0) {
      // soft rounded jaw: narrower for pointed chins, fuller for square ones
      const t = Math.pow(-d.y, 1.7);
      const k = 1 - (1 - P.jaw) * 0.14 * t - 0.13 * t;
      x *= k; z *= 1 - 0.04 * t; y *= 1 - 0.06 * t;
    }
    return V(x, y, z);
  };
  const normalAt = (p) => V(p.x / (P.sx * P.sx), p.y / (P.sy * P.sy), p.z / (SZ * SZ)).normalize();
  const dirYP = (yaw, pitch) => V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const dirTP = (th, phi) => V(Math.sin(th) * Math.sin(phi), Math.cos(th), Math.sin(th) * Math.cos(phi));
  const surface = (yaw, pitch, out = 0) => {
    const p = deform(dirYP(yaw, pitch));
    const n = normalAt(p);
    return { p: p.addScaledVector(n, out), n };
  };
  const hp = (th, phi, rf) => deform(dirTP(th, phi)).multiplyScalar(rf);
  return { deform, surface, normalAt, hp, dirTP };
}

function place(obj, s, spin = 0) {
  obj.position.copy(s.p);
  obj.quaternion.setFromUnitVectors(Z, s.n);
  if (spin) obj.rotateZ(spin);
  return obj;
}

// ---------------------------------------------------------------- hair pieces
// Tapered, slightly flattened tube along a curve: the basic "lock" of hair.
function lockGeo(pts, r0, { flat = 0.42, tip = 0.05, belly = 0.45 } = {}) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const TS = 22, RS = 10;
  const g = new THREE.TubeGeometry(curve, TS, 1, RS, false);
  const pos = g.attributes.position;
  const v = V(0, 0, 0), o = V(0, 0, 0), n = V(0, 0, 0);
  for (let i = 0; i <= TS; i++) {
    const t = i / TS;
    const c = curve.getPointAt(t);
    n.copy(c).normalize();
    // rounded tip: radius follows a quarter-ellipse over the last 30%
    const end = t > 0.7 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.7) / 0.3, 2))) : 1;
    const r = Math.max(tip, r0 * end * (1 - belly + belly * Math.sin(Math.min(1, t * 2.2 + 0.25) * Math.PI / 2)));
    for (let j = 0; j <= RS; j++) {
      const k = i * (RS + 1) + j;
      v.fromBufferAttribute(pos, k);
      o.copy(v).sub(c);
      o.addScaledVector(n, -o.dot(n) * (1 - flat));
      v.copy(c).addScaledVector(o, r);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  const uvA = g.attributes.uv;
  for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getY(i) * 0.5, uvA.getX(i));
  return g;
}

// Swept hair "cap": for each azimuth a profile runs from the crown down the
// skull and, past ~100deg, hangs straight down. Its reach at the front / side
// / back defines the base silhouette; locks add the shape on top.
function hairShell(P, F, spec) {
  const NU = 96, NV = 30, TH = 1.75;
  const pos = [], idx = [], rimPts = [], uvs = [];
  const point = (l, phi) => {
    const th = Math.min(l, TH);
    const p = F.hp(th, phi, spec.rf(th, phi));
    if (l > TH) {
      const drop = l - TH;
      p.y -= drop * P.sy;
      const flare = 1 + drop * 0.06 + spec.volume * 0.05 * drop;
      p.x *= flare; p.z *= flare;
      if (p.z > 0.5) p.z = 0.5 + (p.z - 0.5) * 0.4;
    }
    return p;
  };
  for (let i = 0; i <= NU; i++) {
    const phi = (i / NU) * Math.PI * 2;
    const c = Math.cos(phi);
    const wf = Math.pow(Math.max(c, 0), 1.4), wb = Math.pow(Math.max(-c, 0), 1.3), ws = 1 - wf - wb;
    let end = wf * spec.front + ws * spec.side + wb * spec.back;
    const start = spec.recede ? spec.recede * (wf * 1.7 + ws * 1.1 + wb * 0.55) : 0;
    if (end < start + 0.02) end = start + 0.02;
    for (let j = 0; j <= NV; j++) {
      const p = point(lerp(start, end, j / NV), phi);
      pos.push(p.x, p.y, p.z);
      uvs.push((i / NU) * 9, lerp(start, end, j / NV) / 2.2);
      if (j === NV && i < NU) rimPts.push(p);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = (i + 1) * (NV + 1) + j;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // rounded rim along the lower edge so the shell never looks paper-thin
  const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 160, 0.05, 8, true);
  return [g, rim];
}

// ---------------------------------------------------------------- sculpted (clay) hair
// Hair as one signed-distance field: a skull cap, side curtains, fringe clumps and curls
// blended with smooth-min like soft clay, the face carved away below the hairline,
// then meshed with marching cubes. Head-local units (head radius ~1, face toward +z).
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
function sdEll(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.hypot(px, py, pz), k1 = Math.hypot(px / rx, py / ry, pz / rz);
  return k1 > 1e-6 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}
function sdCone(x, y, z, a, b, r1, r2) {
  const bx = b[0] - a[0], by = b[1] - a[1], bz = b[2] - a[2];
  const px = x - a[0], py = y - a[1], pz = z - a[2];
  const t = clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return Math.hypot(px - bx * t, py - by * t, pz - bz * t) - lerp(r1, r2, t);
}
let MC = null;
function sculptHairGeometry(P) {
  const len = P.hairLength, sx = P.sx, sy = P.sy;
  const t = 0.09 + P.volume * 0.08 + (P.curly ? 0.03 : 0);
  const r = rng(hashStr((P.name || '') + 'clay'));
  // face surface z at (x, y) on the front of the head, plus an offset
  const faceZ = (x, y, off) => 0.96 * Math.sqrt(Math.max(0.02, 1 - (x / sx) ** 2 - (y / sy) ** 2)) + off;
  const part = P.part;
  const hl = (x) => P.bangs ? 0.16 * sy + 0.03 * Math.cos(x * 13)
    : (len === 'short' ? 0.5 : 0.46) * sy + 0.1 * part * x - 0.06 * Math.max(0, -part * x);
  const yEnd = len === 'short' ? -0.15 * sy : len === 'medium' ? -lerp(0.55, 1.05, clamp((P.sideLen - 0.5) / 0.7, 0, 1)) * sy : -2.1 * sy;

  // fringe clumps (tapered cones from the crown down to the hairline)
  const locks = [];
  if (!P.recede) {
    if (P.bangs) {
      for (let i = 0; i < 6; i++) {
        const x = lerp(-0.62, 0.62, i / 5) * sx;
        locks.push([[x * 0.6, 0.85 * sy, 0.45], [x, hl(x) + 0.03, faceZ(x, hl(x), 0.07)], 0.2, 0.085]);
      }
    } else {
      const n = len === 'short' ? 5 : 4;
      for (let i = 0; i < n; i++) {
        const x0 = lerp(-0.55, 0.55, i / (n - 1)) * sx;
        const x1 = x0 - part * 0.22, y1 = hl(x1) - 0.02;
        locks.push([[part * 0.2 + x0 * 0.4, 0.95 * sy, 0.3], [x1, y1, faceZ(x1, y1, 0.08)], 0.22, 0.07]);
      }
    }
  }
  if (len !== 'short') {
    for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) {
      const x = sd * (0.86 + k * 0.14) * sx;
      locks.push([[x * 0.95, 0.35 * sy, 0.35 - k * 0.3], [x * (1.04 + k * 0.03), yEnd + 0.12, 0.25 - k * 0.3], 0.2, 0.13]);
    }
  }
  // curls / tousled lumps over the cap
  const lumps = [];
  const nl = P.curly ? 48 : Math.round(P.messy * 12);
  for (let i = 0; i < nl; i++) {
    const th = Math.acos(1 - r() * 1.15), ph = r() * Math.PI * 2;
    const dx = Math.sin(th) * Math.sin(ph), dy = Math.cos(th), dz = Math.sin(th) * Math.cos(ph);
    if (dz > 0.4 && dy < 0.45) continue; // keep the forehead clear
    lumps.push([dx * (sx + t * 0.7), 0.04 + dy * (sy + t * 0.8 + 0.04), -0.05 + dz * (0.97 + t * 0.5), P.curly ? 0.12 + r() * 0.05 : 0.1 + r() * 0.04]);
  }

  const sdf = (x, y, z) => {
    let d = sdEll(x, y, z, 0, 0.05, -0.05, sx * (1 + t * 0.85), sy * (1 + t) + 0.05, 0.97 + t * 0.55);
    if (len !== 'short') {
      // side/back curtain: a rounded column hanging from the cap
      const ax = sx * (1.0 + t * 0.45) * (1 + 0.05 * Math.min(0, y)), az = 0.96 + t * 0.45;
      let c = (Math.hypot(x / ax, (z + 0.06) / az) - 1) * Math.min(ax, az);
      c = smax(c, yEnd - y, 0.18);
      c = smax(c, y - 0.4, 0.2);
      d = smin(d, c, 0.2);
    }
    for (const [a, b, r1, r2] of locks) d = smin(d, sdCone(x, y, z, a, b, r1, r2), 0.06);
    for (const [cx, cy, cz, rr] of lumps) d = smin(d, Math.hypot(x - cx, y - cy, z - cz) - rr, 0.05);
    if (len === 'short') {
      // trim above the ears at the sides, lower at the nape
      const back = clamp((0.25 - z) / 1.1, 0, 1);
      const yl = lerp(-0.02 * sy, -0.62 * sy, back);
      d = smax(d, yl - y, 0.08);
    }
    if (P.recede) d = smax(d, -sdEll(x, y, z, 0, 0.78 * sy, 0.25, 0.62 * sx, 0.42 + 0.25 * P.recede, 0.95), 0.08);
    // carve the face away below the hairline
    // rounded oval opening: wide at the cheeks, closing in under the chin
    const fw = (len === 'short' ? 1.0 : 0.82) * sx, fyc = -0.35 * sy, fh = 1.25 * sy;
    const oval = (Math.hypot(x / fw, (y - fyc) / fh) - 1) * Math.min(fw, fh);
    const face = smax(smax(oval, y - hl(x), 0.12), 0.05 - z, 0.1);
    d = smax(d, -face, 0.1);
    return d;
  };

  const RES = 88;
  const X0 = -1.7, X1 = 1.7, Y1 = 1.75, Y0 = Math.min(-0.9, yEnd - 0.35), Z0 = -1.7, Z1 = 1.7;
  if (!MC) MC = new MarchingCubes(RES, new THREE.MeshBasicMaterial(), false, false, 160000);
  MC.reset();
  MC.isolation = 0;
  const f = MC.field, N = MC.size;
  for (let k = 0; k < N; k++) {
    const z = Z0 + (Z1 - Z0) * (k / (N - 1));
    for (let j = 0; j < N; j++) {
      const y = Y0 + (Y1 - Y0) * (j / (N - 1));
      for (let i = 0; i < N; i++) {
        // keep the grid border empty so every surface closes
        const edge = i === 0 || j === 0 || k === 0 || i === N - 1 || j === N - 1 || k === N - 1;
        f[k * N * N + j * N + i] = edge ? -1 : -sdf(X0 + (X1 - X0) * (i / (N - 1)), y, z);
      }
    }
  }
  MC.update();
  const n = MC.count;
  const pos = new Float32Array(n * 3);
  const src = MC.positionArray;
  for (let v = 0; v < n; v++) {
    // MarchingCubes lays its grid over [-1, 1]; map back to head space
    pos[v * 3] = X0 + (X1 - X0) * (src[v * 3] + 1) / 2;
    pos[v * 3 + 1] = Y0 + (Y1 - Y0) * (src[v * 3 + 1] + 1) / 2;
    pos[v * 3 + 2] = Z0 + (Z1 - Z0) * (src[v * 3 + 2] + 1) / 2;
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  return g;
}

function buildHeadwear(P, F, grp, rf = () => 1.12 + P.volume * 0.12 + (P.curly ? 0.04 : 0)) {
    const bm = soft(P.headwear, { rough: 0.7, rim: 0.25 });
    const pts = [];
    for (let i = 0; i < 64; i++) {
      const phi = (i / 64) * Math.PI * 2, c = Math.cos(phi);
      const th = lerp(1.15, 0.72, (c + 1) / 2);
      pts.push(F.hp(th, phi, rf(th, phi) + 0.05));
    }
    grp.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.085, 10, true), bm));
    // bow
    const knot = new THREE.Group();
    const k1 = mesh(SPHERE(), bm); k1.scale.setScalar(0.1);
    for (const sd of [-1, 1]) {
      const loop = mesh(SPHERE(), bm);
      loop.scale.set(0.2, 0.12, 0.07);
      loop.position.set(sd * 0.17, 0.02, 0);
      loop.rotation.z = sd * 0.35;
      knot.add(loop);
    }
    knot.add(k1);
    const s = F.hp(0.95, -0.95, rf(0.95, -0.95) + 0.1);
    knot.position.copy(s);
    knot.quaternion.setFromUnitVectors(Z, s.clone().normalize());
    grp.add(knot);
}

function buildClayHair(P, F, grp) {
  grp.add(mesh(sculptHairGeometry(P), soft(P.hair, { gloss: 1, rim: 0.12 })));
}

function buildHair(P, F, grp) {
  if (P.clay !== false) {
    buildClayHair(P, F, grp);
    if (P.headwear) buildHeadwear(P, F, grp);
    return;
  }
  const len = P.hairLength;
  const hm = paintHair(P.hair, strandTex(), { side: THREE.DoubleSide });
  const base = (len === 'short' ? 1.05 : 1.065) + P.volume * 0.06;
  const rf = (th, phi) => base + P.volume * 0.07 * Math.sin(th) + 0.05 * Math.pow(Math.max(0, Math.cos(th)), 2)
    + (P.curly ? 0.055 * Math.sin(phi * 11 + Math.sin(th * 7) * 1.5) * Math.sin(th * 9) + 0.06 : 0.022 * Math.sin(phi * 13 + th * 2)) * Math.sin(Math.min(th, 1.6));
  const spec = {
    front: P.recede ? 0.9 : 0.95,
    side: len === 'short' ? 1.42 : len === 'medium' ? lerp(1.95, 2.35, clamp((P.sideLen - 0.5) / 0.4, 0, 1)) : 2.7,
    back: len === 'short' ? 1.95 : len === 'medium' ? 2.35 : 3.1,
    volume: P.volume, recede: P.recede, rf,
  };
  for (const g of hairShell(P, F, spec)) grp.add(mesh(g, hm));

  const jr = rng(hashStr(P.name || 'x'));
  const lock = (pts, r0, o) => {
    if (P.messy) pts = pts.map((p, i) => (i ? p.clone().add(V(jr() - 0.5, jr() - 0.5, jr() - 0.5).multiplyScalar(0.12 * P.messy)) : p));
    grp.add(mesh(lockGeo(pts, r0 * (1 + (P.messy ? (jr() - 0.5) * 0.3 : 0)), o), hm));
  };
  const at = (th, phi, k = 1) => F.hp(th, phi, rf(th, phi) * k);
  const part = P.part;

  if (!P.recede) {
    if (P.bangs) {
      // full fringe: rounded locks straight down to the brows
      const n = 6;
      for (let i = 0; i < n; i++) {
        const phi = lerp(-0.9, 0.9, i / (n - 1));
        lock([at(0.3, phi * 0.6, 0.96), at(0.75, phi * 0.9, 1.03), at(1.12, phi, 1.03), at(1.34, phi * 1.02, 0.99)], 0.3);
      }
    } else if (len === 'short') {
      // swept fringe: chunky locks fanning toward one side
      const n = 4;
      for (let i = 0; i < n; i++) {
        const phi = lerp(-0.75, 0.75, i / (n - 1));
        const sweep = -part * 0.35;
        lock([at(0.3, phi * 0.5, 0.96), at(0.66, phi + sweep * 0.3, 1.03), at(0.98, phi + sweep * 0.8, 1.03), at(1.16, phi + sweep, 0.99)], 0.32);
      }
    } else {
      // parted curtain: locks fall away from a side part
      const p0 = 0.18 * part;
      for (const sd of [-1, 1]) {
        const n = sd === part ? 1 : 2;
        for (let i = 0; i < n; i++) {
          const phi = p0 + sd * (0.25 + i * 0.42);
          lock([at(0.25, p0, 0.96), at(0.62, phi * 0.8, 1.03), at(1.05, phi + sd * 0.18, 1.03), at(1.3, phi + sd * 0.32, 0.99)], 0.33);
        }
      }
    }
  }
  if (len !== 'short' && !P.recede) {
    // locks framing the face, down to the measured length
    const drop = len === 'long' ? 1.35 : lerp(0.35, 0.8, clamp((P.sideLen - 0.5) / 0.4, 0, 1));
    for (const sd of [-1, 1]) for (const k of [0, 1]) {
      const phi = sd * (1.08 + k * 0.32);
      const a = at(1.0, phi, 0.98), b = at(1.6, phi, 1.02);
      const tip = b.clone().add(V(sd * 0.03, -drop * P.sy, -0.03 + k * -0.05));
      lock([a, b, b.clone().lerp(tip, 0.55).add(V(sd * 0.03, 0, 0)), tip], 0.24 + k * 0.03, { flat: 0.45 });
    }
  }
  if (len === 'long') {
    for (let i = 0; i < 6; i++) {
      const phi = Math.PI + lerp(-0.95, 0.95, i / 5);
      const a = at(1.2, phi, 0.98), b = at(1.75, phi, 1.02);
      const tip = b.clone().add(V(0, -1.4 * P.sy, 0)).multiply(V(1.02, 1, 1.02));
      lock([a, b, b.clone().lerp(tip, 0.6), tip], 0.3, { flat: 0.4 });
    }
  }
  if (P.kid && !P.headwear) {
    // little cowlick
    const top = F.hp(0, 0, base + 0.06);
    lock([top.clone().add(V(0, -0.1, 0)), top.clone().add(V(0.02, 0.18, 0.02)), top.clone().add(V(0.14, 0.3, -0.02)), top.clone().add(V(0.24, 0.22, -0.05))], 0.08, { flat: 0.8, belly: 0 });
  }
  if (P.headwear) buildHeadwear(P, F, grp, rf);
}

// ---------------------------------------------------------------- face
// Features are drawn as 2D artwork on a canvas mapped onto the front of the head
// in yaw/pitch space (same coordinates as F.surface), so they stay crisp.
const FACE_S = 1024, FACE_K = 320; // canvas px, px per radian
function faceCanvas(P, geo, closed) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = FACE_S;
  const g = cv.getContext('2d');
  const X = (yaw) => FACE_S / 2 + yaw * FACE_K, Y = (p) => FACE_S / 2 - p * FACE_K;
  const kx = (p) => FACE_K / (P.sx * Math.cos(p)), ky = FACE_K / P.sy;
  const { S, gap, pitchEye, ex, ey, mouthPitch } = geo;
  const ink = shade(mix(P.hair, '#2a1a24', 0.6), -0.05);
  g.lineCap = 'round'; g.lineJoin = 'round';

  // blush
  for (const sd of [-1, 1]) {
    const cx = X(sd * (gap + 0.2 + (S.blushK - 1) * 0.08)), cy = Y(pitchEye - 0.22), rx = 0.17 * S.blushK * kx(pitchEye - 0.22), ry = 0.1 * S.blushK * ky;
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, `rgba(255,118,138,${(P.blush * 0.8).toFixed(2)})`);
    gr.addColorStop(0.6, `rgba(255,128,148,${(P.blush * 0.45).toFixed(2)})`);
    gr.addColorStop(1, 'rgba(255,140,160,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill();
    g.restore();
    if (P.mouth === 'grin') {
      g.strokeStyle = 'rgba(232,96,116,0.55)'; g.lineWidth = 4;
      for (let i = -1; i <= 1; i++) {
        g.beginPath(); g.moveTo(cx + i * rx * 0.38 - 6, cy + 7); g.lineTo(cx + i * rx * 0.38 + 6, cy - 7); g.stroke();
      }
    }
  }

  // stubble: soft speckle over the jaw, fading up toward the cheeks
  if (P.beard) {
    const r = rng(11), col = new THREE.Color(mix(P.hair, '#000000', 0.25));
    col.convertLinearToSRGB();
    const rgb = [col.r, col.g, col.b].map((v) => Math.round(v * 255)).join(',');
    for (let i = 0; i < 2600 * P.beard; i++) {
      const yaw = (r() - 0.5) * 1.9, pitch = mouthPitch + 0.08 - r() * 0.75;
      const edge = Math.abs(yaw) / 0.95, up = (pitch - (mouthPitch - 0.5)) / 0.6;
      if (edge > 1 || r() < Math.max(edge * edge, up)) continue;
      if (Math.abs(yaw) < 0.2 && Math.abs(pitch - mouthPitch) < 0.06) continue;
      g.fillStyle = `rgba(${rgb},${(0.25 + r() * 0.3).toFixed(2)})`;
      g.beginPath(); g.arc(X(yaw), Y(pitch), 1.6 + r() * 1.6, 0, Math.PI * 2); g.fill();
    }
  }

  // eyes
  const irisDark = shade(P.eye, -0.12, 1.1), irisLight = shade(P.eye, P.lightEyes ? 0.18 : 0.12, 1.2);
  for (const sd of [-1, 1]) {
    const cx = X(sd * gap), cy = Y(pitchEye), rx = ex * kx(pitchEye), ry = ey * ky;
    g.strokeStyle = ink; g.fillStyle = ink;
    if (P.squint) {
      g.lineWidth = rx * 0.34;
      g.beginPath(); g.ellipse(cx, cy + ry * 0.25, rx * 0.92, ry * 0.55, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
      continue;
    }
    if (closed) {
      g.lineWidth = rx * 0.26;
      g.beginPath(); g.ellipse(cx, cy - ry * 0.05, rx * 0.95, ry * 0.32, 0, Math.PI * 0.08, Math.PI * 0.92); g.stroke();
      continue;
    }
    if (S.eyes === 'sclera') {
      // white of the eye, iris + pupil, lid line
      const wrx = rx * 1.02, wry = ry * 1.0;
      g.fillStyle = '#fffdf8';
      g.beginPath(); g.ellipse(cx, cy, wrx, wry, 0, 0, Math.PI * 2); g.fill();
      g.save(); g.beginPath(); g.ellipse(cx, cy, wrx, wry, 0, 0, Math.PI * 2); g.clip();
      const ir = Math.min(wrx, wry) * 0.92, ix = cx - sd * wrx * 0.04, iy = cy + wry * 0.04;
      const ig = g.createRadialGradient(ix, iy + ir * 0.3, ir * 0.1, ix, iy, ir);
      ig.addColorStop(0, irisLight); ig.addColorStop(0.75, irisDark); ig.addColorStop(1, '#2a1d26');
      g.fillStyle = ig; g.beginPath(); g.arc(ix, iy, ir, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#160f18'; g.beginPath(); g.arc(ix, iy, ir * 0.46, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(40,20,40,0.18)'; g.fillRect(cx - wrx, cy - wry, wrx * 2, wry * 0.35);
      g.restore();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(ix + ir * 0.32, iy - ir * 0.36, ir * 0.3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(ix - ir * 0.35, iy + ir * 0.38, ir * 0.12, 0, Math.PI * 2); g.fill();
      g.strokeStyle = ink; g.lineWidth = rx * 0.13;
      g.beginPath(); g.ellipse(cx, cy, wrx, wry, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.lineWidth = rx * 0.05; g.strokeStyle = 'rgba(60,30,40,0.35)';
      g.beginPath(); g.ellipse(cx, cy, wrx, wry, 0, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
      continue;
    }
    if (S.eyes === 'bean') {
      const brx = rx * 0.58, bry = ry * 0.78;
      g.fillStyle = '#271c27';
      g.beginPath(); g.ellipse(cx, cy, brx, bry, 0, 0, Math.PI * 2); g.fill();
      if (P.lightEyes) { g.fillStyle = irisLight; g.globalAlpha = 0.55; g.beginPath(); g.ellipse(cx, cy + bry * 0.45, brx * 0.7, bry * 0.35, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; }
      g.fillStyle = '#ffffff';
      g.beginPath(); g.ellipse(cx + brx * 0.25, cy - bry * 0.38, brx * 0.36, bry * 0.26, -0.4, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(cx - brx * 0.3, cy + bry * 0.4, brx * 0.13, 0, Math.PI * 2); g.fill();
      continue;
    }
    // body: dark top fading into the iris colour
    const gr = g.createLinearGradient(cx, cy - ry, cx, cy + ry);
    gr.addColorStop(0, '#1b1320'); gr.addColorStop(0.45, irisDark); gr.addColorStop(1, irisLight);
    g.fillStyle = gr;
    g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.fill();
    // pupil
    g.fillStyle = 'rgba(16,10,20,0.85)';
    g.beginPath(); g.ellipse(cx, cy - ry * 0.08, rx * (P.lightEyes ? 0.46 : 0.58), ry * (P.lightEyes ? 0.5 : 0.62), 0, 0, Math.PI * 2); g.fill();
    // upper lid line with a small outer flick
    g.lineWidth = rx * 0.2;
    g.beginPath(); g.ellipse(cx, cy + ry * 0.02, rx * 1.03, ry * 1.03, 0, Math.PI * 1.12, Math.PI * 1.9); g.stroke();
    const ox = cx + sd * rx * 0.98, oy = cy - ry * 0.28;
    g.lineWidth = rx * 0.14;
    g.beginPath(); g.moveTo(ox - sd * rx * 0.1, oy - ry * 0.05); g.quadraticCurveTo(ox + sd * rx * 0.2, oy - ry * 0.12, ox + sd * rx * 0.3, oy - ry * 0.32); g.stroke();
    if (S.eyes === 'lash') {
      g.lineWidth = rx * 0.09;
      for (const k of [0, 1]) {
        const a = Math.PI * (1.62 + k * 0.14) * (sd > 0 ? 1 : 1);
        const ang = sd > 0 ? Math.PI * (1.7 + k * 0.13) : Math.PI * (1.3 - k * 0.13);
        const bx = cx + Math.cos(ang) * rx * 1.03, by = cy + Math.sin(ang) * ry * 1.03;
        g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(ang) * rx * 0.28 + sd * rx * 0.08, by + Math.sin(ang) * ry * 0.22); g.stroke();
      }
    }
    // highlights
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(cx + rx * 0.3, cy - ry * 0.4, rx * 0.34, ry * 0.26, -0.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(cx - rx * 0.36, cy + ry * 0.42, rx * 0.13, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath(); g.ellipse(cx, cy + ry * 0.72, rx * 0.4, ry * 0.08, 0, 0, Math.PI * 2); g.fill();
  }

  // brows: tapered strokes along the traced shape (or a default soft arch)
  g.fillStyle = mix(P.brow, P.skin, 0.22);
  for (const sd of [-1, 1]) {
    const real = P.brows && P.brows.find((b) => b.u === sd);
    const yaw = sd * gap;
    let pts, thick;
    if (real) {
      const rp = real.pts;
      const mu = rp.reduce((a, p) => a + p[0], 0) / rp.length, mv = rp.reduce((a, p) => a + p[1], 0) / rp.length;
      thick = rp.reduce((a, p) => a + p[2], 0) / rp.length;
      const yaw0 = yaw + sd * 0.02 + mu * 0.6, pitch0 = pitchEye + ey + 0.075 + (-mv - 0.12) * 0.8;
      const inner = rp[0][1];
      pts = rp.map((p, i) => [X(yaw0 + (p[0] - mu) * 1.6), Y(pitch0 - (p[1] - mv) * 1.3 + (i === 0 ? Math.max(0, inner - mv) * 0.9 : i === 1 ? Math.max(0, inner - mv) * 0.4 : 0))]);
    } else {
      thick = 0.04;
      pts = [-0.6, -0.3, 0, 0.3, 0.6].map((t) => [X(yaw + t * 0.2 * sd), Y(pitchEye + ey + 0.075 + (0.09 - t * t * 0.25) * 0.4)]);
    }
    const w0 = clamp(0.028 + (thick - 0.035) * 0.7, 0.02, 0.05) * P.browThick * ky * S.brow;
    const left = [], right = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      const w = w0 * (1 - (i / (pts.length - 1)) * 0.65) / 2;
      left.push([p[0] + nx * w, p[1] + ny * w]); right.push([p[0] - nx * w, p[1] - ny * w]);
    });
    g.beginPath();
    left.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p)));
    right.reverse().forEach((p) => g.lineTo(...p));
    g.closePath(); g.fill();
    g.lineWidth = w0 * 0.35; g.strokeStyle = g.fillStyle; g.stroke();
  }

  // nose: a soft little shadow
  if (S.nose !== 'none') {
    const cx = X(0), cy = Y(pitchEye - 0.17);
    g.fillStyle = 'rgba(190,95,90,0.32)';
    if (S.nose === 'dot') { g.fillStyle = 'rgba(200,100,95,0.5)'; g.beginPath(); g.ellipse(cx, cy, 0.03 * kx(pitchEye) * P.nose, 0.022 * ky, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.arc(cx + 4, cy - 4, 3, 0, Math.PI * 2); g.fill(); }
    else { g.beginPath(); g.ellipse(cx, cy, 0.04 * kx(pitchEye) * P.nose, 0.022 * ky, 0, 0, Math.PI * 2); g.fill(); }
  }

  // mouth
  {
    const cx = X(0), cy = Y(mouthPitch), mk = kx(mouthPitch) * S.mouthK;
    if (S.eyes === 'bean' && P.mouth !== 'grin') {
      // little omega mouth
      const rx = 0.04 * P.mouthW * mk;
      g.strokeStyle = '#6a2232'; g.lineWidth = 5.5;
      for (const sd of [-1, 1]) { g.beginPath(); g.arc(cx + sd * rx, cy, rx, 0.15, Math.PI - 0.15); g.stroke(); }
    } else if (P.mouth === 'grin') {
      const rx = 0.13 * P.mouthW * mk, ry = 0.11 * P.mouthW * ky;
      const path = () => { g.beginPath(); g.moveTo(cx - rx, cy); g.quadraticCurveTo(cx, cy + ry * 0.12, cx + rx, cy); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI); g.closePath(); };
      path(); g.fillStyle = '#6a2232'; g.fill();
      g.save(); path(); g.clip();
      g.fillStyle = '#fffaf3'; g.fillRect(cx - rx, cy - 4, rx * 2, ry * 0.32 + 4);
      g.fillStyle = '#f08595'; g.beginPath(); g.ellipse(cx, cy + ry * 0.95, rx * 0.55, ry * 0.45, 0, 0, Math.PI * 2); g.fill();
      g.restore();
      path(); g.strokeStyle = '#561b29'; g.lineWidth = 3; g.stroke();
    } else if (P.mouth === 'smile') {
      const rx = 0.08 * P.mouthW * mk;
      g.strokeStyle = '#6a2232'; g.lineWidth = 6.5;
      g.beginPath(); g.moveTo(cx - rx, cy - 6); g.quadraticCurveTo(cx, cy + 16, cx + rx, cy - 6); g.stroke();
    } else {
      const rx = 0.05 * P.mouthW * mk;
      g.strokeStyle = '#6a2232'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(cx - rx, cy); g.quadraticCurveTo(cx, cy + 3, cx + rx, cy); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function faceDecalGeo(F) {
  const SPAN = FACE_S / 2 / FACE_K;
  const g = new THREE.SphereGeometry(1, 120, 90, Math.PI / 2 - SPAN, SPAN * 2, Math.PI / 2 - 1.3, 2.6);
  const pos = g.attributes.position, uvA = g.attributes.uv;
  const v = V(0, 0, 0);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const yaw = Math.atan2(v.x, v.z), pitch = Math.asin(clamp(v.y, -1, 1));
    uvA.setXY(i, 0.5 + yaw * FACE_K / FACE_S, 0.5 + pitch * FACE_K / FACE_S);
    const p = F.deform(v).multiplyScalar(1.002);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}

function buildFace(P, F, grp, S) {
  const skinM = soft(P.skin, { kind: 'skin' });
  const pitchEye = S.pitchEye;
  const ex = 0.155 * P.eyeScale * S.eyeK, ey = 0.2 * P.eyeScale * P.eyeOpen * (P.smileSquash ?? 1) * S.eyeK;
  const gap = P.eyeGap + 0.04 + S.gapAdd;
  const geo = { S, gap, pitchEye, ex, ey, mouthPitch: pitchEye - (P.mouth === 'grin' ? 0.29 : 0.31) * (S.eyes === 'bean' ? 0.75 : 1) };

  const dg = faceDecalGeo(F);
  const open = mesh(dg, paintTex(faceCanvas(P, geo, false), 'skin', { alpha: true, rim: 0 }));
  const shut = mesh(dg, paintTex(faceCanvas(P, geo, true), 'skin', { alpha: true, rim: 0 }));
  shut.visible = false;
  open.renderOrder = shut.renderOrder = 1;
  grp.add(open, shut);

  for (const sd of [-1, 1]) {
    const ear = mesh(SPHERE(), skinM);
    ear.scale.set(0.09, 0.15, 0.11);
    ear.position.copy(F.surface(sd * 1.5, pitchEye - 0.05, -0.03).p);
    grp.add(ear);
  }
  if (S.nose === 'bump') {
    const nose = mesh(SPHERE(), skinM);
    nose.scale.set(0.045 * P.nose, 0.034, 0.03);
    place(nose, F.surface(0, pitchEye - 0.15, -0.005));
    grp.add(nose);
  }

  if (P.glasses) {
    const frameM = soft(P.glasses, { rough: 0.3, rim: 0.15 });
    const R = Math.max(ex, ey) * 1.2 * P.glassesSize;
    const centers = [];
    for (const sd of [-1, 1]) {
      const s = F.surface(sd * gap, pitchEye, 0.08);
      const ring = mesh(cached('frame' + P.glassesThick.toFixed(1), () => {
        const pts = [];
        for (let k = 0; k < 48; k++) {
          const a = (k / 48) * Math.PI * 2, c = Math.cos(a), s2 = Math.sin(a);
          pts.push(V(Math.sign(c) * Math.pow(Math.abs(c), 0.6) * 1.1, Math.sign(s2) * Math.pow(Math.abs(s2), 0.6) * 0.86, 0));
        }
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, 0.075 * P.glassesThick, 8, true);
      }), frameM);
      ring.scale.setScalar(R);
      place(ring, s);
      grp.add(ring);
      if (P.tint) {
        const lens = mesh(cached('lens', () => new THREE.CircleGeometry(1, 28)),
          basic('#2a3442', { transparent: true, opacity: 0.45, depthWrite: false }));
        lens.scale.set(R * 1.08, R * 0.84, 1);
        place(lens, s);
        grp.add(lens);
      }
      centers.push({ s, sd });
    }
    const rod = (a, b, r) => {
      const c = mesh(cached('rod', () => new THREE.CylinderGeometry(1, 1, 1, 8)), frameM);
      c.scale.set(r, a.distanceTo(b), r);
      c.position.copy(a).add(b).multiplyScalar(0.5);
      c.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
      grp.add(c);
    };
    const [L, Rr] = centers;
    rod(L.s.p.clone().add(V(R * 1.08, R * 0.3, 0)), Rr.s.p.clone().add(V(-R * 1.08, R * 0.3, 0)), 0.018);
    for (const { s, sd } of centers) rod(s.p.clone().add(V(sd * R * 1.12, R * 0.3, -0.02)), F.surface(sd * 1.42, pitchEye + 0.05, 0.05).p, 0.016);
  }
  if (P.earrings) {
    const gold = soft('#f2c14e', { rough: 0.25, rim: 0.3 });
    for (const sd of [-1, 1]) {
      const hoop = mesh(cached('hoop', () => new THREE.TorusGeometry(0.075, 0.016, 8, 24)), gold);
      hoop.position.copy(F.surface(sd * 1.45, pitchEye - 0.32, 0.02).p);
      hoop.rotation.y = Math.PI / 2;
      grp.add(hoop);
    }
  }
  return { blink(on) { open.visible = !on; shut.visible = on; } };
}

// ---------------------------------------------------------------- body
function shirtTexture(P) {
  const key = 'shirt|' + P.shirt + P.pattern + P.emblem;
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 256;
  const g = cv.getContext('2d');
  const lum = hexLum(P.shirt);
  const accent = lum > 0.35 ? shade(P.shirt, -0.22, 1.1) : shade(P.shirt, 0.25, 0.9);
  g.fillStyle = P.shirt;
  g.fillRect(0, 0, 512, 256);
  if (P.pattern === 'stripes') {
    g.fillStyle = accent;
    for (let y = 40; y < 256; y += 44) g.fillRect(0, y, 512, 16);
  } else if (P.pattern === 'collar') {
    g.fillStyle = accent;
    g.fillRect(0, 0, 512, 34);
    g.fillRect(0, 236, 512, 20);
  } else if (P.pattern === 'emblem') {
    g.fillStyle = accent;
    g.save();
    g.translate(256, 92);
    if (P.emblem === 'heart') {
      g.beginPath();
      g.moveTo(0, 28);
      g.bezierCurveTo(-46, -4, -26, -40, 0, -16);
      g.bezierCurveTo(26, -40, 46, -4, 0, 28);
      g.fill();
    } else if (P.emblem === 'star') {
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 14 : 34, a = -Math.PI / 2 + (i * Math.PI) / 5;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.fill();
    } else {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        g.beginPath(); g.arc(Math.cos(a) * 18, Math.sin(a) * 18, 14, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#ffe27a';
      g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

const torsoGeo = () => cached('torso', () => new THREE.LatheGeometry([
  V(0.001, 0, 0), V(0.4, 0.0, 0), V(0.47, 0.08, 0), V(0.49, 0.3, 0),
  V(0.44, 0.55, 0), V(0.33, 0.7, 0), V(0.16, 0.77, 0), V(0.001, 0.78, 0),
].map((p) => new THREE.Vector2(p.x, p.y)), 40, Math.PI));

// Push photo skin toward a warm, saturated toy tone (keeps relative lightness).
function warmSkin(hex, S) {
  const c = new THREE.Color(hex), h = {};
  c.getHSL(h, THREE.SRGBColorSpace);
  const w = S.warm || 0;
  c.setHSL(lerp(h.h, 0.055, w), clamp(h.s * (S.skinSat || 1) * (1 + w * 0.5), 0, 0.78), clamp(h.l + w * 0.05, 0.2, 0.88), THREE.SRGBColorSpace);
  return '#' + c.getHexString();
}

// Hair gets more saturation (and a little warmth for light hair) in the toy styles.
function toyHair(hex, S) {
  const w = S.warm || 0;
  if (!w) return hex;
  const c = new THREE.Color(hex), h = {};
  c.getHSL(h, THREE.SRGBColorSpace);
  if (h.s < 0.12 && h.l > 0.45) return hex; // grey stays grey
  const light = h.l > 0.42;
  c.setHSL(light ? lerp(h.h, 0.11, w * 0.6) : h.h, clamp(h.s * (1 + w * (light ? 1.6 : 0.6)), 0, 0.8), clamp(h.l + (light ? w * 0.08 : w * 0.03), 0, 0.85), THREE.SRGBColorSpace);
  return '#' + c.getHexString();
}

function buildBody(P, S, body, { skinM, shirtM, pantsM }) {
  const legs = [], arms = [];
  const shoeM = soft(P.shoes, { kind: 'cloth', rim: 0.2 });
  if (S.body === 'lithe') {
    for (const sd of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sd * 0.13, 0.74, 0);
      const l = mesh(cached('legL', () => new THREE.CapsuleGeometry(0.09, 0.44, 6, 14)), pantsM);
      l.position.y = -0.33;
      const shoe = mesh(SPHERE(), shoeM);
      shoe.scale.set(0.135, 0.1, 0.22);
      shoe.position.set(0, -0.67, 0.06);
      leg.add(l, shoe); body.add(leg); legs.push(leg);
    }
    const hips = mesh(SPHERE(), pantsM); hips.scale.set(0.33, 0.17, 0.27); hips.position.y = 0.78; body.add(hips);
    const torso = mesh(cached('torsoL', () => new THREE.LatheGeometry([
      [0.001, 0], [0.34, 0], [0.39, 0.07], [0.37, 0.3], [0.31, 0.52], [0.22, 0.66], [0.1, 0.72], [0.001, 0.73],
    ].map(([x, y]) => new THREE.Vector2(x, y)), 36, Math.PI)), shirtM);
    torso.position.y = 0.72; body.add(torso);
    for (const sd of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sd * 0.27, 1.32, 0);
      const sleeve = mesh(cached('sleeve', () => new THREE.CapsuleGeometry(0.095, 0.08, 6, 12)), shirtM); sleeve.position.y = -0.07;
      const a = mesh(cached('armL', () => new THREE.CapsuleGeometry(0.06, 0.28, 6, 12)), skinM); a.position.y = -0.26;
      const hand = mesh(SPHERE(), skinM); hand.scale.setScalar(0.105); hand.position.y = -0.47;
      arm.add(sleeve, a, hand); arm.rotation.z = sd * 0.7; body.add(arm); arms.push(arm);
    }
    return { legs, arms, torso, neckTop: 1.4, headLift: 0.86, armRest: 0.7 };
  }
  if (S.body === 'bean') {
    for (const sd of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(sd * 0.16, 0.14, 0.02);
      const foot = mesh(SPHERE(), shoeM); foot.scale.set(0.12, 0.08, 0.15); foot.position.y = -0.07;
      leg.add(foot); body.add(leg); legs.push(leg);
    }
    const torso = mesh(cached('torsoB', () => new THREE.LatheGeometry([
      [0.001, 0], [0.28, 0], [0.4, 0.1], [0.43, 0.28], [0.37, 0.46], [0.22, 0.58], [0.001, 0.61],
    ].map(([x, y]) => new THREE.Vector2(x, y)), 36, Math.PI)), shirtM);
    torso.position.y = 0.08; body.add(torso);
    for (const sd of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sd * 0.36, 0.5, 0);
      const a = mesh(cached('armB', () => new THREE.CapsuleGeometry(0.08, 0.06, 6, 12)), shirtM); a.position.y = -0.07;
      const hand = mesh(SPHERE(), skinM); hand.scale.setScalar(0.085); hand.position.y = -0.17;
      arm.add(a, hand); arm.rotation.z = sd * 0.5; body.add(arm); arms.push(arm);
    }
    return { legs, arms, torso, neckTop: 0.62, headLift: 0.78, armRest: 0.5 };
  }
  // stubby (default)
  for (const sd of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sd * 0.17, 0.4, 0);
    const l = mesh(cached('leg', () => new THREE.CapsuleGeometry(0.13, 0.14, 6, 14)), pantsM);
    l.position.y = -0.14;
    const shoe = mesh(SPHERE(), soft(P.shoes, { kind: 'cloth', rim: 0.2 }));
    shoe.scale.set(0.16, 0.11, 0.21);
    shoe.position.set(0, -0.3, 0.04);
    leg.add(l, shoe);
    body.add(leg);
    legs.push(leg);
  }
  const hips = mesh(SPHERE(), pantsM);
  hips.scale.set(0.42, 0.2, 0.36);
  hips.position.y = 0.42;
  body.add(hips);

  const torso = mesh(torsoGeo(), shirtM);
  torso.position.y = 0.38;
  body.add(torso);

  // short arms with mitten hands
  for (const sd of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(sd * 0.38, 0.98, 0);
    const a = mesh(cached('arm', () => new THREE.CapsuleGeometry(0.1, 0.2, 6, 14)), shirtM);
    a.position.y = -0.16;
    const hand = mesh(SPHERE(), skinM);
    hand.scale.set(0.12, 0.12, 0.11);
    hand.position.y = -0.36;
    arm.add(a, hand);
    arm.rotation.z = sd * 0.35;
    body.add(arm);
    arms.push(arm);
  }

  return { legs, arms, torso, neckTop: 1.08, headLift: 0.9, armRest: 0.35 };
}

export function buildAvatar(P0) {
  const S = STYLES[P0.style] || STYLES.gumdrop;
  setBand(S.band);
  const P = { ...P0, sx: P0.sx * (S.sxK || 1), sy: P0.sy * (S.syK || 1),
    skin: warmSkin(P0.skin, S), hair: toyHair(P0.hair, S) };
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.scale.setScalar(P.height);
  const skinM = soft(P.skin, { kind: 'skin' });
  const shirtM = paintTex(shirtTexture(P), 'cloth');
  const pantsM = soft(P.pants, { kind: 'cloth' });

  const shadow = mesh(cached('shadowq', () => new THREE.PlaneGeometry(1, 1)), blobShadowMaterial());
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  shadow.scale.setScalar(1.5 * P.height);
  shadow.renderOrder = -1;
  root.add(shadow);

  const B = buildBody(P, S, body, { skinM, shirtM, pantsM });
  const { legs, arms, torso } = B;

  // big head
  const head = new THREE.Group();
  const headScale = (P.kid ? 1.02 : 0.95) / P.height * S.headK;
  head.position.y = B.neckTop + P.sy * B.headLift * headScale;
  head.scale.setScalar(headScale);
  body.add(head);

  const F = makeHeadFrame(P);
  const hg = cached('headsphere', () => new THREE.SphereGeometry(1, 64, 48)).clone();
  const pos = hg.attributes.position;
  const v = V(0, 0, 0);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const p = F.deform(v);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  hg.computeVertexNormals();
  head.add(mesh(hg, skinM));
  const face = buildFace(P, F, head, S);
  buildHair(P, F, head);

  if (S.outline) {
    const meshes = [];
    root.traverse((o) => { if (o.isMesh && !o.material.transparent && o.material.side !== THREE.DoubleSide && o !== shadow) meshes.push(o); });
    for (const m of meshes) {
      const sc = (Math.abs(m.scale.x) + Math.abs(m.scale.y) + Math.abs(m.scale.z)) / 3 || 1;
      const ol = new THREE.Mesh(m.geometry, outlineMat('#4a2e34', S.outline / sc));
      m.add(ol);
    }
  }

  const st = { phase: Math.random() * 10, blinkAt: 1 + Math.random() * 4, blink: 0, hop: 0, wave: 0, walk: 0 };
  root.userData.headCenterY = head.position.y * P.height;
  root.userData.headTopY = (head.position.y + (P.sy * 1.25 + (P.headwear ? 0.1 : 0) + P.volume * 0.2 + (P.kid ? 0.3 : 0)) * headScale) * P.height;

  function update(t, dt, opts = {}) {
    const { speed = 0, lookYaw = 0, lookPitch = 0 } = opts;
    const ph = t + st.phase;
    st.walk += dt * speed * 11;
    const walking = speed > 0.02;
    const breathe = Math.sin(ph * 2.2);
    torso.scale.set(1 + breathe * 0.01, 1 + breathe * 0.02, 1 + breathe * 0.01);
    let lift = walking ? Math.abs(Math.sin(st.walk)) * 0.07 : 0;
    let squash = 1;
    if (st.hop > 0) {
      st.hop = Math.max(0, st.hop - dt * 2);
      const k = 1 - st.hop;
      lift += Math.sin(k * Math.PI) * 0.5;
      squash = k < 0.12 ? 1 - (0.12 - k) * 1.2 : 1 + Math.sin(k * Math.PI) * 0.06;
    }
    body.position.y = lift;
    body.scale.set(P.height / Math.sqrt(squash), P.height * squash, P.height / Math.sqrt(squash));
    const sw = walking ? Math.sin(st.walk) * 0.7 : 0;
    legs[0].rotation.x = sw; legs[1].rotation.x = -sw;
    arms[0].rotation.x = -sw * 0.9; arms[1].rotation.x = sw * 0.9;
    arms[0].rotation.z = -B.armRest - breathe * 0.04;
    if (st.wave > 0) {
      st.wave = Math.max(0, st.wave - dt * 0.6);
      arms[1].rotation.z = 2.5 + Math.sin(t * 14) * 0.35;
      arms[1].rotation.x = 0;
    } else {
      arms[1].rotation.z = B.armRest + breathe * 0.04;
    }
    head.rotation.y = lerp(head.rotation.y, clamp(lookYaw, -0.6, 0.6) + Math.sin(ph * 0.5) * 0.08, Math.min(1, dt * 4));
    head.rotation.x = lerp(head.rotation.x, clamp(lookPitch, -0.25, 0.25), Math.min(1, dt * 4));
    head.rotation.z = Math.sin(ph * 0.7) * 0.07;
    st.blinkAt -= dt;
    if (st.blinkAt < 0) { st.blink = 0.14; st.blinkAt = 2 + Math.random() * 4; }
    if (st.blink > 0) st.blink -= dt;
    face.blink(st.blink > 0 && !P.squint);
  }

  return {
    root,
    update,
    hop() { if (st.hop <= 0) st.hop = 1; },
    wave() { st.wave = 1.6; },
  };
}
