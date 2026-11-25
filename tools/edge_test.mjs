// Mark everyone done one by one; check nobody ever stands near/over the island edge.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [w = 390, h = 844, shot = '/tmp/edge.png', base = 'http://127.0.0.1:8765/'] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.error('[pageerror]', e.message));
await p.goto(base + '?gl=1');
await p.waitForSelector('body.ready', { timeout: 120000 });
await p.waitForFunction(() => window.__minis.order.length > 0, null, { timeout: 60000 });
const res = await p.evaluate(() => {
  const m = window.__minis, out = [];
  const R = () => { let r = 0; m.scene.traverse((o) => { if (o.geometry?.type === 'CylinderGeometry' && o.geometry.parameters.height === 0.16) r = o.geometry.parameters.radiusTop; }); return r; };
  const worst = () => Math.max(...m.crowd.map((c) => Math.hypot(c.av.root.position.x, c.av.root.position.z)));
  for (let i = 0; i < 300; i++) m.simulate(0.05);
  out.push(['lined', +worst().toFixed(2), R()]);
  for (let k = 0; k < m.crowd.length; k++) {
    m.next();
    let mx = 0;
    for (let i = 0; i < 100; i++) { m.simulate(0.05); mx = Math.max(mx, worst()); }
    out.push([`done ${k + 1}`, +mx.toFixed(2), R()]);
  }
  return out;
});
for (const [label, far, R] of res) console.log(label.padEnd(8), 'farthest', far, 'island R', R, far < R - 1 ? 'ok' : 'TOO CLOSE');
await p.waitForTimeout(800);
await p.screenshot({ path: shot });
await b.close();
