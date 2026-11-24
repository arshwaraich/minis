# White-background character render -> trimmed RGBA cut-out.
# Flood-fills near-white/light-grey pixels connected to the border (background + soft floor
# shadow), feathers the edge, crops to the character. usage: python cutout.py in out.png
import sys
import numpy as np
from PIL import Image, ImageFilter
from collections import deque

src, dst = sys.argv[1], sys.argv[2]
im = Image.open(src).convert("RGB")
a = np.asarray(im).astype(np.int16)
h, w, _ = a.shape
mx, mn = a.max(2), a.min(2)
bgish = (mn > 214) & ((mx - mn) < 18)          # light, unsaturated
lum = a.sum(2)
bg = np.zeros((h, w), bool)
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if bgish[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if bgish[y, x] and not bg[y, x]: bg[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        # only spread across smooth colour, never over an edge into the character
        if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx] and bgish[ny, nx] and abs(int(lum[ny, nx]) - int(lum[y, x])) < 9:
            bg[ny, nx] = True; q.append((ny, nx))
alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8))
alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
out = im.convert("RGBA"); out.putalpha(alpha)
bbox = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
out = out.crop(bbox)
# fixed height so every standee shares a scale
H = 640
out = out.resize((round(out.width * H / out.height), H), Image.LANCZOS)
out.save(dst, optimize=True)
print("ok", dst, out.size)
