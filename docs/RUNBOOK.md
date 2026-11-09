# Astro Radar runbook

Plain language notes for running astroradar.io: how it gets built, where its data comes from, what it costs, how to undo a bad change and what to do when a source goes down.

## How the site is built and published

- **The site is static.** GitHub Pages serves it, and it is built from the `main` branch by the "Build and deploy site" workflow (`.github/workflows/pages.yml`).
- **When it runs:** on every push to `main`, every 30 minutes on a timer, and by hand from the Actions tab ("Run workflow").
- **Each run does three things:**
  1. Fetches the launch list from Launch Library 2 (`scripts/fetch_launches.py`), along with the ISS orbital elements from CelesTrak.
  2. Builds the page (`python3 build.py`).
  3. Publishes `dist/`.
- **If the launch fetch fails,** the run reuses the last published `launches.json`, so the site keeps working with slightly older data.
- **Pull requests** run the checks workflow (`.github/workflows/checks.yml`): the tests, the page smoke test, the contrast, palette and performance budget tests, and the provider link check. A red check means do not merge yet.
- **Every Monday** the link check workflow (`links.yml`) opens an issue if a provider link breaks.

## Where the data comes from

| Data | Source | Key | Limits | Cost |
|---|---|---|---|---|
| Launches | Launch Library 2, The Space Devs (ll.thespacedevs.com) | none | 15 requests an hour without a key. The deploy uses 1 or 2 a run; the Worker caps itself at 10 an hour | free |
| Live launch updates while the page is open | the Cloudflare Worker in `worker/` (the same data, cached 5 minutes) | none | Cloudflare's free plan is enough (worker/README.md) | free |
| Weather at launch time | National Weather Service (api.weather.gov), asked by each visitor's browser | none | generous; no key | free |
| ISS orbital elements | CelesTrak (celestrak.org), with the launches | none | one small request a run | free |
| Space today (Earth, Sun, picture of the day, asteroids) | NASA APIs through `scripts/fetch_nasa.py` | `NASA_API_KEY` secret, else DEMO_KEY | DEMO_KEY: 30 an hour and 50 a day per address; a free personal key: 1,000 an hour | free |
| Mission photos on NASA launch pages | NASA Image and Video Library | none | none stated | free |
| Earth textures, logos, fonts | files in the repository (`assets/`) | none | none | free |
| Hero planet loops on phones and tablets | files in the repository (`assets/loop/`): 1.3 to 1.5 MB on a phone, 1.8 to 2.2 MB on a tablet, loaded after the page | none | GitHub Pages bandwidth (100 GB a month soft limit) | free |

The NASA fetch is not in `pages.yml` yet. The proposed step is in OVERNIGHT3.md. Until it is added, the site shows the NASA data last committed in `data/nasa.json`.

Hosting costs nothing: GitHub Pages, and Cloudflare's free plan for the Worker. The domain registration is the only bill.

## Is the live site healthy?

Run these checks, quickest first:

1. **Open https://astroradar.io.** The hero should show a launch with a countdown. A small grey tag reading "Sample" or "Offline" near the title means the live data did not load.
2. **Open https://astroradar.io/launches.json.** It shows `"generated"`, the time of the last refresh, which should be within the last hour or so. If it is hours old, the deploy workflow is failing.
3. **Look at the Actions tab on GitHub.** Under "Build and deploy site", each run should be green, one every 30 minutes. A red run shows its log; the fetch step names the source that failed.
4. **Check the Worker, if `FEED_URL` is set.** Open the Worker's address with `/feed`. The `X-Feed-Source` response header says whether it is serving fresh Launch Library data or the fallback copy.
5. **Use the diagnostics on a phone.** Add `?fps` to the address for an overlay showing the frame rate, the tier, and whether the hero is the live world, the loop or the photo.

## Undo a bad merge

Use the safe way, which keeps history:

1. Open the merged pull request on GitHub and press **Revert**. GitHub opens a new pull request that undoes it.
2. Merge that revert pull request. The deploy runs on its own and the site is back within a few minutes.

If the GitHub button is not offered, do it from a terminal:

```bash
git checkout main
```

```bash
git pull
```

```bash
git revert -m 1 <merge commit id>
```

```bash
git push
```

Never force push `main`. To put the site back in a hurry while you investigate, open Actions, choose "Build and deploy site", press "Run workflow", and pick an older commit or tag if the workflow offers it.

## When a source goes down

| Source down | What visitors see | What to do |
|---|---|---|
| Launch Library 2 | The last good launch list keeps showing. The deploy reuses the last published `launches.json`, and the Worker serves its last good copy, marked stale | Usually nothing; it recovers by itself. If it lasts more than a day, check thespacedevs.com for news. An HTTP 429 means the hourly limit was hit: wait an hour |
| The Cloudflare Worker | The page falls back to `launches.json` on its own (`fetchFeed`) | Nothing urgent. Redeploy from `worker/` (README there) when convenient, or clear the `FEED_URL` variable to stop using the Worker |
| National Weather Service | The visibility rating says clouds are not counted (it never uses sample weather) | Nothing; it is per visitor and recovers by itself |
| CelesTrak | The ISS card keeps the last good elements, marked stale, and shows nothing once they are ten days old | Nothing urgent |
| NASA APIs | Each Space today card keeps its last good data, marked with its age. A source that never answered shows no card | Nothing urgent. If DEMO_KEY is the problem (HTTP 429), add a free key from https://api.nasa.gov/ as the repository secret `NASA_API_KEY` |
| GitHub Pages or Actions | The site may be stale or unreachable | Check https://www.githubstatus.com. Nothing in this repository can fix it |
| A provider's website or stream link | One Watch or website link fails | The Monday link check opens an issue. Fix the link in `data/providers.json`, run `sh scripts/check_providers.sh`, and use only official links |

## Regenerating media

These files are made by scripts and committed:

- **The planet loops** (`assets/loop/`): `python3 build.py && node scripts/render_loops.cjs`. Needs Playwright, Chrome with a GPU, and ffmpeg. The hero loops have their own caps in the script (1.6 MB on phones, 2.4 MB wide) and are encoded in two passes; the footer loop uses `MAXMB` (1.5 MB).
- **Logo PNGs for share cards:** `node scripts/render_logo_pngs.cjs`, after adding or changing a logo.
- **The QR code** on /ksc: `python3 scripts/make_qr.py`.
- **World textures:** `python3 scripts/build_world_textures.py <downloads folder>`. The sources are in `assets/world/SOURCES.md`.

After any of these, run the performance budget test (`python3 -m unittest tests.test_budget`). It fails if a file grew past its limit.
