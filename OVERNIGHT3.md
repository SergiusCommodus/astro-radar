# Overnight run 3, November 8 to 9, 2026

Three stacked pull requests: v2design (the calm space look), rowshort (short launch names, flight tags, Nerd mode) and nasaapi (Space today). Then a font trial draft and a QA pass. This file grows through the night; the final state is at the end.

## Research

### What is merged and open (git log, gh pr list, November 8)

| Work | State |
|---|---|
| liveworld (live world) | merged, PR 22 |
| spacelook | merged, PR 21 |
| simplify (plus the limb layout and the footer video) | open, PR 23; not merged into main. v2design is main with PR 23 merged in, so nothing in it is redone. PR 23 is superseded by PR 24 and can be closed once PR 24 is merged |
| footer video | part of PR 23, so part of v2design |
| rowshort, nasaapi | no branch, no commit, no PR before tonight |
| fonts | no branch; the site uses self hosted Barlow (merged in PR 11) |

Every other remote branch (animations, ios-perf, iphone-lite, no-zoom, photo-everywhere, v2, v3, v4 and the rest) is already merged into main; none conflicts, so nothing needed closing or rebasing.

### The page before tonight (main, astroradar.io), scrolling

This machine's display runs well above 60 Hz (requestAnimationFrame fires about 193 times a second even on a blank page), so raw frame counts are not comparable with a phone. Frame rates below are counted as a 60 Hz screen shows them: the share of 16.7 ms slots that got a new frame. The phone profile is 390 by 844 at 3x with the CPU slowed 6x, scrolled by a touch fling (the compositor scrolls, as a finger does). Medians of 5 runs, two rounds, same mock feed and clock for every build.

| main | Phone | Desktop (1440, CPU as is) |
|---|---|---|
| Fling frame rate | 54 to 55 fps | 59 fps |
| Main thread busy during the fling | 81 to 82% | 18% |
| Main thread busy, idle at the top | 53 to 56% | 9% |
| Main thread busy, idle 900 px down | 66% | 9% |

Top costs on main, found by switching one thing off at a time on the live site:
- **The full viewport WebGL world.** It is fixed behind the whole page and keeps drawing. That is why the phone's main thread stays 66% busy even 900 px down the page, where the world is under the page scrim and cannot be seen. This is the largest cost.
- **Backdrop blur on cards (desktop).** Removing it saved little in Chrome. It is costlier in Safari, and none is used on phones.
- **The scroll linked camera on desktop.** The world was redrawn for every scroll frame. That is cheap on a desktop GPU, but it is the "planet moves when I scroll" problem.
- **Large gradients and scrims over the world.** These are composited every frame because the world under them changes every frame.

### Best practice found for space backgrounds, and the iOS Safari limits

