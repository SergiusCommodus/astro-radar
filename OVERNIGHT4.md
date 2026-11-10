# Overnight 4 (November 9 to 10, 2026)

A stack of pull requests into main, each branched from the one before. None is merged; merge them in the order at the end.

## Research

### State at the start
- PR 33 (footerfix) was already merged into main, so the stack starts from main (a795fdd). PR 27 (fonttrial) is a draft and was left alone.
- CI (`checks.yml`): Node 24, Python 3.12, Playwright 1.49.1 with Chromium only. The deploy (`pages.yml`) is not touched.

### Measured: the live site and the local build
Lighthouse 12.2.1, mobile preset (simulated slow 4G: 150 ms, 1.6 Mbps, and 4x CPU), Chrome 157, Windows laptop.

| | Perf | FCP | LCP | TBT | CLS | Weight |
|---|---|---|---|---|---|---|
| astroradar.io, mobile (2 runs) | 90, 91 | 1.8 s | 3.5, 3.4 s | 10, 0 ms | 0 | 1,987 KB |
| astroradar.io, desktop | 87 | 0.4 s | 0.7 s | 290 ms | 0 | 1,250 KB |
| local build, mobile, no gzip (2 runs) | 86, 85 | 2.7 s | 3.6 s | 0 ms | 0 | 2,808 KB |
| local build, desktop, no gzip | 87 | 0.6 s | 0.8 s | 300 ms | 0 | 2,173 KB |

`tests/serve.py` does not gzip, so the local numbers run high; from here on local runs use a small gzip server like GitHub Pages.

With the same throttling applied in Chrome (390 by 844 at 3x, CDP slow 4G and 4x CPU, 3 runs on the live site), the largest paint is the hero video's
poster (`hero-phone.webp`) at 2.78 to 2.88 s, the headline paints at 0.6 to 0.9 s, and the video's first frame arrives at 4.8 to 5.0 s
(not 8 s on this line; the earlier lab figure was on a slower profile).

### The three causes of the slow first paint on a phone
1. **The poster is found late.** `app.js` sets it on the video at the end of the body, so it is requested only once the whole page has
   arrived and the script has run (334 ms into the waterfall on the live site), and it is 161 KB (WebP 88, dithered).
2. **The HTML is 114 KB gzipped**, 71 KB of it the inline app script, all of which must arrive before the poster can even be asked for.
3. **Four preloaded fonts (88 KB) and a fifth (barlow 500)** load at high priority beside the poster on a 1.6 Mbps line.
After load, `zips.json` (264 KB) and the 1.3 MB hero video compete for the line too, which is what delays the video's first frame.

### Browsers still unverified (from OVERNIGHT3.md)
- A real iPhone: the hero loop's autoplay (Low Power Mode leaves the poster), the bottom bar against the home indicator, real scrolling and
  memory. Playwright cannot cover these: its WebKit is not iOS Safari (no Low Power Mode, no iOS memory limits, no real touch scrolling).
- Safari and Firefox: Playwright's WebKit and Firefox can cover layout, script errors, policy violations, the hero loop's codec choice
  (WebKit takes the MP4 path), the service worker, the calendar link and the tab bar. Job 2 adds them.

## Decisions (made without asking, by the rules: simplicity wins, nothing new on the default view, leave out what is uncertain)
- The hero poster becomes a picture under the video (AVIF, else WebP) instead of the video's poster attribute, so the browser picks the
  format and the head can preload it. The AVIF is encoded from the current WebP poster (quality 60, 4:4:4; PSNR 38 dB against the WebP,
  no visible difference at 1:1); `render_loops.cjs` writes it from the source frame from now on.
- The app script leaves the HTML for one deferred file named by its hash. The artifact keeps it inline.

## Job 1: first paint on phones (branch firstpaint)
- The poster is a picture under the video, AVIF 50 (59 KB, was a 161 KB WebP set by script), preloaded by link tags in the head on touch
  screens with high priority; the head decides the hero loop before anything loads (the same rule as `VID` in app.js).
- `model.js` and `app.js` are one file, `app-<hash>.js`, out of the HTML (114 KB gzipped, now 42 KB). On phones it is asked for only
  once the poster's largest contentful paint is recorded (Safari: once it has decoded), 3 s at most; elsewhere at once. The countdown is
  filled in from the inlined feed by a few lines in the page, so it never shows 00 while the script loads.
