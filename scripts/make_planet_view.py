"""The home hero's distant planet (assets/planet/planet-*.avif and .webp), rendered from the Terran Planet 10 pack.

    python3 scripts/make_planet_view.py --src _incoming/terran10           # every size
    python3 scripts/make_planet_view.py --src _incoming/terran10 --preview out.png

The pack is "Terran Planet 10 - 4k" by ShinyMan on CGTrader (Royalty Free License, no AI): an invented planet, not Earth. Its raw maps
must never be committed: the licence forbids giving the files away in the form they were downloaded, and this repository is public. They
stay in _incoming/terran10/ (ignored by git); only the finished renders this script writes are committed (assets/planet/SOURCES.md).

A sphere is ray traced against the pack's maps, supersampled 2 by 2 at the largest size and scaled down with Lanczos, so it is sharp at
every size the page asks for. Seen from far away the disc is small, so the view is orthographic. The maps used:
  Diffuse            the ground's colour
  Bump               a tangent space normal map: relief shading on the lit side
  Clouds             white with the cover in the alpha channel, over the ground, casting a faint shadow
  Lights Rural, Urban, Metropolis
                     city lights (colour times alpha) on the night side, under the clouds
The sun is from the left and a little in front (PHASE), so the right of the disc is in night with its lights, the line between them soft
by the width of twilight, and a thin blue glow on the lit limb. The output has transparency: the page's own stars show around it.
"""
import argparse
import pathlib
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from make_earth_view import lin_to_srgb, sample, srgb_to_lin, to_image  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets/planet"

LON0, LAT0 = -70.0, 16.0       # the point facing the viewer: the big green continent on the day side, the middle one in the night
PHASE = 66.0                   # degrees between the sun and the viewer: a bit under two thirds of the disc lit
SUN_UP = 10.0
MARGIN = 1.045                 # the canvas is the disc's diameter times this, for the glow
SIZES = (280, 560, 840)        # canvas widths in px (the page's srcset; 840 covers 400 CSS px at 2x)
SS = 2
BUMP = 0.55                    # how much of the normal map's relief to use (the disc is small: more reads as noise)


def load(src, name):
    return np.asarray(Image.open(src / f"Terran 10 ({name} 4k).png").convert("RGBA"), dtype=np.float32) / 255.0


