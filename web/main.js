import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/CSS2DRenderer.js';
import { traitsToParams, buildAvatar, blobShadowMaterial, STYLES } from './avatar.js';
import { traitLabels } from './labels.js';
import { paint } from './style.js';

const qs = new URLSearchParams(location.search);
const $ = (s) => document.querySelector(s);
const LOCAL_KEY = 'minis.added.v1';
const STYLE_OPTS = Object.fromEntries(Object.entries(STYLES).map(([k, v]) => [k, v.label]));
const pickStyle = (v) => (v && STYLE_OPTS[v] ? v : null);
const STYLE = pickStyle(qs.get('style')) || pickStyle(localStorage.getItem('minis.style')) || 'sprout';

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true, forceWebGL: qs.has('gl') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping;
$('#stage').appendChild(renderer.domElement);
await renderer.init();
$('#backend').textContent = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';

const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
labels.domElement.className = 'labels';
$('#stage').appendChild(labels.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);
const controls = new OrbitControls(camera, labels.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = 1.38;
controls.minDistance = 4;
controls.maxDistance = 45;
controls.enablePan = false;

scene.add(new THREE.HemisphereLight('#fffdf5', '#f3dcc0', 2.0));
const sun = new THREE.DirectionalLight('#fff1dc', 1.5);
sun.position.set(6, 12, 8);
scene.add(sun, sun.target);

// ------------------------------------------------------------------ island
const island = new THREE.Group();
scene.add(island);
function buildIsland(R) {
  island.clear();
  const M = (c, kind = 'ground') => paint(c, kind, { rim: 0.08 });
  // water, sand rim, grass plateau with a soft bevel
  const water = new THREE.Mesh(new THREE.CircleGeometry(R * 30, 64), M('#93d8dc'));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.9;
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.9, R + 1.6, 0.8, 72), M('#f5e3b5'));
  sand.position.y = -1.0;
  const cliff = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.99, R * 1.02, 0.7, 72), M('#dcb48c', 'wood'));
  cliff.position.y = -0.5;
  const grass = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.16, 72), M('#a2d873'));
  grass.position.y = -0.08;
  const bevel = new THREE.Mesh(new THREE.TorusGeometry(R, 0.08, 8, 96), M('#a2d873'));
  bevel.rotation.x = Math.PI / 2;
  island.add(water, sand, cliff, grass, bevel);
  // darker grass patches
  const patchM = M('#93cf68');
  const rnd = mulberry(7);
  for (let i = 0; i < R * 2; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (R - 1.2);
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.5 + rnd() * 0.9, 24), patchM);
    p.rotation.x = -Math.PI / 2;
    p.position.set(Math.cos(a) * r, 0.005, Math.sin(a) * r);
    p.scale.set(1, 0.6 + rnd() * 0.4, 1);
    island.add(p);
  }
  // round fruit-trees on the far side so the default view stays clear
  const trunkM = M('#a8774f', 'wood'), leafMs = ['#5cbd72', '#6fc87a', '#4dae69'].map((c) => M(c, 'default')), fruitM = M('#f27461', 'default');
  const shadowM = blobShadowMaterial();
  const trees = Math.round(R * 0.9);
  for (let i = 0; i < trees; i++) {
    const a = -Math.PI / 2 + (i / trees - 0.5) * Math.PI * 1.15 + rnd() * 0.2;
    const r = R - 0.9 - rnd() * 0.5;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.17, 0.9, 10), trunkM);
    trunk.position.y = 0.45;
    t.add(trunk);
    const lm = leafMs[i % 3];
    for (const [x, y, z, s] of [[0, 1.35, 0, 0.75], [0.35, 1.1, 0.1, 0.5], [-0.32, 1.12, -0.05, 0.52], [0.05, 1.8, 0, 0.5]]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), lm);
      l.position.set(x, y, z); l.scale.setScalar(s);
      t.add(l);
    }
    if (rnd() < 0.6) for (let k = 0; k < 3; k++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), fruitM);
      const fa = rnd() * Math.PI * 2;
      f.position.set(Math.cos(fa) * 0.62, 1.15 + rnd() * 0.4, Math.sin(fa) * 0.62);
      t.add(f);
    }
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shadowM);
    sh.rotation.x = -Math.PI / 2; sh.position.y = 0.012;
    t.add(sh);
    t.scale.setScalar(0.85 + rnd() * 0.4);
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    island.add(t);
  }
  // flowers: five petals around a yellow centre
  const petalMs = ['#ffffff', '#ffb3c7', '#ffd95e', '#c7b3ff', '#ff8f8f'].map((c) => M(c, 'default'));
  const centreM = M('#ffd34d', 'default');
  const pg = new THREE.SphereGeometry(0.06, 8, 6), cg = new THREE.SphereGeometry(0.045, 8, 6);
  for (let i = 0; i < R * 5; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (R - 0.5);
    const f = new THREE.Group();
    const pm = petalMs[Math.floor(rnd() * petalMs.length)];
    for (let k = 0; k < 5; k++) {
      const p = new THREE.Mesh(pg, pm);
      p.position.set(Math.cos((k / 5) * Math.PI * 2) * 0.07, 0, Math.sin((k / 5) * Math.PI * 2) * 0.07);
      p.scale.y = 0.4;
      f.add(p);
    }
    const c = new THREE.Mesh(cg, centreM); c.position.y = 0.02; f.add(c);
    f.position.set(Math.cos(a) * r, 0.04, Math.sin(a) * r);
    island.add(f);
  }
}
function mulberry(a) {
  return () => ((a = Math.imul(a ^ (a >>> 15), 1 | a) + 0x6d2b79f5 | 0), ((a ^ (a >>> 14)) >>> 0) / 4294967296);
}

