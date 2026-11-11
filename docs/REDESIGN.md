# Redesign: one planet, one calm hero

George's notes on the live site (11 Nov 2026): the planet background looks terrible; the earlier version (the US at night photo, the
"demo" look) was better; too much is going on (rocket animation, globe card, overlays); one planet scene, not three.

This file holds the research, the visual assessments before and after, and the decisions. Screenshots are in the pull request's
Artifact page (before and after at 390, 768, 1440 and 1920).

## 1. Visual assessment of the live site (before)

Screenshots of https://astroradar.io on 11 Nov 2026 at 390 (3x), 768, 1440 and 1920: the home page, every tab, a launch page, the
Florida page and About. Ranked by how much each hurts, worst first.

1. **The planet does not read as Earth from space.** The hero is a daylight photo of a grey cloud deck under a saturated blue rim, and
   every side fades into black through a wide blur, so the picture looks like fog in a vignette, not a window. On a phone it is a
   210 px band squeezed between the facts and the tab bar, and the tab bar cuts it.
2. **Three planets, three looks.** The hero's daylight photo, the globe card's WebGL Earth at night, and the footer's green aurora
   photo. Each is a different time of day, colour and scale, so the page has no single scene. Add the page's own starfield, the hero's
   star canvas and the footer's star canvas.
3. **The globe card competes with the copy.** On a desktop it sits beside the headline as a second hero with its own caption; its
   readout tag ("LONG MARCH 2D T+0:01 · 0 KM") sits on the planet; the rocket and its path are a few pixels long. On a phone it is a
   full width card under the hero, 370 px tall, that pushes everything else down.
4. **The phone's main button has no words.** At 390 the blue button is a bell icon alone (the "Set reminder" label is hidden by the
   phone rules when it is the main button), so the most important control on the first screen says nothing.
5. **The data looks stale.** The live hero says "Data delayed · updated 5 h ago". The scheduled build runs every 30 minutes on paper
   but GitHub delayed it by hours (runs at 23:56, 04:37, 05:54 UTC), and the Worker that would serve a live feed is not configured
   (`feedUrl` is empty). Not a design problem, but it undermines every number on the page. Fix: deploy the Worker (see
   `worker/README.md`) and set `FEED_URL`; nothing in this pull request can fix it.
