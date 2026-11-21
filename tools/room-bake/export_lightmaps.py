"""
Turns the baked .exr lightmaps into small sRGB PNGs for the web.

  blender -b -P tools/room-bake/export_lightmaps.py -- <bake-dir> <out-dir>

Smooths away render noise (light in a room changes slowly), scales every map by one shared
factor so their brightness stays comparable, and writes lm_scale.json with that factor
(three.js multiplies it back in as lightMapIntensity).
"""
import bpy, sys, os, json
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:]
SRC, OUT = argv[0], argv[1]
os.makedirs(OUT, exist_ok=True)
NAMES = ["floor", "back", "left", "right", "ceiling"]

def blur(a, sigma):
    r = int(sigma * 3)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    pad = np.pad(a, ((r, r), (r, r), (0, 0)), mode="edge")
    a = np.apply_along_axis(lambda m: np.convolve(m, k, mode="valid"), 0, pad)
    return np.apply_along_axis(lambda m: np.convolve(m, k, mode="valid"), 1, a)

maps = {}
for n in NAMES:
    img = bpy.data.images.load(os.path.join(SRC, f"lm_{n}.exr"))
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, :3]
    maps[n] = blur(px, max(1.5, w / 300))

scale = float(max(np.percentile(m, 99.7) for m in maps.values())) * 1.05
for n, m in maps.items():
    h, w, _ = m.shape
    v = np.clip(m / scale, 0, 1)
    s = np.where(v <= 0.0031308, v * 12.92, 1.055 * np.power(v, 1 / 2.4) - 0.055)   # linear -> sRGB
    rgba = np.concatenate([s, np.ones((h, w, 1), dtype=np.float32)], axis=2)
    out = bpy.data.images.new(f"out_{n}", width=w, height=h, alpha=False)
    out.colorspace_settings.name = "Non-Color"   # values are already sRGB-encoded: write them as they are
    out.pixels[:] = rgba.ravel()
    out.filepath_raw = os.path.join(OUT, f"lm_{n}.png"); out.file_format = "PNG"; out.save()

json.dump({"scale": scale}, open(os.path.join(OUT, "lm_scale.json"), "w"), indent=2)
print("scale", scale, flush=True)
