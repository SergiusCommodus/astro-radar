# Overnight run 2, October 30, 2026

Branch `overnight2`, cut from `origin/main` (adc8a49). Nothing is merged into main; one pull request at the end.

## What I did

1. **Visibility accuracy.** This branch carries pull request 18 (the cautious model, clouds in the rating, "Why this rating", "How we
   estimate this"). On top of it: two more documented twilight launches from Vandenberg (Iridium 4 in 2017, SAOCOM 1A in 2018,
   from Spaceflight Now, KQED and KOLD). Both were seen in Arizona about 800 km away, where the model said Not visible, so the sunlit
   plume limit went from 800 to 950 km (still rated Low view). Now 39 observer cases from 16 launches: 35 match, 4 are more
   cautious than an official map, none contradict a sighting.
2. **Better globe** (removed on 30 October after main took pull request 17; see the log). Launches outside the photo now show NASA's Blue Marble on the day side and Black Marble city lights at night
   (237 KB of WebP, public domain, credited in the footer and `assets/CREDITS.md`), with the old drawing as a fallback. Tested on
   Kourou, Mahia, Sriharikota, Tanegashima, Jiuquan, Baikonur and Kodiak at all tiers. The pad label no longer covers the Share row.
3. **A page for every launch** at `/launch/<id>/`: name, vehicle, pad, time (UTC, the pad's zone, the visitor's), status, Watch
   links, Share to Astro, Add to calendar, a plain "Can I see it?" note, title, description, canonical, Open Graph and Twitter tags,
   Event structured data, plus `sitemap.xml`, `robots.txt` and a 404 page that sends retired launch links to the radar. Under 6.1 KB
   each. Copy link now gives the launch page; `?launch=<id>` still works.
4. **Installable.** Web app manifest, icons from the Astro mark, and a service worker that keeps only the shell, the photo and the
   last good launches.json. Offline, the page says "Offline, showing last update" with a toast. Each deploy replaces the worker.
5. **Quality and safety net.** A content security policy. A page smoke test (`tests/smoke.cjs`, 124 checks) and Python tests for
   the launch pages. `checks.yml` runs on pull requests; `links.yml` opens an issue every Monday if a provider link breaks.
   Accessibility audit of every page and tab: one contrast fix (the launch page button). Fallback fonts now match Barlow's metrics,
   which removes an old layout shift when fonts arrive late.
6. **Launch day alerts.** `docs/ALERTS-DESIGN.md` compares Astro push, email (Worker and Resend) and calendar, and recommends
   calendar first, Astro push second, email last. Built: the calendar subscription (`launches.ics`, alerts a day and 30 minutes
   before) and per launch calendar files, all in UTC. No server, no stored data.
7. **Docs.** README.md and CLAUDE.md describe the site as it now is.

## Before and after (the branch's starting point 9937199 against the end, same mock feed, median of 3, Chrome)

| Width | Layout shift | Layout shift, fonts 1.2 s late | First paint | Bytes loaded |
|---|---|---|---|---|
| 390 | 0 → 0 | 0.0054 → 0.0019 | 200 → 164 ms | 1,418 → 1,425 KB |
| 768 | 0.0004 → 0.0010 | 0.0043 → 0.0013 | 192 → 168 ms | same |
| 1440 | 0.0003 → 0.0025 | 0.0106 → 0.0027 | 192 → 176 ms | same |
| 1920 | 0.0001 → 0.0012 | 0.0055 → 0.0014 | 196 → 176 ms | same |

`index.html` 273 → 280 KB (89 → 92 KB gzipped). The globe images (237 KB) load only for launches outside the photo. Phone speed
(390 wide, 4x CPU throttle, five alternating runs): main thread 4,980 against 4,974 ms, script 1,359 against 1,362 ms; on a
Baikonur globe launch 4,987 against 4,974 ms. Even. The layout shift at normal speed is up slightly (0.001 to 0.0025, still near
zero): with the security policy the browser paints before the fonts more often, and what is left is the tiny difference between
the fallback and Barlow.