def render(n, src):
    diffuse = load(src, "Diffuse")
    day = srgb_to_lin(diffuse[..., :3] * 255.0)
    bump = load(src, "Bump")[..., :3] * 2 - 1
    clouds = load(src, "Clouds")
    lights = np.zeros(day.shape, np.float32)
    for name, gain in (("Lights Rural", 0.5), ("Lights Urban", 0.8), ("Lights Metropolis", 1.0)):
        m = load(src, name)
        lights += srgb_to_lin(m[..., :3] * 255.0) * m[..., 3:4] * gain
    del diffuse
    r_px = n / MARGIN / 2
    c = ((np.arange(n) + 0.5 - n / 2) / r_px).astype(np.float32)
    X, Y = np.meshgrid(c, -c)
    R2 = X * X + Y * Y
    inside = R2 <= 1.0
    Z = np.sqrt(np.clip(1 - R2, 0, 1))
    lo, la = np.radians(LON0), np.radians(LAT0)
    yy = Y * np.cos(la) + Z * np.sin(la)
    zz = -Y * np.sin(la) + Z * np.cos(la)
    lat = np.arcsin(np.clip(yy, -1, 1))
    lon = np.arctan2(X, zz) + lo
    lon = (lon + np.pi) % (2 * np.pi) - np.pi
    p, u = np.radians(PHASE), np.radians(SUN_UP)
    S = np.array([-np.sin(p) * np.cos(u), np.sin(u), np.cos(p) * np.cos(u)], np.float32)
    P = np.stack([X, Y, Z], -1)
    # the tangent frame in view space: north toward the pole, east to the right of it
    pole = np.array([0, np.cos(la), np.sin(la)], np.float32)
    E = np.cross(np.broadcast_to(pole, P.shape), P)
    E /= np.maximum(np.linalg.norm(E, axis=-1, keepdims=True), 1e-6)
    N = np.cross(P, E)
    bt = sample(bump, lon, lat)
    bt[..., :2] *= BUMP
    nrm = E * bt[..., 0:1] + N * bt[..., 1:2] + P * bt[..., 2:3]
    nrm /= np.maximum(np.linalg.norm(nrm, axis=-1, keepdims=True), 1e-6)
    ndl_s = P @ S                         # the sphere's own light: the terminator
    ndl_b = nrm @ S                       # with relief
    alb = sample(day, lon, lat)
    cl4 = sample(clouds, lon, lat)
    cov = np.clip(cl4[..., 3], 0, 1) * 0.85   # a little thinner, so the land and sea still read at 60 px
    ccol = srgb_to_lin(cl4[..., :3] * 255.0)
    # a soft shadow under the clouds: the cover a little toward the sun
    sh_lon = lon - 0.004 * np.sign(S[0])
    shadow = 1 - 0.35 * np.clip(sample(clouds[..., 3], sh_lon, lat), 0, 1)
    lit_s = (np.clip(ndl_s + 0.035, 0, 1.035) / 1.035) ** 0.9
    relief = np.clip(ndl_b + 0.035, 0, 1.035) / np.maximum(np.clip(ndl_s + 0.035, 1e-3, 1.035), 1e-3)
    relief = np.clip(relief, 0.55, 1.5)
    ground = alb * 0.95 * (relief * shadow)[..., None]
    col = ground * (1 - cov[..., None]) + ccol * 0.93 * cov[..., None]
    col = col * lit_s[..., None] * 1.25
    dark = 1 - np.clip((ndl_s + 0.02) / 0.12, 0, 1)
    city = sample(lights, lon, lat) * (dark * (1 - 0.75 * cov) * 0.9)[..., None]
    col += city
    mu = Z
    fres = (1 - mu) ** 4
    veil = fres * np.clip(ndl_s + 0.15, 0, 1) * 0.55
    col = col * (1 - 0.35 * fres[..., None] * np.clip(ndl_s + 0.2, 0, 1)[..., None]) + veil[..., None] * np.array([0.30, 0.52, 1.0])
    r = np.sqrt(R2)
    out = (r - 1.0).clip(0)
    rim_n = np.stack([X, Y, np.zeros_like(X)], -1) / np.maximum(r, 1e-6)[..., None]
    rim_l = np.clip(rim_n @ S + 0.25, 0, 1)
    glow = np.exp(-out / 0.0065) * (~inside) * rim_l
    col = np.where(inside[..., None], col, np.array([0.38, 0.62, 1.0]) * 1.1)
    alpha = np.where(inside, 1.0, np.clip(glow * 0.9, 0, 1))
    col = col / (1 + 0.18 * col)
    return np.dstack([col, alpha])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(ROOT / "_incoming/terran10"))
    ap.add_argument("--preview", metavar="PNG")
    a = ap.parse_args()
    src = pathlib.Path(a.src)
    if not (src / "Terran 10 (Diffuse 4k).png").exists():
        sys.exit(f"no Terran 10 maps in {src}")
    if a.preview:
        to_image(render(1600, src), 800).save(a.preview)
        print("wrote", a.preview)
        return
    OUT.mkdir(exist_ok=True)
    f = render(max(SIZES) * SS, src)
    for s in SIZES:
        im = to_image(f, s)
        im.save(OUT / f"planet-{s}.webp", quality=90, method=6)
        im.save(OUT / f"planet-{s}.avif", quality=78, subsampling="4:4:4")
        print(s, (OUT / f"planet-{s}.avif").stat().st_size // 1024, "KB avif,", (OUT / f"planet-{s}.webp").stat().st_size // 1024, "KB webp")


if __name__ == "__main__":
    sys.exit(main())
