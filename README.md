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

## Status

Demo data. Launches, weather and posts are samples, the login is local only, and the visibility model has not been checked against real trajectories.

## Next steps

1. Swap the placeholder mark for the real Astro logo
2. Pull the schedule from Launch Library 2 and forecasts from the National Weather Service
3. Check visibility verdicts against past launches
4. Connect the Astro tab to the main Astro login and feed
