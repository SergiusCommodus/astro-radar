# Fresh data for Live from space, Space news and Space today

`pages.yml` is edited only by the repository's owner, so any change to it here is a proposal.

## What the deploy already does

The deploy workflow (`.github/workflows/pages.yml`, "Build and deploy site", every 30 minutes and on every push to `main`) has this step
before the build:

```yaml
      - name: Fetch Space today from NASA (keep the last good data if NASA is down)
        env:
          NASA_API_KEY: ${{ secrets.NASA_API_KEY }}
        run: |
          pip install --quiet pillow==11.0.0 || true
          python3 scripts/fetch_nasa.py --feed dist/launches.json || true
```

The script writes `data/nasa.json`, `data/nasa/` and `data/news.json` in the runner's checkout, and `build.py` reads them from there and
copies the images to `dist/nasa/`. Nothing is committed by the workflow: each run starts from the committed copy, and a source that fails
keeps that copy, marked stale.

## Why the Live page still went stale (found 16 November 2026)

The deploy logs of every run from the step's first run (about 9 November) to 16 November show the same thing:

1. `ubuntu-latest` is now Ubuntu 26.04, whose `python3` is 3.14. Pillow 11.0.0 has no wheel for Python 3.14, so
   `pip install pillow==11.0.0` tried to compile it from source, failed ("Failed building wheel for pillow"), and `|| true` hid it.
2. `fetch_nasa.py` needs Pillow to scale EPIC's pictures, so EPIC failed on every run with `epic: failed (No module named 'PIL'), kept the
   last good copy`. The page kept the committed EPIC picture and its "Last updated" time, which is why it showed an old Earth.
3. The same missing Pillow meant the build drew no share cards: every launch page's `og:image` fell back to the site's `og-image.jpg`.
4. The picture of the day fails on its own: NASA's APOD API has been answering with a stand in ("NASA Science" with the NASA logo as the
   picture) or HTTP 500. The script refuses that answer and keeps the last good copy; nothing on our side can fix it.
5. The space weather failed on 9 and 10 November (NASA DONKI answered 404) until the script moved to NOAA SWPC; it has worked since.

The step's per source lines went only to the log, so none of this showed on the run's page.

## The fix, in the script (no workflow change needed)

- When Pillow is missing and the script runs in GitHub Actions (or with `--install-pillow`), `fetch_nasa.py` installs `pillow==11.3.0`
  (the first release with Python 3.14 wheels) **from a prebuilt wheel only** (`--only-binary=:all:`, so pip never tries to compile) into
  the same Python, and goes on. The build that follows runs in the same Python, so it has Pillow as well and draws the share cards again.
  With saved answers (`--from-dir`, the tests) it never installs anything.
- Each failed source is printed as before and, in GitHub Actions, also as a `::warning` annotation, so it shows on the run's summary page
  even behind `|| true`.
- The step ends on one summary line, for example:

  ```
  Space today: epic ok (picture 2026-11-16 18:20 UTC), sun ok, events ok, apod failed (kept 2026-11-09), neo ok, news ok; 4 of 5 NASA sources fresh; 0 mission photos; Pillow 11.3.0 (installed)
  ```

  "epic ok" gives the time of EPIC's own picture, which is often a day or two behind the run (EPIC publishes in batches).

`tests/test_nasa.py` checks the summary line, the warnings, EPIC's images made with Pillow from saved images, and that the Pillow install
asks for a wheel only, of a version with Python 3.14 wheels, and never runs without being asked.

## Optional workflow change (proposed, not applied)

The script now copes with the old pin, but the pin still costs each run a failed compile of about five seconds and a page of errors in the
log. To remove it, change the step's first line:

```diff
-          pip install --quiet pillow==11.0.0 || true
+          pip install --quiet --only-binary=:all: pillow==11.3.0 || true
```

`checks.yml` runs on Python 3.12 (`actions/setup-python`), where 11.0.0 has wheels, which is why the pull request checks never showed the
problem.

## What the browser refreshes on its own

While `/live/` is open, `src/live.js` asks every source that is keyless and allows browsers (`Access-Control-Allow-Origin: *`, checked on
15 November 2026) for newer data and updates the card's time to "Updated <time>, live from <source>":

| Card | Source | In the browser |
| --- | --- | --- |
| Earth today | `epic.gsfc.nasa.gov/api/natural` and its archive JPEG | yes: a newer picture replaces the saved one once it has loaded |
| The ISS right now | `celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE` | yes: newer elements, then the map, path and pass |
| Space weather | `services.swpc.noaa.gov` (Kp index, scales) | yes |
| Earth events | `eonet.gsfc.nasa.gov/api/v3/events` | yes |
| Asteroids this week | `ssd-api.jpl.nasa.gov/cad.api` | **no**: JPL sends no CORS header, so only the build can fetch it |
| Space news | `api.spaceflightnewsapi.net` | yes (news.js) |

The build's copy is what the page shows first, offline, and when a source is down, with "Updated" or, for a copy over two days old,
"Last updated" and how long ago.

## Calls and the key

About eight calls a run: EPIC (two images), NOAA SWPC (three files), EONET, JPL close approach and the Spaceflight News API need no key;
APOD uses `NASA_API_KEY` when there is one, else the demo key. Every 30 minutes that is well inside every source's limits. The key is never
written to a file or a log (`clean()` strips it from error messages).
