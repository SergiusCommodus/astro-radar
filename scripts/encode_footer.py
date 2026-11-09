"""Encodes the footer's planet stills from the renders of scripts/render_footer.cjs (it runs this; not used on its own).
   python3 scripts/encode_footer.py <render dir> <out dir> 1170x750 2560x768
Each render is twice the final size. Down with Lanczos in 32 bit float, then quantized to 8 bit with a triangular dither of one level,
so the smooth sky, the air and the dark ground do not band; AVIF (4:4:4) and WebP for each, the clouds with their alpha."""
import sys
import pathlib
import numpy as np
from PIL import Image

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
rng = np.random.default_rng(7)
AVIF_Q, WEBP_Q = 72, 90   # the lowest that showed no blocks on the dark ground or along the limb at 3x


def down(a, w, h):
    """float array (H, W, C) in 0..1 to (h, w, C), Lanczos per channel in 32 bit float."""
    return np.stack([np.asarray(Image.fromarray(np.ascontiguousarray(a[..., c], np.float32), "F").resize((w, h), Image.LANCZOS)) for c in range(a.shape[2])], 2)


def q8(a):
    d = rng.random(a.shape) - rng.random(a.shape)   # triangular, -1..1 levels
    return np.clip(np.round(a * 255 + d), 0, 255).astype(np.uint8)


def load(p):
    return np.asarray(Image.open(p).convert("RGB")).astype(np.float32) / 255


for size in sys.argv[3:]:
    w, h = map(int, size.split("x"))
    base = q8(np.clip(down(load(src / f"base-{w}.png"), w, h), 0, 1))
    cb, cw = load(src / f"cblack-{w}.png"), load(src / f"cwhite-{w}.png")
    a = np.clip(1 - (cw - cb).mean(2, keepdims=True), 0, 1)          # over black: C; over white: C + (1 - a)
    pm = down(np.concatenate([cb, a], 2), w, h)                       # premultiplied color and alpha, scaled together
    al = np.clip(pm[..., 3:], 0, 1)
    col = np.where(al > 1e-3, pm[..., :3] / np.maximum(al, 1e-3), 0)
    a8 = q8(al); a8[al < 1.5 / 255] = 0                               # clear sky stays exactly clear (no dither there: it would cost bytes)
    rgb = q8(np.clip(col, 0, 1)); rgb[a8[..., 0] == 0] = 0
    cloud = np.concatenate([rgb, a8], 2)
    for name, im in [(f"foot-{w}", Image.fromarray(base, "RGB")), (f"foot-cloud-{w}", Image.fromarray(cloud, "RGBA"))]:
        im.save(out / f"{name}.avif", quality=AVIF_Q, subsampling="4:4:4", speed=0)
        im.save(out / f"{name}.webp", quality=WEBP_Q, method=6, alpha_quality=90)
        print(f"{name}: avif {(out / f'{name}.avif').stat().st_size / 1024:.0f} KB, webp {(out / f'{name}.webp').stat().st_size / 1024:.0f} KB")
    if w == 2560:
        # the artifact's one still (it has no files beside it): the clouds over the ground, 1280 by 384, small
        comp = Image.alpha_composite(Image.fromarray(base, "RGB").convert("RGBA"), Image.fromarray(cloud, "RGBA")).convert("RGB").resize((1280, 384), Image.LANCZOS)
        comp.save(out / "foot-art.webp", quality=78, method=6)
        print(f"foot-art.webp: {(out / 'foot-art.webp').stat().st_size / 1024:.0f} KB")
