# Near real time clouds from NASA GIBS (design, not built)

Today the world's clouds are one fixed day (2026-11-01), made once by `scripts/build_world_textures.py` from four GIBS true color mosaics. This note is a plan for refreshing them from GIBS inside the GitHub Action every few hours. Nothing here is built yet.

## Goal

The cloud map the page shows is at most about six hours old: storms move, fronts arrive, and a launch's real weather pattern is over its pad. The page itself does not change; only `assets/world/clouds-2k.webp` and `clouds-4k.webp` would be made fresh, in `dist/world/` at deploy time, never committed.

## Layers

GIBS (https://gibs.earthdata.nasa.gov) serves global mosaics through WMS, WMTS and image snapshots, with no key.

| Use | Layer | Coverage | Cadence |
|---|---|---|---|
| Day side, polar orbit | `VIIRS_SNPP_CorrectedReflectance_TrueColor`, `VIIRS_NOAA20_CorrectedReflectance_TrueColor`, `VIIRS_NOAA21_CorrectedReflectance_TrueColor`, `MODIS_Terra_CorrectedReflectance_TrueColor`, `MODIS_Aqua_CorrectedReflectance_TrueColor` | Global, daytime only, with swath gaps near the equator | One mosaic a day each, filled through the day |
| Day and night, geostationary | `GOES-East_ABI_Band13_Clean_Infrared`, `GOES-West_ABI_Band13_Clean_Infrared`, `Himawari_AHI_Band13_Clean_Infrared` (check the exact names in the GIBS capabilities) | The Americas and the Pacific, East Asia and Australia; not Europe, Africa or the poles | Every 10 minutes |
| Night side, global | `MODIS_Terra_Brightness_Temp_Band31_Night` or the VIIRS infrared equivalents | Global, night passes | Daily |

The visible layers give the look (the method we already use: whiter than the Blue Marble of the month, and grey). The infrared layers give cloud where it is night and where the geostationary disks reach: cold cloud tops against the warmer ground, turned into cover with a threshold per latitude band.

## Making the map

1. Fetch each layer for the latest complete time at 4096 by 2048 (EPSG:4326, `BBOX=-90,-180,90,180`); a geostationary disk only where its satellite sees (each covers about 120 degrees of longitude).
2. Visible cover as today; infrared cover from brightness temperature; take the freshest valid value per pixel (geostationary first, then the polar mosaics), the median where several are equally fresh.
3. Fill what nothing covers (Europe and Africa at night before Meteosat, which GIBS does not carry; polar night) with yesterday's map for those pixels, faded toward the soft polar veil the static map uses.
4. Save `clouds-4k.webp` (quality 56, about 1 MB) and `clouds-2k.webp` (about 0.3 MB); keep the static 2026-11-01 maps as the fallback.

## Gaps and limits

- Europe, Africa and the Indian Ocean have no geostationary layer in GIBS; at night there they fall back to the day's polar mosaics (up to about 18 hours old) or yesterday.
- Polar orbit mosaics have diamond shaped gaps near the equator and straight seams where swaths meet; the static map shows some of these today.
- Sun glint over the ocean reads as cloud in one satellite; the median across satellites removes most of it.
- Snow and sea ice read as cloud in visible light; comparing against the Blue Marble of the same month removes most of it, the polar veil hides the rest.

## Licence and credit

GIBS imagery from NASA instruments (MODIS, VIIRS on Suomi NPP) and NOAA instruments (VIIRS on NOAA 20 and 21, ABI on GOES) is free of copyright restrictions; credit NASA, and NOAA for the NOAA satellites. Himawari data come from the Japan Meteorological Agency through GIBS: check JMA's terms before using that layer, and leave it out if they ask for anything beyond credit. The footer credit would read "Clouds: NASA GIBS (NASA, NOAA) as of <time>".

## Size and cache

- A run fetches about 8 to 12 images of 1 to 3 MB each (about 25 MB) and adds about 1.3 MB to the deploy.
- In `.github/workflows/pages.yml` (run every 30 minutes already), the clouds would be fetched only when the last map is three hours old or more, so about 8 runs a day fetch, well within GIBS's limits (no key, no stated quota for this volume).
- The textures stay content hashed in the service worker (`radar-world-<hash>`): a fresh cloud map changes the hash, so returning visitors download the 2k or 4k cloud map again, not the rest. To spare that, the clouds could move to their own small cache named by the cloud map's hash.
- If a fetch fails, the step keeps the last good map, as the feed step does with `launches.json`.

## Steps to build it

1. `scripts/fetch_clouds.py <out folder>`: fetch, combine and save as above; exit with an error if fewer than two visible layers come back.
2. A step in `pages.yml` before the build that runs it and copies the result over `assets/world/clouds-*.webp` in the workspace (never committed). That workflow deploys the site, so this step needs the owner's go-ahead before anyone edits it.
3. Tests with saved GIBS responses (like `tests/raw_ll2.json` for the feed), so CI never calls GIBS.
4. The page shows "Clouds as of <time UTC>" in the `?fps` overlay and the footer credit.
