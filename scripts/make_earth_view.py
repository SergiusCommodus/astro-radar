"""NASA's Earth as seen from the Moon, for the ?hero=earth comparison on the home hero (assets/earth/view/, written to
assets/earth/earth-840.avif and .webp). The default hero planet is scripts/make_planet_view.py.

    python3 scripts/make_earth_view.py            # every size
    python3 scripts/make_earth_view.py --preview  # one 800 px PNG in the scratch folder, quick

A sphere is ray traced against NASA's own maps (assets/earth/view/: Blue Marble Next Generation for the day, Black Marble 2016 for the
lights, one day of GIBS satellite mosaics for the clouds; sources in assets/earth/SOURCES.md), supersampled 2 by 2 at the largest size and scaled down with
Lanczos, so it is sharp at every size the page asks for. From the Moon Earth is about 2 degrees across: a small, whole disc in black space,
so no perspective is needed (an orthographic view; at 384,000 km the difference is under 2 percent at the limb).

The light: the sun from the left and a little in front (phase angle PHASE), so the right of the disc is in night with its city lights,
the line between them soft by the width of twilight (about 6 degrees of Earth), and a thin blue limb: the atmosphere is about 1 percent of
Earth's radius thick, so the glow reaches about 1.6 percent out and is brightest on the day side. Apollo 8's Earthrise (AS08-14-2383) and
Artemis II's Earthset (6 April 2026) show the same: a hard edge, white cloud, deep blue sea and hardly any visible atmosphere.
The output has transparency: the page's own stars show around it.
"""
import argparse
import pathlib
import sys

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "assets/earth/view"
OUT = ROOT / "assets/earth"

LON0, LAT0 = -78.0, 14.0      # the point facing the Moon: the Americas, Florida a little above the middle
PHASE = 62.0                   # degrees between the sun and the viewer, seen from Earth: about two thirds of the disc lit
SUN_UP = 8.0                   # the sun a little above the equator's plane (northern summer would be more)
MARGIN = 1.045                 # the canvas is the disc's diameter times this, for the glow
SIZES = (840,)                  # one size: NASA's Earth is only the ?hero=earth comparison (a CSS background, 400 CSS px at 2x)
SS = 2                         # supersampling per axis (the largest size; smaller ones are scaled further down)


def srgb_to_lin(a):
    a = a / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(a):
    a = np.clip(a, 0, 1)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)


def load(name, mode="RGB"):
    return np.asarray(Image.open(SRC / name).convert(mode), dtype=np.float32)


def sample(tex, lon, lat):
    """bilinear lookup in an equirectangular map, wrapping in longitude"""
    h, w = tex.shape[:2]
    x = (lon / (2 * np.pi) + 0.5) * w - 0.5
    y = (0.5 - lat / np.pi) * h - 0.5
    x0 = np.floor(x).astype(np.int64)
    y0 = np.clip(np.floor(y).astype(np.int64), 0, h - 1)
    fx, fy = (x - x0)[..., None], (y - np.floor(y))[..., None]
    y1 = np.clip(y0 + 1, 0, h - 1)
    x0 %= w
    x1 = (x0 + 1) % w
    t = tex if tex.ndim == 3 else tex[..., None]
    a = t[y0, x0] * (1 - fx) + t[y0, x1] * fx
    b = t[y1, x0] * (1 - fx) + t[y1, x1] * fx
    out = a * (1 - fy) + b * fy
    return out if tex.ndim == 3 else out[..., 0]


