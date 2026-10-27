# Astro Radar

Rocket launch tracker under the Astro brand. Live at https://astroradar.io (GitHub Pages, deployed from `main`).

## How it is built

- `python3 build.py` assembles `dist/index.html` from `src/`, `data/` and `assets/`, and copies the hero photo files next to it (`earth.webp`, with `earth.jpg` as the fallback; a tiny placeholder is inlined). It also writes `dist/artifact.html`, the same page without a document wrapper and with the photo inlined, since it has no files beside it.
- The hero photo's calibration and file names are in `assets/earth.json`. `earth_new.jpg` is the master; the web files are encoded from it (WebP 0.85, JPEG 0.84, a 48 by 27 placeholder), so encode them again if the photo changes.
- `src/template.html`: markup, CSS, SVG icon sprite. `src/app.js`: app logic. `src/model.js`: flight path and visibility model (`ORB`). `src/globe.js`: night globe hero for launches outside the photo, spliced into `app.js` at the `/*__GLOBE__*/` marker by the build.
- Performance on phones: the hero is one canvas; what stays still (the photo, the shade) is drawn once offscreen and copied in each frame. Phones draw at 30 frames a second, the hero and Your sky stop drawing when off screen or in a hidden tab, and slow one time work runs in slices (`JOBS`). Animate CSS with transform and opacity only.
- The build packs `data/zipdata.json` as base 36 deltas (`pack_zips`); `app.js` unpacks it at load (`undelta`). The hero launch is staged from `ORB.staging()`, which reads event times from `EVENTS`, so edit events in `src/model.js`, not in the animation.
- `scripts/fetch_launches.py`: pulls Launch Library 2 and writes `launches.json` (each launch may carry `info`, its official mission page; only https links are kept). GitHub Actions runs it every 30 minutes (`.github/workflows/pages.yml`) and deploys. If the API fails, the script exits with an error and the workflow keeps the last good file.
- `scripts/fetch_launches.py` keeps every launch in the next 30 days from every provider, suborbital ones included (one Launch Library request per run, two at most, well inside the 15 an hour limit). Each launch carries a status (go, tbd for to be confirmed, hold), a flight profile key from `src/model.js` (NS is New Shepard straight up and down, SUB other suborbital hops, GEN the generic orbital climb), and `vid`/`vsrc`, its official webcast and where it streams. Fan restreams are skipped.
- `data/providers.json`: each provider's name, official site, live page (`live`, `liveSrc`), social page, one line description and the Launch Library names it matches (`match`). The feed script and the page both read it; the build inlines it. Its `notes` list the links left out because they could not be verified (Roscosmos has no verified links at all, CNSA only its website). Check every link with `sh scripts/check_providers.sh` after editing it. Use only official links and text names, no logos.
- Watch buttons use the launch's own webcast, else the provider's live page, else say no stream is listed. Never guess a channel.
- Hero: every launch pad that falls inside the hero photo uses the photo (`photoPath` in `src/app.js`: the lower 48 states, southern Canada, Mexico, Central America and the Caribbean, where the pad lands well inside the frame). Only pads outside the photo (Alaska, Hawaii and overseas) use the night globe. Both draw for any latitude and longitude.
- Weather comes from the National Weather Service in the visitor's browser. If anything live fails, the page falls back to built in sample data and labels it "Sample".

## Testing without network

- Feed script: `python3 scripts/fetch_launches.py out.json --from-file tests/raw_ll2.json`
- To try the live path locally, build, copy `tests/launches.json` into `dist/`, serve `dist/` over http (`python3 -m http.server 8000 --directory dist`), and open http://127.0.0.1:8000/. `file://` skips the live loading on purpose.
- Mock feed with every provider type and launch sites worldwide (Kodiak to Mahia, Baikonur to Kourou, a fan restream that must be skipped, a pad not picked yet, a launch past 30 days and one in the past):
  1. `python3 tests/make_mock_ll2.py mock.json` (times are relative to now, so run it fresh)
  2. `python3 scripts/fetch_launches.py dist/launches.json --from-file mock.json`
  3. serve `dist/` as above and select each launch: every hero must draw, and the filter bar, provider cards and Watch buttons must cover every provider.
- The real Launch Library sample in `tests/raw_ll2.json` goes through the same two steps (skip step 1). `tests/launches.json` is an older fixture in the page format; do not regenerate or commit changes to it, and never commit `dist/`.
- Playwright and Chromium are available in the cloud workspace. Check for page errors and look at screenshots after any visual change.

## Rules of thumb

- Brand: Astro Brand Kit colors (page #04050C, accent #B9A8FF, violet #7C5CFF, cyan #3FD0F0). The mark in `assets/astro-mark.svg` is the official file from astro-app. `build.py` generates both the nav icon (`i-astro` symbol, at the `__MARK__` marker in `src/template.html`) and the favicon from it, so replace only that file.
- Visibility results are a modeled estimate. Keep that wording honest in the UI.
- Posts and the Astro login are demo only (localStorage).
- No hyphens in copy shown to the user.
