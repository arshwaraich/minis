// Run extract.js over images in headless Chromium; prints JSON keyed by path.
// usage: node tools/extract_all.mjs http://127.0.0.1:8765/ people/p1.jpg ...
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [base, ...imgs] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
p.on('console', (m) => m.type() === 'error' && console.error('[page]', m.text()));
await p.goto(base + 'index.html');
const out = await p.evaluate(async (imgs) => {
  const { extractTraits } = await import('./extract.js');
  const r = {};
  for (const i of imgs) { try { r[i] = await extractTraits(i); } catch (e) { r[i] = { error: String(e) }; } }
  return r;
}, imgs);
console.log(JSON.stringify(out));
await b.close();
