# Minis

A cute 3D queue of people generated from their photos: a replacement for an ordered checklist.


## How it works
1. **extract.js** (in the browser): MediaPipe FaceLandmarker (478 pts + blendshapes) and the
   multiclass selfie segmenter (hair / face skin / body skin / clothes / accessories) turn a photo into
   face-normalised measurements: face shape, eye size/spacing, smile, skin/hair/iris/brow/shirt colours,
   hair length (ear coverage + side band), bangs, volume, receding hairline, glasses (accessory mask
   around the eyes), headwear, stubble (chin/upper-lip saturation vs cheeks).
2. **avatar.js**: `traitsToParams` caricatures those around population means; `buildAvatar` builds a
   procedural character (deformed head, swept hair shell + tapered hair locks, glossy eyes, blush,
   glasses, headband, patterned tee). The face is 2D artwork drawn on a canvas and wrapped onto the head
   in yaw/pitch space; hair carries painted strand lines. Every surface (characters + island) uses one
   stylised unlit shader in **style.js** (tinted shadows, soft light band, rim, hair highlight ring),
   so the look is art-directed and identical on WebGPU and WebGL 2. No art assets.
3. **main.js**: three.js `WebGPURenderer` (falls back to WebGL 2; force with `?gl=1`), island scene,
   wandering/idle animation, CSS2D name labels, click for photo + traits, "+ Add" to make one from a
   local photo or image URL (stored in localStorage on that device only).

## Queue: order + done
On load the crowd walks into a queue in a fresh random order (one line on wide screens, rows of 4 on
phones; re-arranges on resize). Labels show the position; the head of the queue is highlighted.
- **Click a person** (or their label) to mark them done: they move to the done row behind the
  queue and everyone after them steps forward. Click again to undo.
- **Next** (or `N` / `→` / space) marks the person at the front done. **Shuffle** (`S`) picks a new
  order and starts a fresh round.
- No walking through each other: a pairwise separation pass with a sidestep nudge. On a single line,
  right-movers use a lane in front and left-movers one behind; with several rows everyone "breathes
  out" from the centre, crosses in open space, then closes back in. Last resort: anyone stuck for
  4 s may squeeze past.
- `window.__minis.simulate(dt)` steps the simulation without rendering; `tools/queue_test.mjs`
  fast-forwards with it (headless software rendering runs at about 2 fps) and reports the closest
  any two people got.

Style is **Storybook** (cartoon shading + soft outline); `?style=sprout|gumdrop|mochi` for dev.
Black-and-white photos work: shape traits are unaffected, and colours are estimated from
brightness (skin and hair ramps, cheerful clothes).

## Data
`web/people.json`: `[{ "name": "...", "image": "people/x.jpg" | "https://...", "traits"?: {...}, "override"?: {...} }]`.
Load another list with `?src=<url>` (needs CORS on the JSON and images). Entries without `traits`
are read in the viewer's browser (downloads ~20 MB of models), so bake them first:

    NODE_PATH=~/projects/cf-browse/node_modules node tools/bake.mjs [--force] web/people.json
    ./deploy.sh

`override` takes any param from `traitsToParams` (e.g. `{"hairLength":"long","glasses":"#222"}`)
to fix a misread.

Dev: `web/compare.html?size=900&only=Name1,Name2` for large closeups. `web/compare.html` shows each photo next to its avatar (also linked from the island panel);
`tools/lineup.mjs` (screenshots compare.html), `tools/shot.mjs`, `tools/debug_masks.mjs` screenshot/debug in headless Chromium
(headless can't capture WebGPU canvases; use `?gl=1` for screenshots).

Test faces in web/people/ are AI-generated (thispersondoesnotexist.com); not real people.
