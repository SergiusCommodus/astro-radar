# Fresh data for Live from space, Space news and Space today (proposed, not applied)

`pages.yml` is edited only by the repository's owner, so this is a proposal.

## Why the Live page went stale

The deploy workflow fetches the launch feed every 30 minutes, but it never runs `scripts/fetch_nasa.py`. So the build keeps using the
committed `data/nasa.json` and `data/news.json` until someone runs the script by hand and commits them. On the live site in November 2026
that left the EPIC picture from November 7 and every card saying "Last updated" November 11.

## What the browser now refreshes on its own (Part 1, no workflow change needed)

While `/live/` is open, `src/live.js` asks every source that is keyless and allows browsers (`Access-Control-Allow-Origin: *`, checked on
15 November 2026) for newer data and updates the card's time to "Updated <time>, live from <source>":

| Card | Source | In the browser |
| --- | --- | --- |
| Earth today | `epic.gsfc.nasa.gov/api/natural` and its archive JPEG | yes: a newer picture replaces the saved one once it has loaded |
| The ISS right now | `celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE` | yes: newer elements, then the map, path and pass |
| Space weather | `services.swpc.noaa.gov` (Kp index, scales) | yes |
| Earth events | `eonet.gsfc.nasa.gov/api/v3/events` | yes |
| Asteroids this week | `ssd-api.jpl.nasa.gov/cad.api` | **no**: JPL sends no CORS header, so only the build can fetch it |
| Space news | `api.spaceflightnewsapi.net` | yes (news.js, already) |

The build's copy is what the page shows first, offline, and when a source is down, with "Updated" or, for a copy over two days old,
"Last updated" and how long ago.

## What still needs the build: the asteroids, Space today on the main page, and the first paint

Add this step to the build job in `.github/workflows/pages.yml`, right after the step that fetches `dist/launches.json` and before
`python3 build.py`:

```yaml
      - name: Fetch NASA, NOAA and space news data
        env:
          NASA_API_KEY: ${{ secrets.NASA_API_KEY }}   # optional; only APOD uses it. Add it under Settings, Secrets and variables, Actions
        run: |
          pip install --quiet "pillow>=11.3"
          python3 scripts/fetch_nasa.py --feed dist/launches.json || echo "NASA data: kept the last good copy"
```

- **Calls per run:** about eight. EPIC (two images), NOAA SWPC (three files), EONET, JPL close approach and the Spaceflight News API need
  no key; APOD uses the key when there is one, else the demo key. Every 30 minutes that is well inside every source's limits.
- **Failures:** a failed source keeps its last good copy, marked stale, and the step never fails the deploy.
- **The key:** it is never written to a file or a log (`clean()` in the script strips it from error messages).
- **The results:** they land in `dist/` only through the build, so nothing is committed by the workflow.

Until it is applied, run `python3 scripts/fetch_nasa.py` and commit `data/nasa.json`, `data/nasa/` and `data/news.json` now and then
(Part 1 did so on 16 November 2026).