// ------------------------------------------------------------------ crowd
const crowd = []; // {person, params, av, label, home, target, idle, speed}
const SPACING = 2.45;
const LINE = { SX: 1.7, SZ: 2.4, Z0: 1.4 };

function homeFor(i) {
  if (i === 0) return new THREE.Vector3(0, 0, 0);
  const r = SPACING * Math.sqrt(i) * 0.95;
  const a = i * 2.39996;
  return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
}

function islandRadius(n) {
  const lineHalf = ((Math.min(n, 14) - 1) * LINE.SX) / 2;
  return Math.max(5, SPACING * Math.sqrt(Math.max(1, n - 1)) * 0.95 + 2.6, lineHalf + 2.6);
}

function addPerson(person, traits) {
  const params = { ...traitsToParams(traits || {}, person.name), style: STYLE, ...(person.override || {}) };
  const av = buildAvatar(params);
  const i = crowd.length;
  const home = homeFor(i);
  av.root.position.copy(home);
  av.root.traverse((o) => { if (o.isMesh) o.userData.owner = i; });
  scene.add(av.root);

  const el = document.createElement('div');
  el.className = 'label';
  el.innerHTML = `<b class="n"></b><span></span>`;
  el.lastChild.textContent = person.name;
  el.addEventListener('click', () => select(i));
  el.addEventListener('pointerenter', () => hover(i));
  const label = new CSS2DObject(el);
  label.position.set(0, av.root.userData.headTopY + 0.25, 0);
  av.root.add(label);

  const c = { person, traits, params, av, el, home, target: home.clone(), path: [], wait: 0, idle: 1 + Math.random() * 5 };
  crowd.push(c);
  layout();
  return c;
}

function layout() {
  const R = islandRadius(crowd.length);
  buildIsland(R);
  crowd.forEach((c, i) => { c.home = homeFor(i); if (MODE === 'crowd') c.target.copy(c.home); });
  if (MODE === 'line') {
    // newcomers join the end of the line
    const missing = [...crowd.keys()].filter((i) => !order.includes(i));
    lineUp([...order, ...missing]);
    return;
  }
  const d = Math.max(10, R * 2.4) * (innerWidth < innerHeight ? Math.min(2.1, 0.95 * innerHeight / innerWidth) : 1);
  camera.position.set(0, d * 0.5, d);
  controls.target.set(0, 1.1, 0);
  controls.maxDistance = Math.max(45, d * 1.6);
    controls.update();
}

