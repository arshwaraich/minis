// Traits (from extract.js) -> chibi params -> procedural Three.js character.
// Style: big soft head, stubby body, sculpted glossy hair locks, big shiny
// eyes, rim-lit pastel materials. All geometry is procedural (no art assets).

import * as THREE from 'three';
import { float, dot, normalView, positionViewDirection, normalWorld, smoothstep, color } from 'three/tsl';

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

export function traitsToParams(t, name = '') {
  const r = rng(hashStr(name || JSON.stringify(t.color || {})));
  const g = t.geo || {};
  const c = t.color || {};
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

  const skin = tidy(fix(c.skinBright || c.skin) || '#e8b99a', { lift: 0.04, sat: 0.9, minL: 0.25, maxL: 0.9 });
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
function rimNode(rim, rimColor, gloss) {
  const fres = float(1).sub(dot(normalView, positionViewDirection).clamp(0, 1)).pow(2.4);
  let em = color(rimColor).mul(fres).mul(rim);
  if (gloss) {
    // a soft "halo" highlight band across the upper part of hair
    const ny = normalWorld.y;
    const band = smoothstep(0.3, 0.48, ny).mul(float(1).sub(smoothstep(0.58, 0.78, ny)));
    em = em.add(color('#ffffff').mul(band).mul(gloss));
  }
  return em;
}
function soft(hex, { rim = 0.32, rimColor = '#fff3e8', rough = 0.62, gloss = 0, side, extra = {} } = {}) {
  const key = [hex, rim, rimColor, rough, gloss, side, JSON.stringify(extra)].join('|');
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardNodeMaterial({ color: hex, roughness: rough, metalness: 0, ...extra });
    if (side) m.side = side;
    m.emissiveNode = rimNode(rim, rimColor, gloss);
    matCache.set(key, m);
  }
  return m;
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

// ---------------------------------------------------------------- head surface
function makeHeadFrame(P) {
  const SZ = 0.96;
  const deform = (d) => {
    let x = d.x * P.sx, y = d.y * P.sy, z = d.z * SZ;
    if (d.y < 0) {
      // soft rounded jaw: narrower for pointed chins, fuller for square ones
      const t = Math.pow(-d.y, 1.7);
      const k = 1 - (1 - P.jaw) * 0.18 * t - 0.05 * t;
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
  return g;
}

// Swept hair "cap": for each azimuth a profile runs from the crown down the
// skull and, past ~100deg, hangs straight down. Its reach at the front / side
// / back defines the base silhouette; locks add the shape on top.
function hairShell(P, F, spec) {
  const NU = 96, NV = 30, TH = 1.75;
  const pos = [], idx = [], rimPts = [];
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
      if (j === NV && i < NU) rimPts.push(p);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
    const a = i * (NV + 1) + j, b = (i + 1) * (NV + 1) + j;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // rounded rim along the lower edge so the shell never looks paper-thin
  const rim = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 160, 0.05, 8, true);
  return [g, rim];
}

function buildHair(P, F, grp) {
  const len = P.hairLength;
  const hm = soft(P.hair, { rough: 0.45, gloss: 0.09, rim: 0.12, rimColor: shade(P.hair, 0.35), side: THREE.DoubleSide });
  const base = (len === 'short' ? 1.06 : 1.08) + P.volume * 0.1;
  const rf = (th, phi) => base + P.volume * 0.12 * Math.sin(th) + 0.05 * Math.pow(Math.max(0, Math.cos(th)), 2)
    + 0.022 * Math.sin(phi * 13 + th * 2) * Math.sin(Math.min(th, 1.6));
  const spec = {
    front: P.recede ? 0.9 : 0.95,
    side: len === 'short' ? 1.42 : len === 'medium' ? lerp(1.95, 2.35, clamp((P.sideLen - 0.5) / 0.4, 0, 1)) : 2.7,
    back: len === 'short' ? 1.95 : len === 'medium' ? 2.35 : 3.1,
    volume: P.volume, recede: P.recede, rf,
  };
  for (const g of hairShell(P, F, spec)) grp.add(mesh(g, hm));
  if (P.curly) {
    const cr = rng(hashStr((P.name || '') + 'curl'));
    const n = len === 'short' ? 70 : 110;
    for (let i = 0; i < n; i++) {
      const phi = cr() * Math.PI * 2, c = Math.cos(phi);
      const wf = Math.max(c, 0), wb = Math.max(-c, 0);
      const maxTh = len === 'short' ? 1.2 + wb * 0.5 : 1.0 + (1 - wf) * 0.9;
      const th = Math.acos(1 - cr() * (1 - Math.cos(Math.min(maxTh, 1.75))));
      const b = mesh(SPHERE(), hm);
      b.scale.setScalar(0.1 + cr() * 0.07);
      b.position.copy(F.hp(th, phi, rf(th, phi) + 0.02));
      grp.add(b);
    }
  }

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
  if (P.headwear) {
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
}

function stubbleTex(col, density) {
  const key = 'stub|' + col + density.toFixed(2);
  if (texCache.has(key)) return texCache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  const r = rng(7);
  g.fillStyle = col;
  for (let i = 0; i < 1400 * density; i++) {
    const x = r() * 512, y = r() * 128;
    // fade out toward the cheeks (top of the shell) and the shell's sides
    const fade = Math.min(1, (y / 128) * 2.2) * Math.min(1, Math.min(x, 512 - x) / 90);
    if (r() > fade) continue;
    g.globalAlpha = 0.35 + r() * 0.4;
    g.beginPath(); g.arc(x, y, 1.6 + r() * 1.4, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

// ---------------------------------------------------------------- face
function buildFace(P, F, grp) {
  const skinM = soft(P.skin);
  const eyeM = soft(P.eye, { rough: 0.12, rim: 0.1 });
  const whiteM = basic('#ffffff');
  const darkM = soft('#2a2230', { rough: 0.15, rim: 0.05 });
  const eyes = [];
  const pitchEye = -0.2;
  const ex = 0.13 * P.eyeScale, ey = 0.17 * P.eyeScale * P.eyeOpen * (P.smileSquash ?? 1);
  const gap = P.eyeGap + 0.04;

  for (const sd of [-1, 1]) {
    const yaw = sd * gap;
    const g = new THREE.Group();
    place(g, F.surface(yaw, pitchEye, 0.0));
    if (P.squint) {
      const arc = mesh(cached('arc', () => new THREE.TorusGeometry(0.1, 0.03, 10, 24, Math.PI)), darkM);
      arc.scale.setScalar(P.eyeScale);
      arc.position.y = -0.04;
      g.add(arc);
    } else {
      const e = mesh(SPHERE(), eyeM);
      e.scale.set(ex, ey, 0.05);
      g.add(e);
      {
        const pu = mesh(SPHERE(), basic('#140f16'));
        pu.scale.set(ex * (P.lightEyes ? 0.5 : 0.62), ey * (P.lightEyes ? 0.55 : 0.66), 0.04);
        pu.position.set(0, -ey * 0.05, 0.02);
        g.add(pu);
      }
      const hl = mesh(SPHERE(), whiteM);
      hl.scale.set(0.05 * P.eyeScale, 0.06 * P.eyeScale, 0.02);
      hl.position.set(-0.04 * P.eyeScale * sd * -1 - 0.0, ey * 0.42, 0.045);
      hl.position.x = -0.035 * P.eyeScale;
      const hl2 = mesh(SPHERE(), whiteM);
      hl2.scale.set(0.022 * P.eyeScale, 0.022 * P.eyeScale, 0.02);
      hl2.position.set(0.05 * P.eyeScale, -ey * 0.45, 0.045);
      g.add(hl, hl2);
    }
    grp.add(g);
    eyes.push(g);

    const real = P.brows && P.brows.find((b) => b.u === sd);
    if (real) {
      // brow traced from the photo's landmarks, exaggerated a little
      const pts = real.pts;
      const mu = pts.reduce((a, p) => a + p[0], 0) / pts.length, mv = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const thick = pts.reduce((a, p) => a + p[2], 0) / pts.length;
      const yaw0 = yaw + sd * 0.02 + mu * 0.6, pitch0 = pitchEye + ey + 0.12 + (-mv - 0.12) * 1.0;
      // shape from the photo, but keep the inner end from dipping (reads as angry)
      const inner = pts[0][1];
      const curve = pts.map((p, i) => F.surface(yaw0 + (p[0] - mu) * 1.6,
        pitch0 - (p[1] - mv) * 1.3 + (i === 0 ? Math.max(0, inner - mv) * 0.9 : i === 1 ? Math.max(0, inner - mv) * 0.4 : 0), 0.018).p);
      const r0 = clamp(0.016 + (thick - 0.035) * 0.5, 0.013, 0.034) * P.browThick;
      grp.add(mesh(lockGeo(curve, r0, { flat: 0.5, tip: r0 * 0.45, belly: 0.1 }), soft(P.brow, { rim: 0.05 })));
    } else {
    // brow: short rounded dash
    const bg = new THREE.Group();
    place(bg, F.surface(yaw + sd * 0.03, pitchEye + ey + 0.13, 0.012));
    const b = mesh(cached('brow', () => new THREE.CapsuleGeometry(0.028, 0.1, 4, 10)), soft(P.brow, { rim: 0.05 }));
    b.rotation.z = Math.PI / 2 + sd * (P.browTilt - 0.08);
    b.scale.set(P.browThick, 1, 0.5);
    bg.add(b);
    grp.add(bg);
    }

    // cheek blush: soft gradient disc
    const bl = mesh(cached('blushq', () => new THREE.PlaneGeometry(1, 1)),
      basic('#ffffff', { map: radialTex(`rgba(255,120,140,${P.blush.toFixed(2)})`, 'rgba(255,120,140,0)'), transparent: true, depthWrite: false }));
    place(bl, F.surface(sd * (gap + 0.22), pitchEye - 0.24, 0.012));
    bl.scale.set(0.34, 0.24, 1);
    grp.add(bl);

    const ear = mesh(SPHERE(), skinM);
    ear.scale.set(0.09, 0.15, 0.11);
    ear.position.copy(F.surface(sd * 1.5, pitchEye - 0.05, -0.03).p);
    grp.add(ear);
  }

  // nose: a tiny rounded bump
  const nose = mesh(SPHERE(), soft(shade(P.skin, -0.04, 1.1)));
  nose.scale.set(0.05 * P.nose, 0.04, 0.035);
  place(nose, F.surface(0, pitchEye - 0.15, 0));
  grp.add(nose);

  // mouth
  const m = new THREE.Group();
  place(m, F.surface(0, pitchEye - (P.mouth === 'grin' ? 0.29 : 0.31), P.beard ? 0.025 : 0.006));
  const mouthM = soft('#8c2f3f', { rough: 0.5, rim: 0 });
  if (P.mouth === 'grin') {
    const r = 0.13 * P.mouthW;
    const d = mesh(cached('grin', () => new THREE.CircleGeometry(1, 28, Math.PI, Math.PI)), mouthM);
    d.scale.set(r, r * 0.85, 1);
    // top row of teeth: a flat half-ellipse tucked under the mouth's straight edge
    const teeth = mesh(cached('grin', () => new THREE.CircleGeometry(1, 28, Math.PI, Math.PI)), basic('#fffaf2'));
    teeth.scale.set(r * 0.9, r * 0.28, 1);
    teeth.position.set(0, -0.004, 0.001);
    m.add(teeth);
    const tongue = mesh(cached('tongue', () => new THREE.CircleGeometry(1, 20)), soft('#f2848f', { rim: 0 }));
    tongue.scale.set(r * 0.5, r * 0.32, 1);
    tongue.position.set(0, -r * 0.55, 0.002);
    m.add(d, tongue);
  } else {
    if (P.mouth === 'neutral') {
      const line = mesh(cached('flat', () => new THREE.TorusGeometry(0.3, 0.014, 8, 16, 0.32)), mouthM);
      line.rotation.z = Math.PI * 1.5 - 0.16;
      line.position.y = 0.29;
      line.scale.x = P.mouthW;
      m.add(line);
      grp.add(m);
      return finishFace();
    }
    // a small ":3"-ish smile made of two short arcs
    const arcM = mouthM;
    const w = P.mouth === 'smile' ? 1 : 0.8;
    for (const sd of [-1, 1]) {
      const a = mesh(cached('mini', () => new THREE.TorusGeometry(0.045, 0.014, 8, 16, Math.PI)), arcM);
      a.rotation.z = Math.PI;
      a.position.x = sd * 0.045 * w * P.mouthW;
      a.scale.x = w * P.mouthW;
      m.add(a);
    }
  }
  grp.add(m);
  return finishFace();

  function finishFace() {
  // stubble: dotted shell over the jaw
  if (P.beard) {
    const g = cached('beardshell', () => new THREE.SphereGeometry(1, 40, 16, Math.PI / 2 - 1.05, 2.1, 2.2, 0.85)).clone();
    const pos = g.attributes.position;
    const v = V(0, 0, 0);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const p = F.deform(v).multiplyScalar(1.012);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    g.computeVertexNormals();
    grp.add(mesh(g, soft(mix(P.hair, P.skin, 0.4), {
      rim: 0, extra: { transparent: true, opacity: 0.16 + P.beard * 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 },
    })));
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
  return { eyes };
  }
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

export function buildAvatar(P) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.scale.setScalar(P.height);
  const skinM = soft(P.skin);
  const shirtM = new THREE.MeshStandardNodeMaterial({ map: shirtTexture(P), roughness: 0.75 });
  shirtM.emissiveNode = rimNode(0.25, '#fff3e8', 0);
  const pantsM = soft(P.pants, { rough: 0.8 });

  const shadow = mesh(cached('shadowq', () => new THREE.PlaneGeometry(1, 1)), blobShadowMaterial());
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  shadow.scale.setScalar(1.5 * P.height);
  shadow.renderOrder = -1;
  root.add(shadow);

  // stubby legs + round shoes
  const legs = [];
  for (const sd of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(sd * 0.17, 0.4, 0);
    const l = mesh(cached('leg', () => new THREE.CapsuleGeometry(0.13, 0.14, 6, 14)), pantsM);
    l.position.y = -0.14;
    const shoe = mesh(SPHERE(), soft(P.shoes, { rough: 0.45 }));
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
  const arms = [];
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

  // big head
  const head = new THREE.Group();
  const headScale = (P.kid ? 1.02 : 0.95) / P.height;
  head.position.y = 1.08 + P.sy * 0.9 * headScale;
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
  const face = buildFace(P, F, head);
  buildHair(P, F, head);

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
    arms[0].rotation.z = -0.35 - breathe * 0.04;
    if (st.wave > 0) {
      st.wave = Math.max(0, st.wave - dt * 0.6);
      arms[1].rotation.z = 2.5 + Math.sin(t * 14) * 0.35;
      arms[1].rotation.x = 0;
    } else {
      arms[1].rotation.z = 0.35 + breathe * 0.04;
    }
    head.rotation.y = lerp(head.rotation.y, clamp(lookYaw, -0.6, 0.6) + Math.sin(ph * 0.5) * 0.08, Math.min(1, dt * 4));
    head.rotation.x = lerp(head.rotation.x, clamp(lookPitch, -0.25, 0.25), Math.min(1, dt * 4));
    head.rotation.z = Math.sin(ph * 0.7) * 0.07;
    st.blinkAt -= dt;
    if (st.blinkAt < 0) { st.blink = 0.14; st.blinkAt = 2 + Math.random() * 4; }
    if (st.blink > 0) st.blink -= dt;
    const ey = st.blink > 0 && !P.squint ? 0.12 : 1;
    for (const e of face.eyes) e.scale.y = ey;
  }

  return {
    root,
    update,
    hop() { if (st.hop <= 0) st.hop = 1; },
    wave() { st.wave = 1.6; },
  };
}
