// usage: node tools/shot.mjs URL out.png [w h] [closeup-index|grid]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [url, out, w = 1280, h = 800, mode] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-features=Vulkan'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
p.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.error('[page]', m.text().slice(0, 300)));
p.on('pageerror', (e) => console.error('[pageerror]', e.message));
await p.goto(url);
await p.waitForSelector('body.ready', { timeout: 120000 });
if (mode === 'grid') {
  await p.evaluate(() => {
    const { crowd, camera } = window.__minis;
    crowd.forEach((c, i) => { const x = (i % 6 - 2.5) * 1.5, z = Math.floor(i / 6) * 2.2 - 1; c.home.set(x, 0, z); c.target.set(x, 0, z); c.av.root.position.set(x, 0, z); c.idle = 999; });
    camera.position.set(0, 2.2, 13);
  });
} else if (mode !== undefined) {
  await p.evaluate((i) => {
    const { crowd, camera } = window.__minis;
    crowd.forEach((c) => { c.idle = 999; c.target.copy(c.av.root.position); });
    const r = crowd[i].av.root.position;
    camera.position.set(r.x, 1.9, r.z + 4.2);
    window.__minis.__focus = r;
  }, +mode);
}
await p.waitForTimeout(2500);
if (mode !== undefined && mode !== 'grid') await p.evaluate(() => { const { camera } = window.__minis; });
await p.screenshot({ path: out });
console.log(await p.evaluate(() => document.querySelector('#backend').textContent));
await b.close();
