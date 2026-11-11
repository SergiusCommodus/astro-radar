"""Make the globe card's launch areas: each launch site seen from space, a 256 km square at 250 m a pixel from NASA GIBS.

The imagery is NASA's Global Imagery Browse Services (gibs.earthdata.nasa.gov, no key): the daily true color corrected reflectance
of MODIS on Terra and Aqua and of VIIRS on NOAA-20, all 250 m a pixel, read from GIBS's cached WMTS tiles (EPSG:4326, the 250m tile
matrix set; its WMS renders each request on demand and is about fifty times slower). A single day has clouds and gaps between swaths,
so for each site the script scores small copies (level 5, about 2 km a pixel) of every third day of the last LOOKBACK days on each
satellite (clouds and missing data near the centre count double) and keeps the clearest whole day at level 8 (250 m): one real
picture, its satellite and date recorded, never a blend of days.
NASA's Earth science data are free to use with no restriction (EOSDIS data use policy); the credit is on the page.

    python3 scripts/make_areas.py [--end 2026-11-09] [key ...]

Writes assets/earth/areas/<key>.webp (1024 by 1024) and assets/earth/areas/areas.json, which build.py inlines into app.js (AREAS).
The page shows an area only for a pad within it (see `areaOf` in app.js), so a pad that is not listed simply keeps the globe.
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import io
import json
import math
import os
import time
import urllib.error
import urllib.request

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'earth', 'areas')
WMTS = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/{layer}/default/{day}/250m/{z}/{row}/{col}.jpg'
TILE0 = 288.0  # degrees a 512 px tile spans at level 0 of the 250m matrix set (top left -180, 90); halves each level
LAYERS = [('MODIS_Terra_CorrectedReflectance_TrueColor', 'MODIS Terra'),
          ('MODIS_Aqua_CorrectedReflectance_TrueColor', 'MODIS Aqua'),
          ('VIIRS_NOAA20_CorrectedReflectance_TrueColor', 'VIIRS NOAA-20')]
KM = 256      # the square's side
PX = 1024     # 250 m a pixel
LOOKBACK = 120
STEP = 3

# launch areas: a centre between the site's pads (from Launch Library 2's pad coordinates) and its name; a pad within about 100 km
# of the centre uses the area, and the page marks the pad itself from the feed's own coordinates
AREAS = {
    'florida': (28.55, -80.62, 'Cape Canaveral and Kennedy Space Center, Florida'),
    'vandenberg': (34.70, -120.58, 'Vandenberg, California'),
    'starbase': (25.99, -97.20, 'Starbase, Texas'),
    'wallops': (37.84, -75.48, 'Wallops Island, Virginia'),
    'westtexas': (31.42, -104.76, 'Launch Site One, West Texas'),
    'spaceportamerica': (32.99, -106.97, 'Spaceport America, New Mexico'),
    'kodiak': (57.43, -152.34, 'Pacific Spaceport Complex, Kodiak, Alaska'),
    'mahia': (-39.26, 177.86, 'Mahia Peninsula, New Zealand'),
    'kourou': (5.24, -52.77, 'Guiana Space Centre, Kourou, French Guiana'),
    'alcantara': (-2.37, -44.40, 'Alcântara, Brazil'),
    'baikonur': (45.92, 63.34, 'Baikonur Cosmodrome, Kazakhstan'),
    'plesetsk': (62.93, 40.57, 'Plesetsk Cosmodrome, Russia'),
    'vostochny': (51.88, 128.33, 'Vostochny Cosmodrome, Russia'),
    'jiuquan': (40.96, 100.29, 'Jiuquan Satellite Launch Center, China'),
    'taiyuan': (38.85, 111.58, 'Taiyuan Satellite Launch Center, China'),
    'xichang': (28.25, 102.03, 'Xichang Satellite Launch Center, China'),
    'wenchang': (19.61, 110.95, 'Wenchang, Hainan, China'),
    'haiyang': (35.39, 119.60, 'Haiyang Oriental Spaceport, China'),
    'sriharikota': (13.72, 80.23, 'Satish Dhawan Space Centre, Sriharikota, India'),
    'tanegashima': (30.40, 130.97, 'Tanegashima Space Center, Japan'),
    'uchinoura': (31.25, 131.08, 'Uchinoura Space Center, Japan'),
    'naro': (34.43, 127.53, 'Naro Space Center, South Korea'),
    'sohae': (39.66, 124.71, 'Sohae, North Korea'),
    'semnan': (35.23, 53.92, 'Semnan, Iran'),
    'shahroud': (36.20, 55.33, 'Shahroud, Iran'),
    'palmachim': (31.88, 34.68, 'Palmachim, Israel'),
    'andoya': (69.29, 16.02, 'Andøya Spaceport, Norway'),
    'esrange': (67.89, 21.10, 'Esrange, Sweden'),
    'saxavord': (60.82, -0.78, 'SaxaVord Spaceport, Shetland'),
    'kwajalein': (9.05, 167.74, 'Kwajalein Atoll, Marshall Islands'),
    'bowen': (-19.95, 148.10, 'Bowen Orbital Spaceport, Australia'),
}


def bbox(lat, lon):
    h = KM / 2 / 111.32
    w = h / math.cos(math.radians(lat))
    return lat - h, lon - w, lat + h, lon + w


def tile(layer, day, z, row, col, cache):
    key = (layer, day, z, row, col)
    if key in cache:
        return cache[key]
    url = WMTS.format(layer=layer, day=day, z=z, row=row, col=col)
    req = urllib.request.Request(url, headers={'User-Agent': 'astro-radar-build'})
    for k in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            im = Image.open(io.BytesIO(data)).convert('RGB') if data[:2] == b'\xff\xd8' else Image.new('RGB', (512, 512))
            break
        except urllib.error.HTTPError as e:
            if e.code in (400, 404):  # no tile there (outside the swaths): missing data
                im = Image.new('RGB', (512, 512))
                break
            if k == 3:
                raise
            time.sleep(1.5 * (k + 1))
        except Exception:
            if k == 3:
                raise
            time.sleep(1.5 * (k + 1))
    cache[key] = im
    return im


def get(layer, day, b, px, z=8, cache=None):
    """the box b (lat0, lon0, lat1, lon1) at level z, stitched from tiles, as px by px (equal steps in latitude and longitude)"""
    cache = {} if cache is None else cache
    span = TILE0 / 2 ** z
    deg = span / 512
    c0, c1 = int((b[1] + 180) // span), int((b[3] + 180) // span)
    r0, r1 = int((90 - b[2]) // span), int((90 - b[0]) // span)
    big = Image.new('RGB', ((c1 - c0 + 1) * 512, (r1 - r0 + 1) * 512))
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            big.paste(tile(layer, day, z, r, c, cache), ((c - c0) * 512, (r - r0) * 512))
    x0, x1 = (b[1] + 180) / deg - c0 * 512, (b[3] + 180) / deg - c0 * 512
    y0, y1 = (90 - b[2]) / deg - r0 * 512, (90 - b[0]) / deg - r0 * 512
    return big.resize((px, px), Image.LANCZOS if z >= 8 else Image.BILINEAR, box=(x0, y0, x1, y1))


def score(im):
    a = np.asarray(im, dtype=np.int16)
    gap = a.sum(-1) < 8
    mn, mx = a.min(-1), a.max(-1)
    cloud = (mn > 165) & (mx - mn < 40)
    n = a.shape[0]
    w = np.ones(a.shape[:2])
    w[n // 4:3 * n // 4, n // 4:3 * n // 4] = 2
    return float(((cloud + 2 * gap) * w).sum() / w.sum())


def best(key, end):
    lat, lon, _ = AREAS[key]
    b = bbox(lat, lon)
    jobs = [(layer, label, (end - dt.timedelta(days=d)).isoformat()) for d in range(0, LOOKBACK, STEP) for layer, label in LAYERS]
    out = []
    with cf.ThreadPoolExecutor(16) as ex:
        futs = {ex.submit(get, layer, day, b, 128, 5): (layer, label, day) for layer, label, day in jobs}
        for f in cf.as_completed(futs):
            try:
                out.append((score(f.result()), futs[f]))
            except Exception:
                pass
    out.sort()
    return out[0] if out else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--end', default=(dt.date.today() - dt.timedelta(days=1)).isoformat())
    ap.add_argument('keys', nargs='*')
    a = ap.parse_args()
    end = dt.date.fromisoformat(a.end)
    os.makedirs(OUT, exist_ok=True)
    jpath = os.path.join(OUT, 'areas.json')
    index = {e['k']: e for e in json.load(open(jpath, encoding='utf-8'))} if os.path.exists(jpath) else {}
    for key in a.keys or AREAS:
        lat, lon, name = AREAS[key]
        pick = best(key, end)
        if not pick:
            print(key, 'no imagery')
            continue
        sc, (layer, label, day) = pick
        b = bbox(lat, lon)
        im = get(layer, day, b, PX)
        path = os.path.join(OUT, key + '.webp')
        im.save(path, quality=80, method=6)
        index[key] = {'k': key, 'n': name, 'lat': lat, 'lon': lon, 's': [round(b[0], 5), round(b[1], 5), round(b[2], 5), round(b[3], 5)],
                      'src': label, 'd': day}
        print('%-16s %s %s clouds %.3f  %d KB' % (key, label, day, sc, os.path.getsize(path) // 1024), flush=True)
        with open(jpath, 'w', encoding='utf-8') as f:
            json.dump([index[k] for k in AREAS if k in index], f, ensure_ascii=False, indent=0)
            f.write('\n')


if __name__ == '__main__':
    main()