- Fonts are unchanged: dropping their preloads moved first paint from 0.9 to 2.4 s in Lighthouse and did not help the poster.
- Lighthouse mobile measured on a feed trimmed to launches at least 20 minutes out (the mock's launch that left 20 minutes ago puts the
  page in its hidden until boot state, which is not what most visitors see), gzip server, three runs each:

| | Perf | FCP | LCP | TBT | CLS |
|---|---|---|---|---|---|
| main | 97, 92, 97 | 1.5 s | 2.5, 3.3, 2.5 s | 0 to 60 ms | 0 |
| firstpaint | 98, 98, 98 | 0.9 s | 2.4, 2.4, 2.4 s | 40 ms | 0 |

  Lighthouse's model does not count main's poster (it sits on a video element), so main's 2.5 s is the headline's time. Measured in
  Chrome with the same throttling (390 at 3x, slow 4G, 4x CPU), the poster paints at **2.8 s on main and 1.4 s here**; the video's first
  frame is about the same (4.4 to 4.8 s; it loads after the page, as before). Desktop is unchanged (LCP 0.8 s, perf 87).
- Kept: offline mode (smoke test), every budget (new lines for the script file and the AVIF posters, with reasons), layout shift 0.

## Job 2: Safari and Firefox (branch browsers)
- `tests/browsers.cjs`: WebKit and Firefox at 1440 and on a phone profile; a separate CI job with `continue-on-error`, so it never
  blocks a pull request (its time is the browser install plus about a minute).