// ------------------------------------------------------------------ line-up & shuffle
// The crowd forms a line facing the camera in a random order (new order on every load).
// Shuffling walks everyone to their new spot: people moving right step out in front of
// the line, people moving left step out behind it, so they pass instead of colliding.
let MODE = 'crowd';
let order = [];
let camFly = null;

function lineGeometry(n) {
  const portrait = innerWidth < innerHeight * 0.9;
  const perRow = Math.max(1, Math.min(n, portrait ? 4 : 14));
  const rows = Math.ceil(n / perRow);
  const slots = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow), col = i % perRow;
    const inRow = row === rows - 1 ? n - row * perRow : perRow;
    // row 0 at the back so reading order (top-left first) matches line order
    slots.push(new THREE.Vector3((col - (inRow - 1) / 2) * LINE.SX, 0, LINE.Z0 - (rows - 1 - row) * LINE.SZ));
  }
  return { slots, perRow, rows };
}

function frameLine(G, dur = 1.6) {
  const W = (G.perRow - 1) * LINE.SX + 4.2, D = (G.rows - 1) * LINE.SZ;
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
  const multi = G.rows > 1;
  const d = Math.max(W / 2 / Math.tan(hfov / 2), ((multi ? D * 0.95 : 0) + 5.5) / 2 / Math.tan(fov / 2), 7);
  const tgt = new THREE.Vector3(0, multi ? 1.1 : 1.6, LINE.Z0 - D / 2);
  // several rows: look down more steeply so back rows aren't hidden behind the front
  const [up, back] = multi ? [0.72, 0.7] : [0.32, 0.95];
  flyTo(new THREE.Vector3(0, tgt.y + d * up, tgt.z + d * back), tgt, dur);
}
function flyTo(pos, tgt, dur) {
  camFly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt, t: 0, dur: Math.max(0.001, dur) };
}

function shuffledOrder(n, avoid) {
  let a;
  do {
    a = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  } while (n > 2 && avoid && a.every((v, i) => v === avoid[i]));
  return a;
}

function setLabel(c, n) {
  const b = c.el.firstChild;
  b.textContent = n ? String(n) : '';
  b.style.display = n ? '' : 'none';
}

function lineUp(newOrder) {
  const prev = new Map();
  if (MODE === 'line') order.forEach((ci, k) => prev.set(ci, k));
  order = newOrder;
  MODE = 'line';
  const G = lineGeometry(order.length);
  order.forEach((ci, k) => {
    const c = crowd[ci], slot = G.slots[k], pos = c.av.root.position;
    c.target = slot.clone();
    c.path = [];
    const dx = slot.x - pos.x;
    if (prev.has(ci) && Math.abs(dx) > 0.3) {
      const dir = dx > 0 ? 1 : -1;
      const lane = dir * Math.min(2.6, 1.0 + 0.1 * Math.abs(dx)); // longer trips walk further out
      c.path.push(new THREE.Vector3(pos.x, 0, pos.z + lane), new THREE.Vector3(slot.x, 0, slot.z + lane));
      c.wait = Math.random() * 0.3;
    } else {
      c.wait = prev.has(ci) ? 0 : Math.random() * 0.9;
    }
    c.path.push(slot.clone());
    setLabel(c, k + 1);
  });
  frameLine(G);
}

function shuffle() {
  if (crowd.length < 2) return;
  lineUp(shuffledOrder(crowd.length, MODE === 'line' ? order : null));
  for (const c of crowd) if (Math.random() < 0.5) c.av.hop();
}