- **Video autoplay.** Muted, inline (`playsinline`) video can autoplay on iOS. Low Power Mode blocks it (or shows a play button) even when muted, so `play()` must be caught and a poster kept as the fallback ([Apple developer forums](https://developer.apple.com/forums/thread/709821), [WebKit bug 216887](https://lists.webkit.org/pipermail/webkit-unassigned/2020-September/942938.html)).
- **WebGL memory.** Safari's limit is per page and depends on the device and current load. Canvas memory has its own cap (Babylon.js users report 256 MB). Exceeding it reloads the page silently, sometimes in a loop. Many textures and resized canvases make it worse ([WebKit bug 219780](https://bugs.webkit.org/show_bug.cgi?id=219780), [Babylon.js forum](https://forum.babylonjs.com/t/ios-cannot-open-an-app-on-ios-browsers-memory-limit/40698)).
- **Fixed layers.** Fixed and canvas layers each get their own compositing layer. A fixed layer that changes every frame costs the whole time it is on screen.
- **Starfields.** CSS opacity animations on a few elements are the cheapest twinkle. A canvas loop is fine on a desktop if it is paused off screen and in hidden tabs. Use fewer stars on phones.

From these, per tier:

| Tier | Hero | Why |
|---|---|---|
| Desktops (high) | Live WebGL, in the hero only and only while it is on screen | It shows the real pad under the real sun. The GPU is there, and the world stops as soon as the hero leaves the screen |
| Phones, tablets, low power computers (medium, low) | A pre rendered loop of our own world, with the pad marker drawn on top | No WebGL, no texture memory, and the video is decoded off the main thread. Low Power Mode leaves the poster, which is a still of the same planet |

### Background colors that differed (before the palette)

| Area | Colors in use |
|---|---|
| Page | two page tokens (#04050C and #03050B), `--bg-2` defined twice |
| Header | 7 different darks: #050813, #070916, rgba(5,8,19,.62), rgba(7,9,22,.58 and .92), rgba(3,5,11,.5 and .85) |
| Tab bar | #020309, #03050C, rgba(0,0,0,.82 and .94), rgba(3,5,12,.82), rgba(3,5,11,.84) |
| Cards and rows | 39 values, among them four surface navies (5,8,19 / 5,8,20 / 5,9,21 / 5,9,22), #0A1024 and rgba(12,18,40), an older button blue (#4B7BF2, #3159CF), two accent blues, and purple left overs (rgba(124,92,255,...)) |
| Scrims | 26 alphas of rgba(3,5,11) |
| Footer | rgba(3,5,11,.88) and the page token |

`--base` was defined three times and `--surface` twice.

## Decisions taken (I could not ask)

- **Hero on phones:** a pre rendered looping video of the limb, with the pad marker drawn on top (the default given). Desktops keep the live world.
- **Navigation:** one top bar on desktop (over 900 px). Phones and tablets (900 px and under) get a compact top bar plus a bottom tab bar.
- **"Why this rating":** a short version (the verdict and its reason) with a Details toggle.
- **Nerd mode:** off by default.
- **v2design:** branched from main with PR 23 merged in, not redone.

## Proposed change to .github/workflows/pages.yml (not applied: the file must not be edited from here)

The NASA fetch needs to run in the deploy, after the launch feed (it reads the feed for NASA launch pages) and before the build. Add a repository secret `NASA_API_KEY` (a free key from https://api.nasa.gov/; without it the step uses DEMO_KEY). Pillow is needed for the images.

```diff
           if [ ! -s dist/launches.json ]; then
             owner=$(echo "$OWNER" | tr '[:upper:]' '[:lower:]')
             curl -fsSL "https://${owner}.github.io/${REPO}/launches.json" -o dist/launches.json || rm -f dist/launches.json
           fi
+      - name: Fetch Space today from NASA (keep the last good data if NASA is down)
+        env:
+          NASA_API_KEY: ${{ secrets.NASA_API_KEY }}
+        run: |
+          pip install --quiet pillow==11.0.0
+          python3 scripts/fetch_nasa.py --feed dist/launches.json || true
       - name: Build page
```

## Results, Jobs 1 to 5

Review page with before and after screenshots at 390, 768, 1440 and 1920: https://claude.ai/artifact/DmeqB24E3V2rrzLabpEm3g (private).

### Scrolling (before is main, after is the top of the stack; same feed, clock and machine)

| Phone, 390 at 3x, CPU 6x, touch fling, counted at 60 Hz | main | v2 |
|---|---|---|
| Fling frame rate | 54 to 55 fps | 54 to 55 fps (3 of 6 runs at 55) |
| Frames over 34 ms | 0 to 1 | 0 |
| Fling at the footer, video playing | no video | 56 fps, 0 long frames |
| Main thread busy, idle 900 px down | 66% | 5 to 9% |
| Main thread busy during the fling | 81 to 82% | 81 to 84% |

| Desktop, 1440, CPU as is | main | v2 |
|---|---|---|
| Fling frame rate | 59 fps | 59 fps |
| Main thread busy during the fling | 18% | 16% |

The 55 fps phone target is met only at the edge. The remaining cost during a fling is the browser's own scroll and input work on a 6x slowed CPU: main pays the same, and switching the page's scroll handlers off changed nothing. Two causes found and fixed along the way:
- The fifteen twinkling stars were fifteen composited layers, about 2 fps in a fling. They are three groups now, paused while scrolling.
- There is no WebGL on phones at all.

### Payload per tier (first 10 s, text gzipped, then what the footer adds)

| Tier | main | v2 | Footer adds |
|---|---|---|---|
| Desktop 1440 (live world) | 3,047 KB | 3,042 KB | 460 KB |
| Tablet 768 (hero loop) | 1,070 KB | 1,203 KB | 460 KB |
| Phone 390 (hero loop) | 1,070 KB | 1,165 KB | 235 KB |

Safari gets MP4: the hero loops are 0.57 and 0.69 MB, and the footer loops 1.0 and 0.44 MB.

### Lighthouse (two runs each; local server without compression or cache headers)

| | Performance | Accessibility | Best practices | SEO | Total blocking time |
|---|---|---|---|---|---|
| main, mobile | 66 to 73 | 99 | 100 | 100 | 580 to 1,110 ms |
| v2, mobile | 80 to 86 | 100 | 100 | 100 | 80 to 200 ms |
| main, desktop | 80 to 81 | 99 | 100 | 100 | 410 to 420 ms |
| v2, desktop | 76 to 81 | 100 | 100 | 100 | 410 to 520 ms |

### QA (Job 5), fixed
- **Two aria-labels** that did not contain the visible words: the hero Watch button and the countdown pill.
- **The skip link** pointed at a missing target.
- **The Space today source links** were 17 px tall.
- **The phone's hero loop** was not kept for offline visits.
- **Small speedups:** row logos load lazily, and the weather connection opens early.

### QA, left for later
- **Performance audits:** minify CSS and JS, unused CSS and JS, and a large DOM on desktop.
- **Phone layout:** the gap above the countdown on phones (the mission line's reserved height, from before tonight).

### Verified
- **The CI test job, twice in a row on each branch**, the way CI does (Node 24, Playwright 1.49, Chromium 131, software WebGL), all green.
- **GitHub Actions** pass on #24, #25 and #26.
- **Every tab at 375, 390, 430, 768, 1024, 1440 and 1920**, with the world on its default, off and forced on:
  - no page errors
  - no sideways scroll
  - no control under 44 px
  - layout shift at most 0.0014
- **Offline at 390 and 1440.**
- **Launch pages** (the smoke test opens every one).

### Not verified
- **A real iPhone.** Untested: the hero loop's autoplay (Low Power Mode leaves the poster), the bottom bar against the home indicator, and real scrolling.
- **Safari and Firefox.**
- **DONKI and APOD** never answered properly tonight.
- **The NASA fetch in the deploy** needs the pages.yml step above.

### Blockers
None so far. DONKI and APOD being down is recorded as a limit, not a blocker: their cards stay hidden until they answer.

### Merge order
1. #24 v2design
2. #25 rowshort, after #24
3. #26 nasaapi, after #25

Then the extra jobs' PRs in the order listed below. #27 (font trial) is a draft and independent. PR 23 can be closed once #24 is merged.
