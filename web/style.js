// Shared art direction: every surface goes through one stylised "paint" shader
// so characters and island read as one illustration, not default 3D.
//  - half-lambert light from a fixed key direction, softened into a band
//  - shadows tinted (warm/rosy for skin, violet for hair, cool for the rest)
//  - soft top fill + gentle rim on the lit side
//  - optional painted highlight ring for hair
// Unlit (MeshBasicNodeMaterial) so it's identical on WebGPU and WebGL 2.

import * as THREE from 'three';
import { float, vec3, dot, normalWorld, normalView, positionViewDirection, smoothstep, mix, color, texture } from 'three/tsl';

const KEY = vec3(0.42, 0.78, 0.6).normalize();
const SHADOW = {
  skin: [0.9, 0.74, 0.7],
  hair: [0.62, 0.58, 0.74],
  cloth: [0.74, 0.72, 0.86],
  ground: [0.72, 0.8, 0.82],
  wood: [0.72, 0.62, 0.7],
  default: [0.76, 0.72, 0.84],
};

export function litNode(base, kind = 'default', { rim = 0.16, ring = 0, ringColor = null } = {}) {
  const t = SHADOW[kind] || SHADOW.default;
  const ndl = dot(normalWorld, KEY).mul(0.5).add(0.5);
  const band = smoothstep(0.36, 0.6, ndl);
  const shadow = base.mul(vec3(t[0], t[1], t[2]));
  let c = mix(shadow, base, band);
  c = c.add(base.mul(normalWorld.y.max(0).mul(0.04)));
  const facing = dot(normalView, positionViewDirection).clamp(0, 1);
  const fres = float(1).sub(facing).pow(3);
  c = c.add(vec3(1, 0.96, 0.9).mul(fres.mul(band.mul(0.7).add(0.3)).mul(rim)));
  if (ring) {
    // painted highlight band, crisp edges, only where the key light reaches
    const ny = normalView.y;
    const r = smoothstep(0.42, 0.5, ny).mul(float(1).sub(smoothstep(0.66, 0.74, ny))).mul(band);
    c = mix(c, ringColor, r.mul(ring));
  }
  return c;
}

const cache = new Map();
export function paint(hex, kind = 'default', opts = {}) {
  const key = [hex, kind, JSON.stringify(opts)].join('|');
  let m = cache.get(key);
  if (m) return m;
  m = new THREE.MeshBasicNodeMaterial();
  const base = color(hex);
  let ringColor = null;
  if (opts.ring) {
    const hc = new THREE.Color(hex), hsl = {};
    hc.getHSL(hsl, THREE.SRGBColorSpace);
    hc.setHSL(hsl.h, Math.min(1, hsl.s * 0.9), Math.min(0.92, hsl.l + 0.22 + (1 - hsl.l) * 0.08), THREE.SRGBColorSpace);
    ringColor = color('#' + hc.getHexString());
  }
  m.colorNode = litNode(base, kind, { ...opts, ringColor });
  if (opts.side) m.side = opts.side;
  if (opts.transparent) { m.transparent = true; m.opacity = opts.opacity ?? 1; m.depthWrite = false; }
  cache.set(key, m);
  return m;
}

// Hair: base colour modulated by painted strand lines (texture), lit with the hair ring.
export function paintHair(hex, strandTex, { side } = {}) {
  const m = new THREE.MeshBasicNodeMaterial();
  const hc = new THREE.Color(hex), hsl = {};
  hc.getHSL(hsl, THREE.SRGBColorSpace);
  hc.setHSL(hsl.h, Math.min(1, hsl.s * 0.9), Math.min(0.92, hsl.l + 0.2 + (1 - hsl.l) * 0.08), THREE.SRGBColorSpace);
  const base = color(hex).mul(texture(strandTex).r.mul(0.38).add(0.62));
  m.colorNode = litNode(base, 'hair', { rim: 0.14, ring: 0.6, ringColor: color('#' + hc.getHexString()) });
  if (side) m.side = side;
  return m;
}

// Textured version (shirts, painted faces): texture colour goes through the same light.
export function paintTex(tex, kind = 'default', { alpha = false, rim = 0.12 } = {}) {
  const m = new THREE.MeshBasicNodeMaterial();
  const s = texture(tex);
  m.colorNode = litNode(s.rgb, kind, { rim });
  if (alpha) {
    m.opacityNode = s.a;
    m.transparent = true;
    m.depthWrite = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
  }
  return m;
}