// ------------------------------------------------------------------ interaction
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let hovered = -1;
function pick(ev) {
  ndc.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(crowd.map((c) => c.av.root), true).find((h) => h.object.userData.owner !== undefined);
  return hit ? hit.object.userData.owner : -1;
}
function hover(i) {
  if (i === hovered) return;
  if (hovered >= 0) crowd[hovered]?.el.classList.remove('hot');
  hovered = i;
  if (i >= 0) { crowd[i].el.classList.add('hot'); crowd[i].av.hop(); }
  labels.domElement.style.cursor = i >= 0 ? 'pointer' : '';
}
let downAt = null;
labels.domElement.addEventListener('pointermove', (e) => hover(pick(e)));
labels.domElement.addEventListener('pointerdown', (e) => (downAt = [e.clientX, e.clientY]));
labels.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  const i = pick(e);
  if (i >= 0) select(i); else closePanel();
});


function select(i) {
  const c = crowd[i];
  c.av.wave();
  c.av.hop();
  const sw = (col) => `<i style="background:${col}"></i>`;
  $('#panel').innerHTML = `
    <button class="x" aria-label="close">×</button>
    ${c.person.image ? `<img src="${c.person.image}" alt="">` : ''}
    <h2>${escapeHtml(c.person.name)}</h2>
    <div class="sw">${sw(c.params.skin)}${sw(c.params.hair)}${sw(c.params.shirt)}${c.params.glasses ? sw(c.params.glasses) : ''}</div>
    <div class="chips">${traitLabels(c.params).map((t) => `<span>${t}</span>`).join('')}</div>
    ${c.traits ? '' : '<p class="muted">No traits read from a photo; this one is random.</p>'}
    <p class="muted"><a href="compare.html${qs.get('src') ? '?src=' + encodeURIComponent(qs.get('src')) : ''}#${encodeURIComponent(c.person.name)}">See everyone side by side →</a></p>`;
  $('#panel').classList.add('open');
  $('#panel .x').onclick = closePanel;
}
function closePanel() { $('#panel').classList.remove('open'); }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

// ------------------------------------------------------------------ loading people
let extractMod = null;
async function traitsFor(person) {
  if (person.traits) return person.traits;
  if (!person.image) return null;
  extractMod ||= import('./extract.js');
  const { extractTraits } = await extractMod;
  return extractTraits(person.image);
}

async function loadList() {
  const src = qs.get('src') || 'people.json';
  let list = [];
  try { list = await (await fetch(src, { cache: 'no-cache' })).json(); } catch (e) { toast('Could not load ' + src); }
  if (!Array.isArray(list)) list = list.people || [];
  const added = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  const all = [...list, ...added];
  $('#count').textContent = all.length;
  const pending = [];
  for (const p of all) {
    if (p.traits || !p.image) addPerson(p, p.traits || null);
    else pending.push(p);
  }
  if (pending.length) toast(`Reading ${pending.length} photo${pending.length > 1 ? 's' : ''}…`, true);
  for (const p of pending) {
    let t = null;
    try { t = await traitsFor(p); } catch (e) { console.warn(p.name, e); }
    addPerson(p, t);
  }
  if (pending.length) toast('');
}

// ------------------------------------------------------------------ add-yourself
$('#addBtn').onclick = () => $('#addDlg').showModal();
$('#addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#addName').value.trim() || 'Someone';
  const file = $('#addFile').files[0];
  const url = $('#addUrl').value.trim();
  if (!file && !url) return;
  $('#addDlg').close();
  toast('Reading photo…', true);
  try {
    const image = file ? await shrinkToDataURL(file) : url;
    extractMod ||= import('./extract.js');
    const { extractTraits } = await extractMod;
    const traits = await extractTraits(image);
    const person = { name, image, traits };
    const added = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    added.push(person);
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(added)); } catch {}
    const c = addPerson(person, traits);
    $('#count').textContent = crowd.length;
    toast('');
    select(crowd.indexOf(c));
  } catch (err) {
    toast(String(err.message || err).includes('face') ? 'No face found in that photo' : 'Could not read that image (it may block cross-site use)');
  }
  $('#addForm').reset();
});
$('#resetAdded').onclick = () => { localStorage.removeItem(LOCAL_KEY); location.reload(); };

