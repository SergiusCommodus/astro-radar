"""Make the hero's and the footer's planet from two NASA photographs of Earth taken on the International Space Station.

Both are public domain NASA photographs (Johnson Space Center, Earth Science and Remote Sensing Unit), listed with their rights in
assets/earth/SOURCES.md. Each is cut to the band the page shows, the deepest shadows of space crushed to black (the faint lens ghosts
of a long lens go with them), its top rows faded into the page color, dithered so no gradient bands, and saved as AVIF and WebP.

    python3 scripts/make_earth_stills.py [--cache DIR]

The originals (11 MB at most each) are fetched over https into the cache once.
"""
import argparse
import os
import urllib.request

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'earth')
NASA = 'https://images-assets.nasa.gov/image/{0}/{0}~orig.jpg'
BG = np.array([3, 5, 11], dtype=np.float32) / 255  # the page color under the fade (--bg)

# name: (photo, crop box in the original (x0, y0, x1, y1), output sizes, fade share of the height, shadow crush)
STILLS = {
    # Earth's thin blue atmosphere over a partly cloudy Pacific west of Chile, the sun's glint on the sea (16 January 2026)
    'hero-wide': ('iss074e0089803', (342, 953, 4587, 2744), [(3840, 1620), (2560, 1080)], .27, .035),
    'hero-phone': ('iss074e0089803', (1675, 953, 3466, 2744), [(1200, 1200)], .27, .035),
    # a green aurora australis over a moonlit, cloudy southern Indian Ocean (9 June 2025); the station's hardware above is cut off
    'foot-wide': ('iss073e0246858', (0, 1430, 8256, 4526), [(2560, 960)], .42, .02),
    'foot-phone': ('iss073e0246858', (3700, 1700, 8000, 4456), [(1080, 692)], .42, .02),
}
Q = {'avif': 60, 'webp': 86}


def fetch(nid, cache):
    path = os.path.join(cache, nid + '.jpg')
    if not os.path.exists(path):
        req = urllib.request.Request(NASA.format(nid), headers={'User-Agent': 'astro-radar-build'})
        with urllib.request.urlopen(req, timeout=120) as r, open(path + '.part', 'wb') as f:
            f.write(r.read())
        os.replace(path + '.part', path)
    return path


def srgb_to_lin(a):
    return np.where(a <= .04045, a / 12.92, ((a + .055) / 1.055) ** 2.4)


def lin_to_srgb(a):
    return np.where(a <= .0031308, a * 12.92, 1.055 * np.clip(a, 0, None) ** (1 / 2.4) - .055)


def make(name, nid, box, sizes, fade, crush, cache):
    src = Image.open(fetch(nid, cache)).convert('RGB').crop(box)
    for i, (w, h) in enumerate(sizes):
        # resize in linear light (no darkened clouds at the edges), then grade in sRGB
        lin = srgb_to_lin(np.asarray(src, dtype=np.float32) / 255)
        chans = [np.asarray(Image.fromarray(lin[..., c]).resize((w, h), Image.LANCZOS)) for c in range(3)]
        a = np.clip(lin_to_srgb(np.stack(chans, -1)), 0, 1)
        # crush the shadows of space: below `crush` is black, eased back to the original by twice that
        a = np.where(a < crush, 0, np.where(a < 2 * crush, (a - crush) * 2, a))
        # fade the top rows into the page color (smoothstep)
        y = np.arange(h, dtype=np.float32)[:, None, None] / max(1, h * fade)
        k = np.clip(y, 0, 1)
        k = k * k * (3 - 2 * k)
        a = BG + (a - BG) * k
        # triangular dither of one step, so the dark fade and the rim do not band in 8 bits
        rng = np.random.default_rng(7)
        a = a * 255 + (rng.random(a.shape, dtype=np.float32) - rng.random(a.shape, dtype=np.float32))
        im = Image.fromarray(np.clip(np.round(a), 0, 255).astype(np.uint8))
        base = name if i == len(sizes) - 1 else name + '-' + str(w)
        im.save(os.path.join(OUT, base + '.avif'), quality=Q['avif'], speed=2)
        im.save(os.path.join(OUT, base + '.webp'), quality=Q['webp'], method=6)
        print(base, w, h, *(os.path.getsize(os.path.join(OUT, base + '.' + e)) // 1024 for e in ('avif', 'webp')), 'KB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(ROOT, '.cache', 'earth'))
    ap.add_argument('only', nargs='*')
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    for name, (nid, box, sizes, fade, crush) in STILLS.items():
        if not a.only or name in a.only:
            make(name, nid, box, sizes, fade, crush, a.cache)


if __name__ == '__main__':
    main()