## Choices I made without asking

- Brought pull request 18 into this branch (Part 1 builds on it). Left pull request 17 out (it takes the globe away; Part 2
  improves it), but took its one line pad label fix.
- Globe textures at 2048 wide, not 4096, to keep phone memory down (a 4096 texture needs a 32 MB pixel buffer).
- The launch page "Can I see it?" note describes what the light allows at the pad and on the rocket, not a per ZIP rating, and
  links to the radar for that.
- Share to Astro still sends `?launch=<id>` as its `url` (the astro-app share route expects it); Copy link gives the launch page.
- The service worker serves the page network first (deploys show at once), not cache first.
- The provider link check in `checks.yml` only warns on a 403 or 429 (a provider site refusing a cloud machine) and fails on any
  other answer; the weekly job opens an issue.
- Playwright 1.49.1 in CI, installed at run time, not committed.
- Inline styles stay allowed in the security policy (the script sets style attributes); scripts are locked to hashes.
- The Subscribe to calendar link shows only when the build had live launches.

## What I could not verify

- **The weekly link job.** `checks.yml` now passes on this pull request (all tests, smoke 124 checks with the feed and 21 without;
  it needed Node 24, see the log). `links.yml` only runs on its schedule or by hand once it is on main, so the issue it opens has
  never been tested. Blue Origin answers 429 to GitHub's machines; the weekly job treats 403 and 429 as refused, not broken.
- **A real iPhone and Android:** adding to the home screen, the service worker on Safari, the offline notice, and the globe's
  memory use on an older phone. Tested only in Chrome (desktop and phone emulation).
- **Calendar apps:** the feed passes RFC 5545 line and escape checks in tests, but was not added to Apple, Google or Outlook
  calendars. Google Calendar refreshes subscriptions on its own schedule (hours to a day).
- **Search engines:** the structured data parses and has the Event fields, but was not run through Google's Rich Results test.
- The visibility model is still an estimate. The new 950 km limit rests on two sightings, and the flight heading is still guessed
  from the orbit (Cape polar launches are guessed at 189 degrees; the real corridor is near 165).

## Risks

- Launch pages exist only for launches in the feed at build time. A launch the Worker adds between deploys has no page until the
  next build (within 30 minutes); Copy link falls back to `?launch=` for it.
- The security policy blocks any new origin the page fetches until it is added to `CONNECT` in `build.py`. The smoke test catches
  a violation.
- A service worker bug could keep an old shell on a visitor's device. The worker is versioned per build and the page is network
  first, which the tests check, but a "kill switch" (a `sw.js` that unregisters itself) is worth knowing about if it ever misbehaves.
- The globe images add 237 KB for overseas launches only.

## Recommended next steps

1. Watch the checks on this pull request; fix anything the GitHub runner sees that my machine did not.
2. Try it on a real iPhone: add to home screen, go offline, open it, and a globe launch with `?fps`.
3. Subscribe to `launches.ics` in Apple Calendar and Google Calendar and check a moved launch updates.
4. Decide on pull request 17 (photo for every launch) against this branch's globe.
5. Astro push for launch reminders (docs/ALERTS-DESIGN.md, option 1) in the astro-app repo.
6. Improve the flight heading: a table of known corridors per pad and orbit, in the feed script and the Worker together.


## Progress log