- WebKit: all 20 checks pass locally (desktop and iPhone 13). No bug found. WebKit on Windows has no AVIF and took the WebP poster.
- Firefox does not start on this Windows machine (Playwright's "spawn UNKNOWN", as its bundled Chromium did), so CI's Linux run is its
  first. **Decision:** the job does not block, since WebKit is not iOS Safari and a Firefox quirk should be read, not stop a merge.

## Job 3: visibility accuracy (branch visibility)
- 18 more documented launches, 49 more observations (88 from 34 launches in all): Florida, Vandenberg (SLC 4E and 2W), Starbase, Wallops,
  Mahia and Sriharikota; Falcon 9, Falcon Heavy, Atlas V, Antares, Electron, Firefly Alpha, Minotaur, PSLV, SLS and Starship; day,
  twilight and night. Sources researched by a subagent from news reports, NASA maps and launch lists; each is linked in the test.
- **One model change**, proven by a test: Electron's sunlit plume gets the full 950 km range (`VSCALE_LIT`). The Owl's Night Begins was
  photographed 830 to 1,110 km from Mahia while the model called it not visible. Its engine glow and daylight trail are still scaled
  down; past 400 km a view can only be Low, so the change gives Low views and nothing better. The invariants test is tighter than before.
- **One open case**: Falcon Heavy USSF-52 from Myrtle Beach (a home camera, heading unknown), recorded as OPEN, never above Low.
- Two of my own first rules were wrong and were changed before any model change: a score cap by distance from the pad (an observer
  down range is much closer to the rocket than to the pad), and Firefly Alpha as Electron (the feed gives it the generic profile).
- `docs/VISIBILITY.md` lists the evidence, the change, what was left out and why, and what is still open.

## Job 4: launch descriptions (branch descriptions)
- The feed gains `desc`: Launch Library's mission description (already in the detailed response the script asks for), plain text, cut at
  about 400 characters at a sentence end or a word, hyphens between letters or digits made spaces, placeholders such as "Details TBD."
  left out. Optional, so older readers are unaffected. Python (`desc_of`) and the Worker (`descOf`) agree on 9 new odd records
  (tags, hyphens, long text, emoji, accents, a number instead of text); `npm test` passes.
- Shown in a row's details (not the default row) and on the launch page under The mission, credited "Launch Library 2".
- **You must redeploy the Worker** (`cd worker && npx wrangler deploy`) after merging, or the live feed the page polls has no `desc`
  (the page then shows the inlined feed's descriptions until its first poll, then none, harmlessly).
- **Decision:** a hyphen inside a quoted description becomes a space ("Low Earth", "stages 1 2"), as pad and rocket names already do;
  I did not turn number ranges into "to", since "Group 6-65" would read wrong.

## Job 5: About, Privacy and Data sources (branch trustpages)
- Three quiet pages (about 4 KB each, no script) at `/about/`, `/privacy/`, `/data/`, linked from the footer, in the sitemap and kept by
  the service worker. Written only from what the code does, checked in the code first:
  - kept in the browser: `radar.zip`, `radar.zipinfo`, `radar.rem`, `radar.nerd` (the old `radar.user`, `posts`, `likes` are only ever
    deleted); no cookies; the policy allows scripts only from the site.
  - sent out: to api.weather.gov, the ZIP's center to 0.01 degree (the ZIP itself never); the launch list from the site and the feed
    server; Share to Astro and Watch only when pressed.
- `tests/test_info_pages.py` keeps the Privacy page honest: a new stored key, a new outside host or a cookie in app.js fails it.
- **For your review (legal):** the Privacy page's sentence about hosts ("GitHub Pages and Cloudflare receive the usual details of each
  request, such as your IP address; Astro Radar adds no tracking to them") and whether you want a formal privacy notice beyond this.
- **Decisions:** the contact is the repository's GitHub issues (no email address exists in the repo, and I did not invent one); the Data
  sources page says the ZIP table is "kept with the site" because its original source is not recorded anywhere (you may want to add it).

## Job 6: calendar hygiene (branch calendar)
- `tests/test_ics.py` validates every calendar file against RFC 5545, line by line. It found one real bug (an unescaped semicolon in the
  subscription's description), fixed.
- Events gain `STATUS` (TENTATIVE for a time to be confirmed or on hold), `SEQUENCE` and `LAST-MODIFIED`, from a new optional feed field
  `lu` (Launch Library's `last_updated`, Python and Worker together, 8 odd records in the parity test). A re-imported launch file updates
  the event instead of adding a second one. The page's own Add to calendar (`icsFor`) does the same; a test checks the two agree.
- A closed "How to subscribe" with the iPhone and Google Calendar steps under the subscribe line.
- `docs/ALERTS-DESIGN.md`: what a calendar cannot do (cancellations: Launch Library has no cancelled status; Google refreshes on its own
  schedule) and what a real push alert system would need next.
- **Not verified:** `last_updated` is in Launch Library 2.2's detailed record but not in the trimmed test samples, and my one live check
  got no answer (probably the shared hourly limit), so I did not retry. Without it the feed has no `lu` and SEQUENCE is 0, as before.
  The Worker needs the same redeploy as Job 4.

## Job 7: empty, error and stale states (branch states)
- `tests/states.cjs` (a CI step after the palette test): rewrites the inlined feed and launches.json as the page loads them and checks,
  at 390 and 1440, 116 checks in all: the feed down, cut off or empty; slow (the loading state, then the sample after 10 s); stale (a copy
  3 hours old, or one the Worker marks stale: "Data delayed", never "Live data"); a failed refresh after good data (kept); a time to be
  confirmed, a hold, a launch gone 40 minutes ago (dropped); a scrub (the toast says where it moved); Florida times either side of the
  end of daylight saving time (EDT, then EST, in the pad's zone); distTxt's rounding. No layout breaks or errors in any state.
- The page already handled every state; the one fix is for screen readers: the toast's kind and message ran together ("scrubAtlas V"),
  now spaced.
- `window.__radar` (the launches on show, a refresh and the formatters) is set only with `?test` in the address.
- Left alone: a distance under about 0.8 km would read "0 mi (1 km)". No pad is that close to a ZIP code's center, so I did not change
  the rounding rule CLAUDE.md fixes.

## Job 8: code health (branch codehealth)
- Removed, after a scan for code nothing can reach (a function referenced only where it is defined; a CSS class in no markup, no string
  in build.py and no token of app.js, checked against the prefixes app.js builds class names from):
  - app.js: `countTo` and its list, `fx` and its three calls, `scrollK`, `initGlow` (the pointer glow), `WSC`.
  - CSS: the intro and step cards (`.intro`, `.how`), `.sec`, `.r-prov`, `.r-time`, `.rc-pv`, `.hero-share`, `.join-r`, `.ico-pulse`, the
    nebula (`.neb`, its element and keyframes), the old page scrim (`main::before`) and the pointer glow's rules, all already hidden.
- Kept: the photo fallback and its tiers, the old storage keys' cleanup line.
- **Bytes saved:** inline CSS 104,824 to 98,318 (gzipped 24,535 to 23,272); the app script 192,183 to 190,327 (gzipped 73,013 to
  72,319); the HTML gzipped 44,246 to 42,979. About 2 KB less on every visit, gzipped.
- Proof: the same 12 screens (390 and 1440: first screen, Launches, a row open, Watch, Astro, footer; fixed clock, reduced motion) are
  pixel identical before and after. That comparison caught one mistake on the way (`.lchip-row` is built as `'lchip-'+size`), restored.
- The runbook now covers the footer stills, the AVIF posters and redeploying the Worker after a feed change; CLAUDE.md drops what is gone.