function shrinkToDataURL(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 640 / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(img.src);
      res(cv.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

let toastT;
function toast(msg, sticky) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('on', !!msg);
  clearTimeout(toastT);
  if (msg && !sticky) toastT = setTimeout(() => t.classList.remove('on'), 3500);
}

// ------------------------------------------------------------------ loop
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
let simT = 0;
function tick() {
  simulate(Math.min(0.05, clock.getDelta()));
  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
}
// One simulation step (walking, idling, camera glide). Separate from rendering so
// tests can fast-forward time on slow software-rendered browsers.
function simulate(dt) {
  simT += dt;
  const t = simT;
  for (const c of crowd) {
    const root = c.av.root;
    if (c.wait > 0) c.wait -= dt;
    const goal = c.path.length ? c.path[0] : c.target;
    tmp.copy(goal).sub(root.position);
    tmp.y = 0;
    const dist = tmp.length();
    let speed = 0;
    if (dist > 0.04 && !(c.wait > 0)) {
      speed = MODE === 'line' ? Math.min(2.1, 0.8 + dist * 1.6) : Math.min(0.9, dist * 2);
      root.position.addScaledVector(tmp.normalize(), Math.min(dist, speed * dt));
      const want = Math.atan2(tmp.x, tmp.z);
      root.rotation.y = turn(root.rotation.y, want, dt * 8);
    } else if (dist <= 0.04 && c.path.length) {
      c.path.shift();
      if (!c.path.length && MODE === 'line' && Math.random() < 0.35) c.av.hop(); // little hop on arrival
    } else {
      // idle: face the camera, sometimes wander a little
      const toCam = Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z);
      root.rotation.y = turn(root.rotation.y, toCam, dt * 3);
      c.idle -= dt;
      if (MODE === 'crowd' && c.idle < 0) {
        c.idle = 4 + Math.random() * 8;
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.6;
        c.target.set(c.home.x + Math.cos(a) * r, 0, c.home.z + Math.sin(a) * r);
        if (Math.random() < 0.5) c.target.copy(c.home);
      }
    }
    // heads track the camera
    const toCam = Math.atan2(camera.position.x - root.position.x, camera.position.z - root.position.z);
    let yaw = toCam - root.rotation.y;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    const pitch = -Math.atan2(camera.position.y - 2, Math.hypot(camera.position.x - root.position.x, camera.position.z - root.position.z)) * 0.5;
    c.av.update(t, dt, { speed, lookYaw: yaw, lookPitch: pitch });
  }
  if (camFly) {
    camFly.t += dt;
    const k = Math.min(1, camFly.t / camFly.dur), e = k * k * (3 - 2 * k);
    camera.position.lerpVectors(camFly.p0, camFly.p1, e);
    controls.target.lerpVectors(camFly.t0, camFly.t1, e);
    if (k >= 1) camFly = null;
  }
}
function turn(a, b, k) {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * Math.min(1, k);
}
renderer.setAnimationLoop(tick);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
  if (MODE === 'line') { clearTimeout(window.__reflow); window.__reflow = setTimeout(() => lineUp(order), 250); }
});

const sel = $('#styleSel');
for (const [k, v] of Object.entries(STYLE_OPTS)) sel.append(new Option(v, k, false, k === STYLE));
sel.onchange = () => { localStorage.setItem('minis.style', sel.value); const u = new URL(location); u.searchParams.set('style', sel.value); location = u; };

window.__minis = { crowd, scene, camera, renderer, select, layout, shuffle, lineUp, simulate, get order() { return order; } };
$('#shuffleBtn').onclick = shuffle;
await loadList();
// start as a crowd, then form the line in a fresh random order
setTimeout(() => { lineUp(shuffledOrder(crowd.length)); $('#shuffleBtn').disabled = false; }, 1200);
document.body.classList.add('ready');