- 01:51 Started. Created `overnight2` from `origin/main`.
- 01:52 Choice: brought in `visibility-check` (pull request 18, not merged yet) by a fast forward, since PART 1 asks for the same work and builds on it. If 18 is merged first, this branch still merges cleanly.
- 01:52 Choice: did not bring in `hero-fix` (pull request 17). It shows the photo for every launch, while PART 2 asks for a better globe for launches outside the photo. The two go in opposite directions; the globe path is kept here.
- 01:53 Baseline build with a fresh mock feed (`tests/make_mock_ll2.py`) inlined: `dist/index.html` 273,341 bytes.
- 01:55 Baseline check (`check.cjs`, scratchpad): 390, 768, 1440 wide no errors, layout shift 0 to 0.0004; 1920 once showed a 0.13 shift (the intermittent desktop shift seen on main before); six more runs at 1920 gave 0.0001 each.
- 02:00 PART 1: the model, clouds, "Why this rating" and "How we estimate this" come from pull request 18. Added two documented Vandenberg twilight launches to `tests/visibility.test.mjs`: Iridium 4 (Dec 22 2017, Spaceflight Now: photos from Hawthorne, Peoria, Mesa and Gila Bend AZ) and SAOCOM 1A (Oct 7 2018, Spaceflight Now, KQED: Los Angeles to Sacramento, KOLD: Peoria AZ). Both Arizona sightings were at 780 to 820 km from the pad, beyond the 800 km sunlit plume cap, so the model said Not visible for something people saw. Raised `RANGE.lit` to 950 km (the farthest slant range in those sightings is about 944 km). The rating there stays Low view, since the distance tier caps it. Now 39 observer cases from 16 launches: 35 match, 4 more cautious than an official map, 0 mismatch.
- 02:02 PART 1: reviewed the launch heading guess (`azimuth` in `scripts/fetch_launches.py`): ISS from the Cape 45 degrees and from Wallops 52, Starlink Group 6 from the Cape 124, Vandenberg Starlink 155 and polar 189 all match published corridors. Not changed (it would need the Worker port changed with it, and the card already says the heading is a guess). A Cape polar launch is guessed at 189 degrees, while the real corridor hugs the coast at about 165; noted, not changed.
- 02:03 Phone speed (`phone.cjs`, 390 wide, 4x throttle, five alternating runs against a baseline build of 9937199): main thread 4,967 against 4,963 ms, script 1,364 against 1,364 ms. Even.
- 02:04 PART 1 committed and pushed. Full suite: visibility tests 24 of 24, Worker tests 31 of 31, page cloud test and Share suite all OK, desktop and phone check clean at 390, 768, 1440 and 1920.
- 02:05 PART 2: downloaded NASA Black Marble 2016 (3 km, 8.1 MB) and Blue Marble Next Generation (December 2004 with topography and bathymetry, 2.6 MB) from NASA's eoimages server. License: NASA material is not protected by copyright; Earth Observatory and Visible Earth ask for credit, and the only mandatory credit is NASA. Resized to 2048 by 1024 WebP: day 171 KB, night 66 KB, 237 KB in all (under the 400 KB budget). Choice: 2048 wide, not 4096, because a 4096 texture needs a 32 MB pixel buffer on a phone; the hero draws the globe at half resolution anyway.
- 02:12 PART 2: `src/globe.js` samples the two textures for every globe pixel: Blue Marble on the day side (dimmed a little to sit in a night hero), Black Marble on the night side, with the city lights fading under the drifting clouds. Stars, clouds, the launch path, the twinkles and the three tiers are unchanged (both tiers draw the same prebuilt globe). The textures load only when a launch outside the photo is shown; until they arrive the hero keeps its last frame, and if they fail (the artifact has no files beside it, offline, or 6 seconds) the globe draws its old coarse land and lights. Footer credit "Globe imagery: NASA" (to Visible Earth), full credit lines in `assets/CREDITS.md`.
- 02:14 PART 2: also took the one line fix from pull request 17: the pad label on the hero now avoids the Share row and the source line (on a phone it covered Share to Astro).
- 02:15 PART 2 tests: Kourou, Mahia, Sriharikota, Tanegashima, Jiuquan, Baikonur and Kodiak each draw the globe with the NASA imagery at desktop and phone width and with the medium and low tiers forced, no errors (28 pages). With the images blocked the old globe draws, no errors. A launch in the photo never requests the globe images. Phone speed on a Baikonur launch, five alternating runs: main thread 4,987 against 4,974 ms, script 1,229 against 1,225 ms. Even.
- 02:19 PART 2 suite: all tests pass, desktop and phone check clean (layout shift 0 to 0.0004).
- 02:22 PART 3: new `launch_pages.py`, called at the end of `build.py`: a page at `/launch/<id>/` for every launch in the inlined feed (upcoming, in flight, and flown in the last 7 days). Each has the name, vehicle, pad, liftoff in UTC plus the pad's own zone (US pads) and the visitor's zone (a small shared script), status or result, the Watch links (the same `watch_opts` as the hero), the provider and the official mission page, Share to Astro, Add to calendar, a link to the launch on the radar, a "Can I see it?" note, title, description, canonical, Open Graph and Twitter tags, and Event structured data (JSON LD) for launches not yet flown. Pages are 5.8 KB at most; the shared `launch.css`, `launch.js` and `mark.svg` sit next to the main page.
- 02:22 Choice: the "Can I see it?" note is not the per ZIP model (that needs the visitor's place). It says what the light allows, from the sun at the pad at liftoff and on the rocket about four minutes up (daylight trail, sunlit plume, engine flame, twilight), with the distances read from `RANGE` in `src/model.js` so the two never disagree, the guessed heading, and a link to the radar for the real estimate. It says it is an estimate.
- 02:24 PART 3: `sitemap.xml` (the main page and every launch page), `robots.txt`, and `404.html`: a link to a launch page that has left the feed goes to `/?launch=<id>` on the radar (GitHub Pages serves 404.html for any missing path).
- 02:26 PART 3: on the main page, Copy link and the phone share sheet now give the launch page (it has the launch's own title and preview) when the launch has one, and each row has a Launch page link. Choice: Share to Astro still sends `https://astroradar.io/?launch=<id>` as its `url`, as agreed with the astro-app share route; `?launch=<id>` works as before.
- 02:31 PART 3 tests: 32 launch pages load with no errors and no sideways scroll at 1440 and 390, the visitor's time shows, no hyphens in our copy; a gone page goes to the radar; the sitemap parses, 27 JSON LD events parse; build with no feed makes no pages and still works; the build takes under a second. Full suite clean (the Share suite now expects the launch page from Copy link).
- 02:33 PART 4: app icons rendered in headless Chrome from the official mark on the page color: `assets/icon-192.png`, `icon-512.png` and `icon-maskable-512.png` (the mark inside the maskable safe circle). The existing `apple-touch-icon.png` is kept.
- 02:38 PART 4: `build.py` writes `manifest.webmanifest` (Astro Radar, short name Radar, standalone, theme and background #04050C) and the iPhone home screen tags; launch pages link the manifest too. Chrome reads the manifest with no errors.
- 02:40 PART 4: `src/sw.js`, written to `dist/sw.js` by the build with a version that is a hash of the page and every file it keeps, so each deploy installs a new worker, which deletes the old shell. It keeps the main page, the hero photo (WebP and JPEG), the fonts, the icons and the manifest, plus the last good `launches.json`, and nothing else (no zips.json, launch pages, globe images, weather or the live Worker). The main page and launches.json go to the network first; the saved copy is used only when the network fails. Choice: network first for the page, so a deploy is seen on the next visit with no "reload to update" step.
- 02:42 PART 4: never stale in silence: the saved launches.json comes back with an `X-Astro-Offline` header, and the page then shows "Offline, showing last update · N min ago" in the data tag plus a toast once; the browser's offline event does the same. Back online, the next poll clears it. The worker is registered only on the built site over https or localhost, after the page has loaded.
- 02:40 PART 4 tests (`sw.cjs`, desktop and phone): the worker controls the page after the first visit; keeps exactly the page, photo, fonts, icons and launches.json; offline reload opens the saved page with the photo, the offline tag and the toast; back online says Live data; a new build is shown on the first visit after the deploy and the new worker replaces the old shell cache; no page errors. Found and fixed my own bug on the way (a second `agoTxt` that hid the existing one and gave "NaN days ago"). Full suite clean.
- 02:50 PART 5: content security policy as a meta tag, written by the build. Main page: scripts only from this site or the three inline scripts the build wrote (their SHA 256 hashes, computed on the final page), data only from this site, `api.weather.gov` and the live feed Worker's origin when `FEED_URL` is set, workers and manifest from this site, no plugins, base and form targets this site. Inline styles stay allowed (the script sets style attributes). Launch pages have a stricter one (no inline script at all). The artifact has none (its host sets its own). No violations on any page or tier.
- 02:56 PART 5: the policy made the page paint before the web fonts more often, which showed an old layout shift: the fallback fonts sat text higher in the line than Barlow, and the condensed fallback was 2% wider, so a hero title could wrap differently. With fonts delayed 1.2 s, main measured 0.05 at 390 wide and 0.006 at 1440. Fixed in the template: the four fallback faces now carry Barlow's ascent and descent (`ascent-override`, `descent-override`, measured in Chrome), and the condensed ones are sized on uppercase titles (83.4% and 82.8%). Now 0.001 to 0.002 at 390, 768 and 1440 with slow fonts, and under 0.002 at normal speed.
- 02:58 PART 5: `tests/smoke.cjs` and `tests/serve.py` (serves dist like GitHub Pages, 404 page included): the built site in Chromium at 390 and 1440, with the weather service blocked. It checks for page errors, console errors and policy violations; that the hero, rows and data tag are right; every row and tab; `?launch=`; every launch page (title, canonical, structured data, layout, policy); a gone page reaching the radar; that the sitemap, robots, manifest, service worker and calendar feed are served; and layout shift under 0.05. Locally: 122 checks pass with the mock feed, 21 with no feed.
- 03:01 PART 5: new `.github/workflows/checks.yml` on pull requests: build with the mock feed, the feed script on the real sample, visibility tests, Worker tests, Playwright 1.49.1 with Chromium, the smoke test with the feed and again with no feed, and the provider link check. Choice: the link check job may fail without blocking the pull request (provider sites sometimes refuse cloud machines). New `.github/workflows/links.yml`, Mondays 13:17 UTC: runs the link check and opens an issue (or comments on the open one) with the failing links, using only the built in token. `pages.yml` is untouched. Not run on GitHub yet; the pull request will run checks.yml.
- 03:14 PART 5 accessibility (`a11y.cjs` and `kbd.cjs`, scratchpad; desktop and phone, reduced motion): WCAG AA contrast for every visible text over its real background, a name for every link, button and control, labels for inputs, alt on images, duplicate ids, one h1, a main landmark, `lang`, and a Tab walk through each of the four panels of the main page (35, 276, 85 and 32 stops on desktop), the launch pages and the 404 page: every stop visible, on screen, with a focus style. One real finding, fixed: the launch page's primary button was white on #7C5CFF (3.8 to 1); it now uses the main site's #5E48D8 (5.9 to 1). The ZIP field's focus shows on its form (`:focus-within`), which the first pass missed; not a finding. Text over the hero photo and globe could not be measured this way (the background is an image).
- 03:14 PART 5 suite: all tests, smoke 122 checks, globe and service worker tests pass; layout shift 0 to 0.0025.
- 03:15 PART 6: `docs/ALERTS-DESIGN.md` compares Astro app push through `astro-push` (read from the astro-app repo, not changed), email through a Cloudflare Worker cron and Resend (Resend free 3,000 a month and 100 a day, Pro $20 for 50,000; Workers free 100,000 requests a day, paid from $5; D1 free limits; all checked on their public pricing pages tonight), and a calendar subscription, on cost, privacy and consent, abuse and time zones. Recommended order: calendar now, Astro push next, email only after a privacy policy, double opt in, rate limits and a bot check. No server built, no data collected.
- 03:23 PART 6 built: `launches.ics` (every upcoming launch, stable ids so a subscribed calendar updates events in place, UTC times, two alerts each, folded lines, an hourly refresh hint) and a `launch.ics` per launch page; "Subscribe to calendar" (`webcal://`, with the https address for Google Calendar) under the Launches list and in the footer, shown only when the build had live launches. The hero and row Add to calendar now make the same event as the feed (UTC, folded, alerts a day and 30 minutes before, the launch page link, "Time to be confirmed" when it is). New `tests/test_launch_pages.py` (12 tests, in CI too) and a smoke check that the downloaded file has the launch's UTC time.
- 03:40 PART 7: README.md and CLAUDE.md updated. Final run: visibility 24 of 24, Worker 31 of 31, launch page tests 12 of 12, smoke 124 checks, page cloud test, Share suite, globe (28 pages), service worker, launch pages, accessibility (0 findings) and keyboard (0 findings) all pass; desktop and phone check clean at 390, 768, 1440 and 1920. Before and after table above.
- 03:41 First Checks run on GitHub (pull request 19): the Worker tests failed because Node 20's test runner does not expand the quoted `test/*.test.mjs` pattern (it passed locally on Node 24); CI first moved to Node 22, where the Worker's slow upstream tests stopped early (a timer behaviour difference); it now uses Node 24, the current LTS and the version they pass on here. The provider link job saw Blue Origin answer 429 (rate limit) to the GitHub machine, which does not block. Choice: the weekly link job now opens an issue only for answers other than 200, 403 and 429, since those two mean the site refused a cloud machine, not that the link broke.
- 08:05 Merged origin/main (pull request 17: the Earth photo for every launch, PAD OFF MAP for pads outside it) into overnight2. The only conflict was CLAUDE.md (the file list and the Hero note): kept main's hero note and this branch's files, and added a note that the globe and its NASA imagery are no longer shown; README and a build comment updated to match. app.js merged cleanly (both sides had the same `textRects` fix). Build, visibility 24 of 24, launch pages 12 of 12, Worker 31 of 31, smoke 124 checks with the mock feed and 21 without; phone and desktop screenshots of Mahia and Baikonur launches show the photo with PAD OFF MAP and no errors.
- 08:05 Checks / provider-links failed on pull request 19 only because www.blueorigin.com answered 429 to GitHub's machine (every other link 200; from a home connection Blue Origin answers 200). The job now warns on 403 and 429 and fails on anything else; `continue-on-error` removed so a real break shows.
- 08:23 Removed the globe, as asked: `src/globe.js` (its two noise helpers `nh` and `vn` moved into `app.js`, since the photo's clouds use them), `liteGlobe`, the globe branch of `drawHero` and `liteFx`, the `.hl-g` layers and their CSS, the `data-m` attribute, the globe images, `assets/CREDITS.md`, their copy in `build.py` and the footer credit "Globe imagery: NASA". CLAUDE.md and README updated. `index.html` 281 → 258 KB. Visibility 24 of 24, launch pages 12 of 12, Worker 31 of 31, smoke 124 checks with the mock feed and 21 without. Hero pixels against c95d68d, frozen clock, seeded random, reduced motion, every tier, phone and desktop, one launch inside the photo and two outside: most cases identical; the rest differ by as much as the old build differs from itself between runs (image decode timing), so no change beyond noise.
- 09:11 CI: Checks / provider-links failed on 7c4eaa7 because www.cnsa.gov.cn gave no answer (000) to GitHub's machine. The site is up (200 from here on two of three tries, the first dropped after 1.4 s; the run before got 200). `scripts/check_providers.sh` now tries a link three times, 5 seconds apart, when it gets no answer or a server error, so only a link that keeps failing counts as broken.
