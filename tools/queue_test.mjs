// Headless test: line-up, Next x3, undo one, shuffle. Fast-forwards the simulation and
// tracks the closest any two people get while walking (should stay near 0.9).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [w = 1280, h = 800, out = '/tmp/q', base = 'http://127.0.0.1:8765/'] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.error('[pageerror]', e.message));
await p.goto(base + '?gl=1');
await p.waitForSelector('body.ready', { timeout: 120000 });
await p.waitForFunction(() => window.__minis.order.length > 0, null, { timeout: 60000 });
const ff = (sec) => p.evaluate((sec) => {
  const m = window.__minis; let minD = 99;
  for (let i = 0; i < sec / 0.05; i++) {
    m.simulate(0.05);
    for (let a = 0; a < m.crowd.length; a++) for (let c = a + 1; c < m.crowd.length; c++) {
      const A = m.crowd[a].av.root.position, B = m.crowd[c].av.root.position;
      minD = Math.min(minD, Math.hypot(A.x - B.x, A.z - B.z));
    }
  }
  let settled = m.crowd.every((c) => !c.path.length && c.av.root.position.distanceTo(c.target) < 0.06);
  return { minD: +minD.toFixed(2), settled };
}, sec);
const names = () => p.evaluate(() => { const m = window.__minis; return m.order.map((i) => (m.done.includes(i) ? '✓' : '') + m.crowd[i].person.name).join(', '); });
console.log('line-up', JSON.stringify(await ff(14)), await names());
for (let k = 0; k < 3; k++) { await p.click('#nextBtn'); console.log('next', JSON.stringify(await ff(5))); }
await p.waitForTimeout(600); await p.screenshot({ path: `${out}1.png` });
console.log(await names(), '| count:', await p.textContent('#countPill'));
await p.evaluate(() => window.__minis.toggleDone(window.__minis.done[0]));
console.log('undo', JSON.stringify(await ff(5)), await names());
await p.click('#shuffleBtn'); console.log('shuffle', JSON.stringify(await ff(1.3)));
await p.waitForTimeout(600); await p.screenshot({ path: `${out}2.png` });
console.log('shuffle end', JSON.stringify(await ff(12)), await names(), '| count:', await p.textContent('#countPill'));
await p.waitForTimeout(600); await p.screenshot({ path: `${out}3.png` });
await b.close();
