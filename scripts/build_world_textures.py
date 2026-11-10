"""Builds the live world's textures in assets/world/ from NASA public domain imagery (sources and licences in assets/world/SOURCES.md).

    python3 scripts/build_world_textures.py <source folder>

The source folder holds the files listed in SOURCES.md, downloaded as they are. Writes, for each level (2k: 2048 by 1024 for phones and
the first load everywhere, 4k: 4096 by 2048 for desktops):
  day-<lv>.webp     Blue Marble Next Generation, July 2004, natural color (no relief baked in; the shader lights the relief)
  night-<lv>.webp   Black Marble 2016 city lights alone (the dim land and sea taken out), grey
  clouds-<lv>.webp  one day of clouds: four satellites' true color mosaics against the Blue Marble of the same month, grey
  relief-<lv>.webp  R: height (sea floor 0 to 127, land 128 to 255, square root scale), G: water (255) or land (0), from GEBCO via NASA
on the high tier. Needs Pillow and numpy.
"""
import json, pathlib, sys
import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else ".")
OUT = pathlib.Path(__file__).resolve().parent.parent / "assets/world"
LEVELS = {"2k": (2048, 1024), "4k": (4096, 2048)}
Q = {"day": (78, 74), "night": (80, 78), "clouds": (66, 56), "relief": (82, 80)}  # WebP quality at 2k, 4k


def load(name, size, mode="RGB"):
    """A source image at a size, decoded at a reduced scale first when it is much larger (JPEG draft), then Lanczos."""
    im = Image.open(SRC / name)
    im.draft(mode, (size[0], size[1]))
    return im.convert(mode).resize(size, Image.LANCZOS)


def save(arr_or_im, name, q):
    im = arr_or_im if isinstance(arr_or_im, Image.Image) else Image.fromarray(np.clip(arr_or_im, 0, 255).astype(np.uint8))
    p = OUT / name
    p.parent.mkdir(parents=True, exist_ok=True)
    im.save(p, "WEBP", quality=q, method=6)
    return p.stat().st_size


def night(size):
    """City lights: Black Marble's luminance above the dim land and sea (about 52 and 6 of 255), stretched, with a soft knee."""
    a = np.asarray(load("BlackMarble_2016_3km.jpg", size), dtype=np.float32)
    lum = a[..., 0] * .3 + a[..., 1] * .59 + a[..., 2] * .11
    land = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(6)), dtype=np.float32)
    lights = np.clip((lum - np.maximum(land, 8) * 1.15 - 14) / 140, 0, 1) ** 1.1 * 255
    return np.repeat(lights[..., None], 3, axis=2)


def relief(size):
    """Height and water from GEBCO (elevation 0 to 250 on land, bathymetry 255 on land and darker with depth)."""
    el = np.asarray(load("gebco_08_rev_elev_21600x10800.jpg", size, "L"), dtype=np.float32) / 250
    ba = np.asarray(load("gebco_08_rev_bath_21600x10800.jpg", size, "L"), dtype=np.float32) / 255
    water = (ba < .985) & (el < .004)
    h = np.where(water, 127 * ba, 128 + 127 * np.sqrt(np.clip(el, 0, 1)))
    out = np.zeros((size[1], size[0], 3), np.float32)
    out[..., 0] = h
    out[..., 1] = water * 255
    return out


def box_blur(x, r):
    """A Gaussian-like blur of a float array: three passes of a box of radius r along each axis (cumulative sums, edges clamped)."""
    for axis in (0, 1):
        for _ in range(3):
            pad = [(0, 0), (0, 0)]
            pad[axis] = (r + 1, r)
            c = np.cumsum(np.pad(x, pad, mode="edge"), axis=axis)
            hi = np.take(c, range(2 * r + 1, c.shape[axis]), axis=axis)
            lo = np.take(c, range(0, c.shape[axis] - 2 * r - 1), axis=axis)
            x = (hi - lo) / (2 * r + 1)
    return x


