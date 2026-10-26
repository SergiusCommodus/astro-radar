# Astro Radar

A rocket launch tracker demo under the Astro brand. It opens on a photo of Earth at night, counts down to the next launch, and tells you where to look from any US ZIP code.

## What is in it

- **Hero** with a live countdown and a rocket arcing off Cape Canaveral
- **Sky tab** that shows the viewing verdict, a compass bearing and a sky simulation for your ZIP code
- **Launches tab** with the manifest, reminders, and Watch links to each provider
- **Watch tab** with official sites and YouTube channels
- **Astro tab** with a launch thread feed and a demo login

## Build

```
python3 build.py
```

This writes `dist/index.html`, one self contained file. Open it in a browser or host it anywhere static.

## Layout

| Path | What it holds |
| --- | --- |
| `src/template.html` | Markup, styles and the SVG icon sprite |
| `src/app.js` | App logic, sample launches, weather, posts |
| `src/model.js` | Flight path and visibility model |
| `data/zipdata.json` | Compact table of about 41,700 US ZIP codes |
| `assets/earth.jpg` | Earth photo used in the hero |

## Live data

- **Launches** come from [Launch Library 2](https://thespacedevs.com/llapi) by The Space Devs. A GitHub Actions job (`.github/workflows/pages.yml`) runs every 30 minutes, runs `scripts/fetch_launches.py`, and publishes `launches.json` next to the page. If the API is down, the job keeps the last good file. If there is no file at all, the site shows built in sample launches and says so.
- **Weather** comes from the National Weather Service (`api.weather.gov`), looked up in the visitor's browser for their ZIP code. Forecasts reach about 7 days out, so later launches show a labeled sample forecast.
- **Visibility** is a model. Each launch gets a flight direction worked out from its pad and target orbit, and a typical climb profile for its rocket. Treat results as estimates.

Test the feed script without network: `python3 scripts/fetch_launches.py out.json --from-file tests/raw_ll2.json`

## Status

Posts and the Astro login are still demo only. The visibility model has not been checked against real trajectories.

## Next steps

1. Add a custom domain
2. Check visibility verdicts against past launches
3. Connect the Astro tab to the main Astro login and feed
