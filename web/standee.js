// An illustrated character (AI-generated cut-out) shown as a standee on the island:
// a flat card that always turns to the camera, with bob / waddle / hop / squash so it
// still feels alive. Same API as buildAvatar() so the crowd code treats both alike.

import * as THREE from 'three';
import { blobShadowMaterial } from './avatar.js';

const loader = new THREE.TextureLoader();
const plane = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);

export function buildStandee(src, P) {
  const H = P.kid ? 2.6 : 3.0;
  const root = new THREE.Group();
  const card = new THREE.Group();
  root.add(card);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobShadowMaterial());
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.01;
  shadow.scale.set(1.5, 1.1, 1);
  root.add(shadow);

  const mat = new THREE.MeshBasicMaterial({ alphaTest: 0.45, side: THREE.DoubleSide });
  const m = new THREE.Mesh(plane, mat);
  m.scale.set(0.001, 0.001, 1);
  card.add(m);
  loader.load(src, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    mat.map = tex;
    mat.needsUpdate = true;
    m.scale.set(H * tex.image.width / tex.image.height, H, 1);
  });
  root.userData.headTopY = H + 0.05;
  root.userData.headCenterY = H * 0.68;

  const st = { phase: Math.random() * 10, hop: 0, wave: 0, walk: 0 };
  function update(t, dt, opts = {}) {
    const { speed = 0, lookYaw = 0 } = opts;
    const ph = t + st.phase;
    st.walk += dt * speed * 11;
    const walking = speed > 0.02;
    card.rotation.y = lookYaw; // always face the camera
    let lift = walking ? Math.abs(Math.sin(st.walk)) * 0.08 : 0;
    let sq = 1 + Math.sin(ph * 2.2) * 0.012; // breathing
    if (st.hop > 0) {
      st.hop = Math.max(0, st.hop - dt * 2);
      const k = 1 - st.hop;
      lift += Math.sin(k * Math.PI) * 0.5;
      sq *= k < 0.12 ? 1 - (0.12 - k) * 1.4 : 1 + Math.sin(k * Math.PI) * 0.07;
    }
    if (st.wave > 0) st.wave = Math.max(0, st.wave - dt * 0.6);
    card.position.y = lift;
    card.scale.set(1 / Math.sqrt(sq), sq, 1);
    // waddle while walking, a gentle sway when idle, a happy wiggle when waved at
    m.rotation.z = walking ? Math.sin(st.walk) * 0.07 : Math.sin(ph * 0.9) * 0.025 + (st.wave > 0 ? Math.sin(t * 12) * 0.08 : 0);
  }
  return {
    root,
    update,
    billboard: true,
    hop() { if (st.hop <= 0) st.hop = 1; },
    wave() { st.wave = 1.2; },
  };
}
