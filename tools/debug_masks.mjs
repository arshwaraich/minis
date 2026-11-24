import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const [base, outdir, ...imgs] = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(base + 'index.html');
const out = await p.evaluate(async (imgs) => {
  const { extractTraits } = await import('./extract.js');
  const r = {};
  for (const i of imgs) r[i] = (await extractTraits(i, { debug: true })).debug;
  return r;
}, imgs);
for (const [k, v] of Object.entries(out)) fs.writeFileSync(`${outdir}/${k.split('/').pop()}`, Buffer.from(v.split(',')[1], 'base64'));
await b.close();