def render(n):
    """an n by n RGBA float image (linear light, alpha straight)"""
    day = srgb_to_lin(load("day-4k.webp"))
    night = load("night-4k.webp", "L") / 255.0
    cloud = load("clouds-4k.webp", "L") / 255.0
    # pixel centres in units of the disc's radius
    r_px = n / MARGIN / 2
    c = ((np.arange(n) + 0.5 - n / 2) / r_px).astype(np.float32)
    X, Y = np.meshgrid(c, -c)
    R2 = X * X + Y * Y
    inside = R2 <= 1.0
    Z = np.sqrt(np.clip(1 - R2, 0, 1))
    # the view: rotate the sphere so (LON0, LAT0) faces +Z (the viewer), north up
    lo, la = np.radians(LON0), np.radians(LAT0)
    # point on the unit sphere in view space -> Earth fixed
    # first undo the latitude tilt (about X), then the longitude (about Y)
    yy = Y * np.cos(la) + Z * np.sin(la)
    zz = -Y * np.sin(la) + Z * np.cos(la)
    xx = X
    lat = np.arcsin(np.clip(yy, -1, 1))
    lon = np.arctan2(xx, zz) + lo
    lon = (lon + np.pi) % (2 * np.pi) - np.pi
    # the sun, in view space: to the left and in front by PHASE, a little up
    p, u = np.radians(PHASE), np.radians(SUN_UP)
    S = np.array([-np.sin(p) * np.cos(u), np.sin(u), np.cos(p) * np.cos(u)])
    ndl = X * S[0] + Y * S[1] + Z * S[2]
    mu = Z                      # cosine to the viewer
    # surface
    alb = sample(day, lon, lat)
    cl = sample(cloud, lon, lat)
    # the map keeps a grey haze where a satellite's swath caught sun glint (vertical bands in the tropics): only cloud brighter than
    # that counts, with a smooth step, so thin cloud fades in rather than starting at a line
    t = np.clip((cl - 0.30) / 0.48, 0, 1)
    cl = t * t * (3 - 2 * t)
    lights = sample(night, lon, lat)
    # day light with a soft terminator (twilight about 6 degrees wide)
    lit = (np.clip(ndl + 0.035, 0, 1.035) / 1.035) ** 0.9
    # the sea is darker and bluer seen from far; a faint glint where the sun reflects toward us
    H = S + np.array([0, 0, 1.0])
    H /= np.linalg.norm(H)
    ndh = np.clip(X * H[0] + Y * H[1] + Z * H[2], 0, 1)
    sea = (alb[..., 2] > alb[..., 0] * 1.15) & (alb.sum(-1) < 0.6)
    glint = (ndh ** 600) * 0.0 * sea * (1 - cl)   # off: at this size a sun glint reads as a smudge, and Apollo and Artemis frames rarely show one
    ground = alb * 0.95
    col = ground * (1 - cl[..., None]) + np.array([0.93, 0.94, 0.96]) * cl[..., None]
    col = col * lit[..., None] * 1.25 + glint[..., None]
    # city lights on the night side, under the clouds, warm sodium and white
    dark = 1 - np.clip((ndl + 0.02) / 0.12, 0, 1)
    # the map's faint floor (dim land and the satellite's swath edges) would show as stripes: only real lights count
    lights = np.clip((lights - 0.10) / 0.90, 0, 1)
    city = (lights ** 1.5) * dark * (1 - 0.75 * cl) * 0.6
    col += city[..., None] * np.array([1.0, 0.72, 0.38])
    # atmosphere: a thin blue veil toward the limb on the day side
    fres = (1 - mu) ** 4
    veil = fres * np.clip(ndl + 0.15, 0, 1) * 0.55
    col = col * (1 - 0.35 * fres[..., None] * np.clip(ndl + 0.2, 0, 1)[..., None]) + veil[..., None] * np.array([0.30, 0.52, 1.0])
    alpha = inside.astype(np.float32)
    # the glow just outside the edge (about 1.6 percent of the radius), lit where the sun is
    r = np.sqrt(R2)
    out = (r - 1.0).clip(0)
    rim_n = np.stack([X, Y, np.zeros_like(X)], -1) / np.maximum(r, 1e-6)[..., None]
    rim_l = np.clip(rim_n @ S + 0.25, 0, 1)
    glow = np.exp(-out / 0.0065) * (~inside) * rim_l
    glow_rgb = np.array([0.38, 0.62, 1.0]) * 1.1
    col = np.where(inside[..., None], col, glow_rgb * 1.0)
    alpha = np.where(inside, 1.0, np.clip(glow * 0.9, 0, 1))
    # tone: a gentle shoulder so cloud tops do not clip
    col = col / (1 + 0.18 * col)
    return np.dstack([col, alpha])


def to_image(f, size):
    a = f[..., 3:4]
    rgb = lin_to_srgb(f[..., :3])
    img = np.dstack([rgb, a])
    im = Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA")
    # scale in premultiplied alpha so the edge does not grow a dark or light fringe
    pre = np.asarray(im, dtype=np.float32)
    pre[..., :3] *= pre[..., 3:4] / 255.0
    big = Image.fromarray(np.clip(pre + 0.5, 0, 255).astype(np.uint8), "RGBA")
    small = np.asarray(big.resize((size, size), Image.LANCZOS), dtype=np.float32)
    al = small[..., 3:4]
    small[..., :3] = np.where(al > 0, small[..., :3] * 255.0 / np.maximum(al, 1), 0)
    return Image.fromarray(np.clip(small + 0.5, 0, 255).astype(np.uint8), "RGBA")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", metavar="PNG")
    a = ap.parse_args()
    if a.preview:
        f = render(800 * 2)
        to_image(f, 800).save(a.preview)
        print("wrote", a.preview)
        return
    top = max(SIZES)
    f = render(top * SS)
    for s in SIZES:
        im = to_image(f, s)
        im.save(OUT / f"earth-{s}.webp", quality=90, method=6)
        im.save(OUT / f"earth-{s}.avif", quality=78, subsampling="4:4:4")
        print(s, (OUT / f"earth-{s}.avif").stat().st_size // 1024, "KB avif,", (OUT / f"earth-{s}.webp").stat().st_size // 1024, "KB webp")


if __name__ == "__main__":
    sys.exit(main())
