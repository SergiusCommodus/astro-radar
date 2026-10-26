# Site audit, v2 branch (October 2026)

What was checked, what was broken, and what changed. Testing ran on Windows against `py build.py` output served over http from `dist/` (with `tests/launches.json` copied in, plus a real Launch Library 2 snapshot for link checks), in headless Chrome at 1440x900, 1920x1080 and 390x844 (phone emulation), with screenshots and console capture after each part. No console errors in any run.

## Hero (part 1)

| Area | Before | Now |
| --- | --- | --- |
| Framing | Photo cropped tight on Florida, Moon and most of the horizon out of frame | Full photo width (wider crop on phones), Moon, horizon glow and most of the US in frame, pad kept right of the copy, very slight drift; sky above the photo continues as a star field |
| Sky | Static | Twinkling stars in the black sky (photo and globe), meteor showers every several seconds, only over open sky |
| Earth | Static photo | Slow drifting procedural clouds masked to the Earth below the air glow, softly flickering city lights with bloom on the brightest, breathing blue air glow fitted to the horizon, light vignette and grain |
| Launch | 14 second sweep, one flash at separation | About 44 seconds of flight plus a pause, staged from the model's own event times: first stage plume, MECO, separation flash, booster falling on its own arc with landing burn, smaller upper stage plume. Falcon Heavy drops side boosters first, Starship hot stages, Vulcan drops solids. T+, altitude and event names come from `src/model.js` |
| Bug | Exhaust particles spawned per frame, so the plume ballooned on fast screens | Spawned at a fixed rate |
| Performance | | Canvas resolution capped (1.5x on phones, 5 megapixels overall). Phone with 4x CPU throttle holds about 50 fps. Reduced motion freezes the scene and turns meteors off |

## Broken or weak, now fixed (part 2)

**Links and destinations**
- ULA YouTube link was dead (`@ulalaunch` is 404). Now `@UnitedLaunchAlliance/streams`.
- Rocket Lab used a YouTube search page. Now `@RocketLabCorp/streams`; site moved to `rocketlabcorp.com/missions/launches/`.
- NASA "site" was the nasa.gov home page. Now NASA Live.
- "Mission page" always went to the provider home or launches page. The feed now carries each launch's official page when LL2 lists one (SpaceX and Rocket Lab do); otherwise the link is labelled "<provider> site".
- Webcasts for SpaceX are now mostly X broadcasts, but the page said "Watch on YouTube". Labels now name the real host.
- Feed links went into `href` unchecked. Only plain https links are used, and all are escaped. The feed script no longer uses the LL2 API URL as a website and URL encodes its search fallback.
- `fetch_launches.py --from-file` crashed on Windows (no UTF-8). Fixed.

**Reminders**
- Reminders were a localStorage flag with no alert. The toast now says the reminder lives on this device, and "Add to calendar" (hero and every row) saves an .ics file with an alert 30 minutes before liftoff.

**ZIP lookup and weather**
- Tested Orlando 32801, Los Angeles 90012, Houston 77058 and Chincoteague 23336: all resolve and get a NWS forecast.
- Bad ZIPs (`1234`, `00000`, `99999`, empty) show a clear message; the error is now tied to the field (`aria-invalid`, `aria-describedby`).
- A failed NWS request silently showed a sample forecast labelled "Sample forecast". Now: "NWS unavailable · sample forecast", "No NWS forecast here · sample", "Offline · sample forecast", or "Loading NWS forecast", with a 12 second timeout and a retry when the connection returns.
- A missing or failed launch feed now says "Sample data · live feed unavailable" or "Offline · sample data" instead of plain "Sample data", and reloads when back online.

**Visibility estimate (checked against past launches)**

| Launch | City | Model now | Reported |
| --- | --- | --- | --- |
| Crew-2, 2021-04-23, LC 39A | Charleston, Washington, New York | 24° ESE, 14° SE, 17° SE, twilight plume high | Seen with a jellyfish plume from South Carolina to Virginia |
| Crew-1, 2020-11-16 night | Miami, Orlando, Charleston | Visible, plume low | Night launch, no jellyfish |
| Iridium-4, 2017-12-23, SLC 4E | Los Angeles, Phoenix, Las Vegas | 20° WSW, 5° WSW, 7° SW, plume high | The famous Southern California "UFO", seen to Phoenix |

Two errors fixed in `src/model.js`:
- Second stage downrange in every profile was about 45% shorter than its own speed column implies, so late views ran too long and pointed too far south. Downrange is now the integral of the horizontal speed.
- The twilight plume test looked at one fixed track point; it now checks the part of the climb the observer can see. Crew-2 went from "low" to "high", matching reports.

Also fixed in the feed: Cape Starlink Group 6 flies southeast (az ~124); it was drawn going northeast. The UI still calls visibility a modeled estimate.

**Astro tab, sign in and posts**
- Posts and likes vanished on reload. They now persist in this browser; Reply addresses the author; your own posts can be deleted; you can sign out from the join card.
- The tab now says it is a demo (sign in, posts and likes stay in this browser); the viewer count and photos are labelled "Sample"; "Live thread" became "Launch thread".
- End to end: sign in errors, create account, Google and Astro demo sign in, post, like, reply, add location, delete, sign out, and the sign in prompt for signed out actions all work.

**Accessibility, mobile, speed**
- Sign in dialog: the page behind is now inert, so focus stays in the dialog; sign in errors are tied to their fields; Esc closes and focus returns.
- Visible focus for the ZIP field and the post composer (both had `outline:none` and nothing else).
- Replay slider reports its time (`aria-valuetext`); account menu reports `aria-expanded`.
- Phone: the tab strip scrolled sideways and hid Watch and Astro; all four tabs now fit. The Astro thread header wraps cleanly. No horizontal page scroll at 390 px; no tap target under 24 px; every button and field has a name.
- Speed: the ZIP table is packed as base 36 deltas at build time (unpacked at load, round trip verified), taking the page from 765 KB to 586 KB gzipped. Fonts no longer block the first paint. First contentful paint about 0.4 s on desktop, 0.8 s on a throttled phone.

## Could not verify

- X broadcast pages return 200, but their video content cannot be checked without a browser session.
- blueorigin.com sits behind a bot check; the link resolves but its content was not confirmed.
- en.roscosmos.ru timed out from here. ISRO, CASC, Roscosmos and other providers without a known channel still use a YouTube search.
- `tests/launches.json` is a synthetic fixture with placeholder links (`watch?v=abc`, `example.org`). CI regenerates the real feed, so these never ship.
- Starlink shells other than Group 6 are assumed 53 degrees (Cape) and 70 degrees (Vandenberg); the actual inclination per group is not in the feed.
- The model ends at upper stage cutoff, so a plume that lingers after SECO is not shown.
- Testing was headless Chrome with device emulation, not physical phones, Safari or Firefox.
