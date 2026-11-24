// Precompute traits for a people list so viewers skip the ~20 MB of models.
// usage: node tools/bake.mjs [--force] [web/people.json]
// Each entry: { "name": "...", "image": "people/x.jpg" | "https://..." }. Writes "traits" back in place.
import { createRequire } from 'module';
import fs from 'fs';
import http from 'http';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const force = args.includes('--force');
const file = path.resolve(args.find((a) => !a.startsWith('--')) || 'web/people.json');
const root = path.dirname(file);
const list = JSON.parse(fs.readFileSync(file, 'utf8'));
const todo = list.filter((p) => p.image && (force || !p.traits));
if (!todo.length) { console.log('nothing to bake'); process.exit(0); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const srv = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (u === '/__blank') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><meta charset=utf-8>'); }
  const f = path.join(root, path.normalize(u).replace(/^(\.\.[/\\])+/, ''));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const base = `http://127.0.0.1:${srv.address().port}/`;

const b = await chromium.launch();
const pg = await b.newPage();
await pg.goto(base + '__blank');
const out = await pg.evaluate(async (imgs) => {
  const { extractTraits } = await import('./extract.js');
  const r = [];
  for (const i of imgs) { try { r.push(await extractTraits(i)); } catch (e) { r.push({ error: String(e.message || e) }); } }
  return r;
}, todo.map((p) => p.image));
await b.close();
srv.close();

todo.forEach((p, i) => {
  if (out[i].error) console.warn(`✗ ${p.name}: ${out[i].error}`);
  else { delete out[i].debug; p.traits = out[i]; console.log(`✓ ${p.name}`); }
});
fs.writeFileSync(file, JSON.stringify(list, null, 1) + '\n');