def wrap_seam(c, frac=.03):
    """The mosaics are one day, which starts and ends at the date line, so the clouds there do not meet: a cut from thick cloud to none.
    Across a band either side of it (frac of the width each way) each side fades into the mirror image of the other, so the two edges
    meet with the same values and the cut becomes a soft change."""
    w = c.shape[1]
    b = max(4, int(w * frac))
    L, R = c[:, :b].copy(), c[:, w - b:].copy()          # L: just east of the date line, R: just west of it
    a = (np.arange(2 * b, dtype=np.float32) + .5) / (2 * b)  # 0 at the west end of the band, 1 at the east end
    a = a * a * (3 - 2 * a)
    shape = (1, 2 * b) + (1,) * (c.ndim - 2)
    west = np.concatenate([R, R[:, ::-1]], axis=1)       # the west side, carried on east of the line as its mirror
    east = np.concatenate([L[:, ::-1], L], axis=1)       # the east side, carried on west of the line as its mirror
    band = west * (1 - a.reshape(shape)) + east * a.reshape(shape)
    out = c.copy()
    out[:, w - b:], out[:, :b] = band[:, :b], band[:, b:]
    return out


def clouds(size):
    """Cloud cover from one day of the four true color mosaics (VIIRS on Suomi NPP and NOAA 20, MODIS on Terra and Aqua): how much
    whiter than the Blue Marble of the same month each pixel is, and how grey; the median over the satellites that saw it (a sun glint or
    a swath gap is in one or two of them at most), then the gaps no satellite covered filled in from their surroundings."""
    base = np.asarray(load("world.200411.3x5400x2700.jpg", size), dtype=np.float32) / 255
    by = base @ np.array([.3, .59, .11], np.float32)
    stack = []
    for n in ("VIIRS_SNPP", "VIIRS_NOAA20", "MODIS_Terra", "MODIS_Aqua"):
        f = SRC / f"gibs_{n}_CorrectedReflectance_TrueColor.jpg"
        if not f.exists():
            continue
        s = np.asarray(load(f.name, size), dtype=np.float32) / 255
        sy = s @ np.array([.3, .59, .11], np.float32)
        sat = s.max(axis=2) - s.min(axis=2)
        c = np.clip((sy - by * 1.05 - .13) / np.maximum(.8 - by, .1), 0, 1) * np.clip(1.4 - sat * 4.5, 0, 1)
        c[s.sum(axis=2) < .05] = np.nan  # no data there
        stack.append(c)
    c = np.nanmedian(np.stack(stack), axis=0)
    gap = np.isnan(c)
    fill = np.nan_to_num(c, nan=0.0)
    w = (~gap).astype(np.float32)
    for r in (8, 32, 96):
        sw, sf = box_blur(w, r), box_blur(fill * w, r)
        est = np.where(sw > .02, sf / np.maximum(sw, 1e-4), np.nan)
        fill = np.where(gap & ~np.isnan(est), est, fill)
        gap = gap & np.isnan(est)
    fill[gap] = .2
    # near the poles the mosaics are dark (polar night) or bright ice that reads as cloud, so the cover fades to an even soft veil there
    # (the shader adds its own moving detail on top)
    lat = np.abs(np.linspace(90, -90, size[1], dtype=np.float32))[:, None]
    k = np.clip((lat - 52) / 20, 0, 1) ** 1.5
    fill = fill * (1 - k) + .22 * k
    c = wrap_seam(np.clip(fill, 0, 1) ** 1.1 * 255)
    return np.repeat(c[..., None], 3, axis=2)


def main():
    sizes = {}
    for lv, size in LEVELS.items():
        qi = 0 if lv == "2k" else 1
        day = load("world.200407.3x21600x10800.jpg", size)
        sizes[f"day-{lv}"] = save(day, f"day-{lv}.webp", Q["day"][qi])
        sizes[f"night-{lv}"] = save(night(size), f"night-{lv}.webp", Q["night"][qi])
        sizes[f"clouds-{lv}"] = save(clouds(size), f"clouds-{lv}.webp", Q["clouds"][qi])
        sizes[f"relief-{lv}"] = save(relief(size), f"relief-{lv}.webp", Q["relief"][qi])
    print(json.dumps(sizes, indent=1))


if __name__ == "__main__":
    main()
