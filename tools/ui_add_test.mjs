// Real UI flow: tap +, pick a photo file, type a name, tap Make; report what the new mini got.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [file, name, w = 390, h = 844, shot = '/tmp/ui_add.png', base = 'http://127.0.0.1:8765/'] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', (e) => console.error('[pageerror]', e.message));
p.on('console', (m) => m.type() === 'error' && console.error('[console]', m.text().slice(0, 200)));
await p.goto(base + '?gl=1');
await p.waitForSelector('body.ready', { timeout: 120000 });
await p.click('#addBtn');
await p.fill('#addName', name);
await p.setInputFiles('#addFile', file);
await p.click('#addForm button:not([type])');
await p.waitForFunction((n) => window.__minis.crowd.some((c) => c.person.name === n), name, { timeout: 180000 });
const info = await p.evaluate((n) => {
  const m = window.__minis, c = m.crowd.find((c) => c.person.name === n);
  for (let i = 0; i < 300; i++) m.simulate(0.05);
  const P = c.params;
  return { mono: P.mono, monoResid: c.traits?.mono?.resid, skin: P.skin, hair: P.hair, beard: P.beard, glasses: !!P.glasses, hairLength: P.hairLength,
           stored: JSON.parse(localStorage.getItem('minis.added.v1') || '[]').map((q) => q.name) };
}, name);
console.log(JSON.stringify(info));
await p.waitForTimeout(800);
await p.screenshot({ path: shot });
await b.close();
