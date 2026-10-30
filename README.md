# Astro Radar

A rocket launch tracker under the Astro brand, live at https://astroradar.io. It opens on a photo of Earth at night, counts down to
the next launch, and tells you where to look from any US ZIP code, as a modeled estimate.

## What is in it

- **Hero** with a live countdown and the launch drawn over the Earth photo, or over a night globe with NASA imagery for pads outside
  the photo (Kourou, Mahia, Sriharikota, Tanegashima, Jiuquan, Baikonur, Kodiak and others)
- **Your sky tab**: the rating for your ZIP code, "Why this rating" (sun, distance, direction, weather), "How we estimate this", a
  compass bearing and a sky simulation
- **Launches tab**: every launch in the next 30 days, reminders, calendar files, Watch links, a page per launch, and a calendar
  subscription
- **Watch tab**: official sites and live pages for each provider
- **Astro tab**: send a launch to friends on Astro (Share to Astro and Copy link are also on the hero and every row); this site has
  no accounts
- **A page for every launch** at `/launch/<id>/`, with its own title, preview, structured data and calendar file
- **Installable**: add it to a phone's home screen; it opens offline on the last update and says so

## Build

```
python3 build.py
```

This writes `dist/`: `index.html`, the launch pages, the sitemap, robots.txt, the 404 page, the calendar feed, the manifest, the
service worker, the photo, the globe imagery and the fonts. Serve `dist/` over http (`python3 tests/serve.py dist 8000` serves it
the way GitHub Pages does). The deploy fetches the live feed into `dist/launches.json` before it builds, so the page and the launch
pages open on live launches.

## Layout

| Path | What it holds |
| --- | --- |
| `build.py` | Assembles the page and every file in `dist/` |
| `launch_pages.py` | The launch pages, sitemap, robots.txt, 404 page and calendar files |
| `src/template.html` | Markup, styles and the SVG icon sprite |
| `src/app.js` | App logic, live feed, weather, rating text, sharing |
| `src/model.js` | Flight path and visibility model |
| `src/globe.js` | Night globe for pads outside the photo |
| `src/sw.js` | Service worker (offline shell and last good feed) |
| `data/providers.json` | Each provider's official links |
| `data/zipdata.json` | Compact table of about 41,700 US ZIP codes |
| `assets/` | Earth photo, globe imagery (`CREDITS.md`), icons, fonts |
| `scripts/fetch_launches.py` | Launch Library 2 to `launches.json` |
| `worker/` | Cloudflare Worker that serves the live feed |
| `tests/` | Visibility tests, launch page tests, the page smoke test, mock feeds |
| `docs/ALERTS-DESIGN.md` | Launch day alerts: options and the recommended order |

## Live data

- **Launches** come from [Launch Library 2](https://thespacedevs.com/llapi) by The Space Devs. GitHub Actions (`pages.yml`)
  fetches them every 30 minutes and deploys; the page also polls the live feed Worker while it is open. If the API is down the last
  good file stays. With no data at all the site shows built in sample launches and says so.
- **Weather** comes from the National Weather Service (`api.weather.gov`) in the visitor's browser. Its sky cover can only lower
  the rating; with no forecast, clouds are not counted and the page says so.
- **Visibility** is a model and the page says so: for every second of the flight it works out where the rocket is, how high above
  your horizon, how far, and how it is lit (daylight trail, sunlit plume after sunset or before sunrise, or engine flame in the
  dark). The limits come from documented sightings; `tests/visibility.test.mjs` lists 39 observer cases from 16 launches with
  their sources. The flight heading is guessed from the orbit.

## Tests

```
node --test tests/*.test.mjs                          # visibility model
python3 -m unittest discover -s tests -p "test_*.py"  # launch pages and calendar files (after a build with a feed)
cd worker && npm test                                  # the Worker and its parity with the Python feed script
node tests/smoke.cjs                                   # the built site in Chromium (needs Playwright)
sh scripts/check_providers.sh                          # every provider link
```

Pull requests run all of these (`.github/workflows/checks.yml`); a weekly job (`links.yml`) opens an issue if a provider link
breaks.

## Credits

Globe imagery: NASA Earth Observatory (Blue Marble, Black Marble), see `assets/CREDITS.md`. Fonts: Barlow and Barlow Condensed (SIL
Open Font License). Astro Radar is independent and not affiliated with any launch provider or space agency.
