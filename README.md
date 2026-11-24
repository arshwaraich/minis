# Minis

Cute chibi island folks generated from photos.

## How it works
1. **extract.js** (in the browser): MediaPipe FaceLandmarker (478 pts + blendshapes) and the
   multiclass selfie segmenter (hair / face skin / body skin / clothes / accessories) turn a photo into
   face-normalised measurements: face shape, eye size/spacing, smile, skin/hair/iris/brow/shirt colours,
   hair length (ear coverage + side band), bangs, volume, receding hairline, glasses (accessory mask
   around the eyes), headwear, stubble (chin/upper-lip saturation vs cheeks).
2. **avatar.js**: `traitsToParams` caricatures those around population means; `buildAvatar` builds a
   procedural character (deformed head, swept hair shell + tapered hair locks, glossy eyes, blush,
   glasses, headband, patterned tee) with TSL rim-light materials. No art assets.
3. **main.js**: three.js `WebGPURenderer` (falls back to WebGL 2; force with `?gl=1`), island scene,
   wandering/idle animation, CSS2D name labels, click for photo + traits, "+ Add" to make one from a
   local photo or image URL (stored in localStorage on that device only).

## Data
`web/people.json`: `[{ "name": "...", "image": "people/x.jpg" | "https://...", "traits"?: {...}, "override"?: {...} }]`.
Load another list with `?src=<url>` (needs CORS on the JSON and images). Entries without `traits`
are read in the viewer's browser (downloads ~20 MB of models), so bake them first:

    NODE_PATH=~/projects/cf-browse/node_modules node tools/bake.mjs [--force] web/people.json
    ./deploy.sh

`override` takes any param from `traitsToParams` (e.g. `{"hairLength":"long","glasses":"#222"}`)
to fix a misread.

Dev: `web/compare.html` shows each photo next to its avatar (also linked from the island panel);
`tools/lineup.mjs` (screenshots compare.html), `tools/shot.mjs`, `tools/debug_masks.mjs` screenshot/debug in headless Chromium
(headless can't capture WebGPU canvases; use `?gl=1` for screenshots).

Test faces in web/people/ are AI-generated (thispersondoesnotexist.com); not real people.