6. **The sub line is hard to read.** The pad, in spaced capitals, runs to an ellipsis at every width ("LAUNCH AREA 94 (SLS 2 / 603),
   JIUQUAN SATELLITE LAUNCH CENTER, P…").
7. **The countdown wastes the first screen.** Under a day it still shows "00 DAYS"; the four huge pairs take as much room as the name.
8. **Too many small capitals.** The kicker, status, data tag, tab names, button labels, fact labels, section labels and footer line are
   all spaced capitals, so nothing stands out among them.
9. **The other pages are another site.** Launch pages, Florida and About have their own header ("ALL LAUNCHES" only), a narrower
   column, underlined body links, a flat black page with no stars, and the condensed headline at twice the main page's size.
10. **The footer is 600 px of picture.** A long disclaimer, three link groups, then an aurora photo with nothing on it.
11. **The Watch tab has a fourth illustration**: a drawn rocket trail over a hill in the "Next live stream" card, with a disabled
    looking "No stream yet" button.
12. **Recent launches cut text** to one line with ellipses at every width.

What is good and must stay: the Barlow pair and its numerals; the navy and cool blue palette; the countdown itself; the honest wording
(a modeled estimate, clouds not counted, the stream as the way to watch); the launch list (one clean row each, logos on chips, the
status at the right); the ZIP verdict card; the 44 px targets; and the performance discipline (nothing drawn per frame off screen,
no layout shift).

Slow: nothing measured slow on a desktop. On a phone the hero photo (92 KB AVIF) is the LCP; the globe card loads WebGL, 26 KB of
script and 2k textures (about 600 KB) on every phone for a picture 370 px tall.

## 2. Earlier heroes, rebuilt

Each version was checked out, built with today's mock feed and photographed at 390, 1440 and 1920.

| Version | Commit | Hero | Verdict |
|---|---|---|---|
| The US at night photo ("demo") | db34bf3 (3 Nov) | `assets/earth_new.jpg`, a night view of North America with city lights, a sunrise on the limb and the Moon, full bleed behind the copy | The look George liked: one picture, warm city lights, the copy on it. But the file is 1672 by 941 (soft on any screen over 1600 px and on a 3x phone) and its source is not recorded anywhere in the repository; its perfect lights, cloud shading and the Moon placed on the limb read as a render, not a photograph. It cannot be credited or sharpened. |
| The live limb (v2design) | e5f2e35 (9 Nov) | WebGL Earth at night under the copy | Sharp lights but plainly computer graphics: flat black ocean, a lilac rim. |
| NASA footage and the globe card (PR 44) | f96b7ee (10 Nov) | 4K ISS video of a daylight limb, the globe card beside the copy | Real, but daylight cloud, video softness, and two planets. |
| NASA stills (PR 45 to 47, live now) | ff01624 | ISS074-E-89803, a daylight limb over the Pacific, plus the globe card and the aurora footer | Real and sharp, but a cloud deck with a blurred frame; three planets. |

Most like real Earth: the NASA stills (they are real), but the night photo is the look that worked. The answer is a real NASA night
photograph in the US at night layout.

### NASA night photographs (Gateway to Astronaut Photography and the NASA Image and Video Library, public domain)

Searched images-api.nasa.gov ("city lights night earth limb space station", "night lights airglow horizon", "united states night",
"east coast night", "florida night", "airglow", "orbital night pass", 2009 to 2025; 327 frames, 42 on contact sheets, 5 downloaded at
full size and checked at 100 percent).

| Frame | Pixels, camera, exposure | What | At 100 percent | Verdict |
|---|---|---|---|---|
| ISS030-E-55569 (29 Jan 2012) | 4256 by 2832, Nikon D3S, 0.5 s, ISO 3200 | the Southeast at night, Atlanta to Jacksonville and the Florida coast, a gold and green airglow on the limb, a starry sky | city lights drawn into short streaks of 3 to 6 px by the 0.5 s exposure; stars sharp; little noise | **Hero**: the warm US at night look; truss along the top edge crops out |
| ISS070-E-62746 (10 Jan 2024) | 5568 by 3712, Nikon D5, 1/13 s, ISO 65535 | the central US and its city lights under the airglow, a dense starry sky | the sharpest points of any frame, but heavy grain from ISO 65535 and soft glows where light comes through cloud; a solar array in the bottom right corner | Reserve |
| ISS072-E-189824 (17 Nov 2024) | 8256 by 5504, Nikon Z 9, 0.3 s, ISO 8000 | Florida at night under moonlit clouds, a green and amber airglow | camera shake: every light is a squiggle 20 to 40 px long; a solar array at the top | Not used: shake |
| ISS029-E-12564 (29 Sep 2011) | 4256 by 2832, Nikon D3S, 1.3 s | the Midwest at night with an aurora | 1.3 s streaks; hardware along the top | Not used |
| ISS073-E-982450 (25 Oct 2025) | Nikon Z 9 | the eastern US under a blue green airglow | solar arrays and a module fill a third of the frame | Not used |

## 3. Benchmark: one scene with a countdown

| Site | Hero |
|---|---|
| SpaceX (launches) | one full bleed photo of the rocket; a small T minus countdown over a big mission name, bottom left; one outlined Watch button. Nothing else. |
| NASA | one photo; a headline, one sentence, one red button; three small links under a hairline. |
| Next Spaceflight | a list of cards, each a photo with a countdown chip and the name; no hero. |
| RocketLaunch.live | a text list, no picture. |
| Apple | one picture, a two line headline, one or two buttons, centered. |

The simplest layout that fits our content is SpaceX's and NASA's: one picture full bleed, the copy at the lower left on its dark sky
(at the bottom on a phone), a small status line, the name, the countdown, one main button and one quiet second one, and one line of
three facts. Everything else goes below the fold or into More.

## 4. Delivering one sharp still

- AVIF first, WebP after, through `<picture>` with `srcset` widths (wide: 1280, 1920, 2560, 3840; phone: a portrait cut at 828 and
  1290) and `sizes="100vw"`, so a 1440 screen at 1x takes 1920 and a 3x phone takes 1290.
- The phone's image is preloaded with `imagesrcset` and `fetchpriority="high"`; nothing else blocks it, so it is the LCP.
- The photo's own stars are real but soft at 3x; the page's still star canvas (drawn at the screen's density) carries the sharp stars
  above the limb and down the page.
- No video and no WebGL in the hero. A slow drift on the compositor (transform only), off with reduced motion.
- Grain: the photo is lightly denoised before resizing (median 3 on the dark sky only), then dithered by one step so the black and the
  airglow do not band.

## 5. The browsers check (WebKit and Firefox) that failed on pull requests 44 and 48

Both failures were the same line: `FAIL webkit iPhone 13: the run stopped: page.evaluate: Target page, context or browser has been
closed`, about 34 seconds into the iPhone run, after the desktop WebKit run and before Firefox. That is WebKit's web process dying, not a
failed check. To find where:

- `tests/browsers.cjs` now names the step a run is in and reports a page crash with it (`step`, `p.on('crash')`); nothing it checks
  changed.
- A throwaway probe on main's code (pull request 51, closed) ran the iPhone profile six times, the WebGL world on and off in turn, and
  its job was run twice: 12 runs. The one crash came during "scroll to the footer" with the world on. With the world off: 0 crashes in 6.
  With it on: 1 in 6 here, plus the two on 44 and 48.

The cause: Linux WebKit (software GL in CI) crashing while the page scrolls past a live WebGL canvas on the 3x iPhone profile. It is
intermittent (about one run in three with the world on) and never happened without WebGL. The redesign removes WebGL from the site (the
globe card and world.js are gone), so the crash path is gone with it; the test is not loosened. Pull request 50 runs the browsers check
three times to show it.

## 6. Live data: Live from space and Space news (checked 11 November 2026)

Every source below was called three times from a desktop on 11 November 2026 (`probe.py` in the session notes): the status, the time,
the limits it reports and whether a browser may read it (CORS).

| Source | What we use | Result (3 calls) | Limits | Terms and credit | Used |
|---|---|---|---|---|---|
| NASA EPIC (epic.gsfc.nasa.gov/api/natural) | the latest natural color Earth, where it was centred | 200, 0.4 s each; CORS open; the newest set was 4 days old | none stated | NASA data, public domain; "NASA EPIC team" | **Yes**, build time (Live, Space today) |
| NASA APOD (api.nasa.gov/planetary/apod) | the picture of the day | 200, then HTTP 500, then a 30 s timeout | DEMO_KEY: 30 an hour, 50 a day per address | public domain unless a copyright is named | **Space today only**, with its last good copy; **not on Live**: not reliable |
| NASA DONKI (api.nasa.gov/DONKI, kauai.ccmc.gsfc.nasa.gov) | flares, storms | 404, 404, 404; the CCMC host never answered (42 s timeouts) | | | **Dropped**: replaced by NOAA SWPC |
| NOAA SWPC (services.swpc.noaa.gov) | X ray flares (7 days), planetary Kp, NOAA scales | 200, 0.06 to 0.12 s; CORS open; max-age 60 | none stated | US government work, public domain; "NOAA Space Weather Prediction Center" | **Yes**, build time and in the browser |
| NASA NeoWs (api.nasa.gov/neo) | asteroids this week | 200 three times, then HTTP 429 to the shared DEMO_KEY | X-RateLimit-Limit 10 on DEMO_KEY | public domain | **Dropped**: needs a key; replaced by JPL's close approach API |
| NASA JPL SBDB close approach (ssd-api.jpl.nasa.gov/cad.api) | asteroids within 0.05 au in 7 days | 200, 0.3 to 0.6 s | none stated, no key | NASA/JPL; "NASA JPL Center for Near Earth Object Studies" | **Yes**, build time |
| NASA Image and Video Library (images-api.nasa.gov) | mission photos on NASA launch pages | 200, 0.1 to 0.2 s; CORS open | none stated | public domain unless noted; per image credit kept | **Yes** (unchanged) |
| NASA EONET (eonet.gsfc.nasa.gov/api/v3) | open natural events of 30 days | 200, 0.2 to 0.5 s; CORS open | 60 an hour reported | NASA open data; "NASA EONET" | **Yes**, build time and in the browser |
| Mars rover photos (api.nasa.gov/mars-photos) | | 404, then 429 | | | **Dropped**: no longer served |
| NASA Exoplanet Archive (TAP) | | 200, 1.2 to 1.4 s (6,464 confirmed planets) | none stated | NASA/Caltech IPAC, credit asked | Not used: nothing on the pages needs it yet |
| CelesTrak (celestrak.org) | the ISS's orbital elements | 200, 0.4 to 0.6 s; CORS open | none checked here (the feed already fetches it once per 30 minute run) | free; credit CelesTrak | **Yes** (already in the feed, every 30 minutes) |
| wheretheiss.at | ISS position | 200, 0.5 s | | | Not used: the position is worked out locally from CelesTrak's elements |
| Open Notify (api.open-notify.org) | ISS position | 200, 0.15 s, but http only | | | **Dropped**: no https |
| Launch Library 2 (ll.thespacedevs.com) | the launch feed | 200, 0.1 to 0.25 s | 15 an hour without a key | free; "Launch Library 2, The Space Devs" | **Yes** (unchanged) |
| Spaceflight News API (api.spaceflightnewsapi.net/v4) | the latest headlines | 200, 0.1 to 0.2 s; CORS open; max-age 600 | none stated | free public API by The Space Devs, aggregating publishers' headlines and summaries; no written terms beyond that; we show only the headline, publisher, date and a first line, and link to the publisher | **Yes**, build time and in the browser |

**Fetching safely.**
- `scripts/fetch_nasa.py` fetches everything at build time into `data/nasa.json` and `data/news.json`.
- A source that fails keeps its last good copy, marked stale. Its card then says "Last updated" with the date.
- The only key it can use is `NASA_API_KEY`, now needed only for APOD. The key comes from the environment, is never written, printed or sent to the page, and errors have it removed. `tests/test_space_pages.py` searches `dist/` and `data/` for any `api_key=` value, and for the key itself when it is set.
- Searching the git history for an api.nasa.gov key: `git log -p --all | grep -E "api_key=[A-Za-z0-9]{20,}"` finds nothing. Only `DEMO_KEY` appears.

**The 30 minute workflow.** `pages.yml` is not changed here: the repository's rule is that it is edited only by its owner. The step to add
is in `docs/live-data-workflow.md`. Until it is applied:
- the build uses the committed `data/*.json` (refresh it with `python3 scripts/fetch_nasa.py` and commit);
- while a page is open, the browser fetches fresh space weather, Earth events and headlines (keyless and CORS open), so the pages are
  current even when the commit is not.

**Layout.** NASA's front page and Space.com run long feeds with images. Next Spaceflight's news page is a list of cards. The simplest fit
for the calm style:
- **Live:** one column of glass cards (two from 900 px), each its source line and time.
- **News:** a plain list per group, the headline, the publisher and date, and one line.

No images from publishers, no infinite scroll, nothing on the home page.
