# Launch logbook: research notes

Research for a device-only "I saw it" logbook on Astro Radar: log entry, Your launches page, badges, Year in Launches share card. No accounts, no sync, no streaks, no pop ups. Researched 2026-11-15. Numbered references [n] point to the source list at the end.

Confidence note: official help pages for Letterboxd, Strava and Untappd were thin in search results, so some product details below come from secondary coverage and user pages; they are marked as such. Storage and sharing facts come from WebKit, MDN and web.dev directly.

---

## 1. How comparable products log, badge and recap

### Letterboxd (diary and Year in Review)
- **Log entry:** a diary entry is the date watched, the film, an optional star rating, a like, a rewatch flag and an optional review [3][4]. The public diary lists entries by month and day with those columns. Logging is one action; everything except the film and date is optional.
- **Year in Review:** computed only from the diary entries and ratings the member added during the year [1][3]. Per user stats pages (`/year/2025/`) show films logged, rewatches, reviewed versus unreviewed, hours watched, a ratings spread, highest rated films and top actors and directors [4][5]. Some breakdowns are for paying (Pro) members [4]. Released in the first days of January, not in early December, so the whole year counts [4] (secondary source).
- **Layout:** the official retrospective is one long scroll with large imagery and illustration [2]. The lesson for us: a recap is a page first; a share card is a single still taken from it.
- **Design lesson:** stats are only as good as the log, so recap copy should never imply completeness ("launches you logged", not "launches you saw").

### Strava (activity log, trophies, Year in Sport)
- **Log entry:** an activity (type, date, distance, time, elevation, map), recorded automatically by a device.
- **Achievements:** PR trophies on segments, top 10 trophies for 2nd to 10th all time on a segment [9], Local Legend (most efforts on a segment in 90 days, speed does not matter) [8], and challenge trophies in a trophy case for opt in monthly challenges [10]. Note that public leaderboard achievements disappear if activities are made private [9]: a badge that depends on other people is fragile and social.
- **Year in Sport (personal):** an in app slideshow for the year: distance (with a percent change on last year), days active, total elevation and time moving [11][12]. Strava also publishes a separate global trend report [6][7]; do not confuse the two. Columnists describe feeling "gutted" by a low year [12]: comparisons against last year or against others can sting.
- **Design lesson:** count based "consistency" awards (Local Legend) are friendly to casual people; year over year comparisons are a source of disappointment, so show them neutrally or not at all.

### Untappd (check ins, badges, Year in Beer / Recappd)
- **Log entry:** a check in: the beer, optional rating, venue, photo, comment, serving style.
- **Badges:** three families [14]: Core (made by Untappd, available any time; most level up to Level 100, traditionally a new level every 5 check ins, so about 500 for the top), Local (tied to one venue, used as a rewards program) and Sponsored (time limited). An optional setting lets past check ins count when a new core badge appears (retroactive credit) [13 search, help center]. Users can hide badge level cards that pop up after a check in [13], which shows the default pop up was felt as noise.
- **Naming:** a badge name plus "(Level N)", for example "Untappd at Home (Level 20)" [15].
- **Year in Beer, now Recappd:** top five beers, styles, breweries and venues, top rated styles, badges earned, a map of check ins, total and unique check ins; the core recap is free and past years are for subscribers [16][17] (partly secondary).
- **Criticism:** level 100 grinds encourage quantity over enjoyment; the Local badges remind drinkers when they are close to the next level [14], which is a nudge to consume more. A launch log has no consumption, but the same "you're 1 away" nudge would push people to chase launches, so leave it out.

### NASA Spot the Station
- The app (2023) has sighting alerts for the user's location, an AR finder and a compass, and photo and video capture to share in the moment [18]. App Store notes mention a Past Sightings page, newest first [19]. No badges or achievements were found in NASA's material [18]; one 2013 Space Apps concept proposed check in achievements, never shipped [20].
- **Design lesson:** the closest public space agency precedent is a plain, dated list of sightings. That is the right core for Astro Radar; badges should stay a quiet layer over it.

### Criticism of compulsive mechanics

- **Streaks and loss aversion.** Silverman and Barasch's research (Journal of Consumer Research 2023; OBHDP 2023) finds people value an intact streak for its own sake, even an artificial one, and a broken streak is "especially demotivating"; making streaks salient amplifies the sting of a break [21][22]. Silverman advises against "you broke your streak" messages [21]. Launches are irregular, weather dependent and often scrubbed, so any streak would be broken by events outside the visitor's control: strictly worse than for a habit app.
- **Duolingo as the reference case.** Critics describe the streak as a loss aversion device dressed up as a reward, with streak freezes and repairs that look generous while tightening the habit [24], and parents' guides describe children protecting the flame rather than learning [25]. Defenders point to engagement gains [23]. Either way, the mechanic is designed for daily return, which is not our goal.
- **Dark patterns.** The FTC's 2022 staff report defines dark patterns as "design practices that trick or manipulate users into making choices they would not otherwise have made and that may cause harm" and found them in children's apps among others [26]. Nagging (asking again after a no) and confirmshaming (guilt in the decline option) are standard named types in Brignull's catalogue [27][28].
- **Humane technology.** The Center for Humane Technology names red notification badges, intermittent reinforcement and infinite scroll as attention extracting features [29]; its student guide calls Snapchat streaks a trick designed to keep you coming back every day [30].
- **Gamification and intrinsic motivation.** Expected, performance contingent rewards reduce intrinsic motivation (Deci, Koestner and Ryan's 1999 meta-analysis, as cited in [31]). In a controlled study, points, levels and leaderboards raised the *quantity* of work but did not change intrinsic motivation or competence; they acted as extrinsic incentives [32]. A meta-analysis of 35 gamified learning interventions found only a small effect on intrinsic motivation (g = 0.257) [33]. Badges add little where intrinsic motivation is already high [31]: rocket watchers are exactly that audience.

### Design rules for Astro Radar (recommended)

1. **No streaks, ever.** No "days in a row", "launches in a row", flames, freezes or repairs. Launches are not daily and not under the visitor's control.
2. **No counters that pull.** No "1 more to unlock", no progress bars toward the next badge on the main page, no badge level count up. Progress is visible only on the Your launches page, and only as facts ("4 pads").
3. **No pop ups, no toasts for badges, no sounds.** A badge appears quietly on the Your launches page the next time it is opened; at most a small "new" marker that clears once seen. (The page's own toasts stay for launch events only.)
4. **No notifications or reminders about the log.** Existing launch reminders stay launch reminders; never "you haven't logged in a while" or "log the launch you just watched?". The "I saw it" button sits on recent launches and waits.
5. **Badges describe, never rank.** Name them after what happened ("Saw a crewed launch", "Twilight jellyfish", "Three pads"), not after the person ("Master", "Elite"). No tiers beyond small, honest counts; no level 100 grinds; no leaderboards or comparisons with other people (there are no other people: no accounts).
6. **Rare things are celebrated, not demanded.** Jellyfish, crewed, Starship and new vehicle badges reward luck and attention, which keeps the motivation intrinsic (the sky was good) rather than a quota.
7. **Retroactive and forgiving.** Badges are computed from the log, not awarded at a moment, so adding or editing an old entry updates them and deleting an entry removes a badge without comment. Nothing is ever "lost" in a way that is signposted.
8. **Honest about the log.** Copy says "launches you logged", "from what you logged", and the logbook is a modeled estimate's companion, not proof. No invented counts, no community totals (the site has no server).
9. **Year recap without pressure.** Show the year's facts in a neutral tone; avoid "down 40% on last year". Offer it from December (or any time for the current year), never auto open it.
10. **Easy to leave.** Clear one entry, clear everything (with the usual confirm), export first. Decline buttons are plain ("Not now"), never shaming.
11. **Privacy by default.** Where from is a ZIP or a typed town, never GPS. Nothing leaves the device unless the visitor exports or shares a card, and the card shows no ZIP by default.

### Log entry and badges (suggested shape)

- Entry: launch id (from the feed), name and vehicle and pad at the time of logging (so the log survives the launch leaving the feed), liftoff UTC, logged at, where from (ZIP or town text, optional), how (plume, trail, dot, jellyfish; multi select or one), optional note (short, plain text). Optional rating is not needed.
- Badges (descriptive, mostly single, a few small counts):
  - Firsts: First launch logged; First night launch; First daylight launch.
  - Pads: one per pad seen (for example "Saw a launch from SLC-40"), plus "3 pads", "5 pads".
  - Vehicles: one per vehicle family (Falcon 9, Falcon Heavy, Starship, Electron, New Glenn, Vulcan, SLS...).
  - Special: Crewed launch; Starship; Twilight jellyfish (logged as jellyfish, or liftoff in civil or nautical twilight at the pad); Booster landing seen (only if the feed carries landing data); Heavy lift.
  - Counts: 1, 5, 10, 25 launches logged; stop there. No year counts.

---

## 2. Storing the log on the device

### Pick the store
- web.dev recommends IndexedDB (ideally through a small promise wrapper) for structured app data; Cache Storage is for resources [34]. localStorage is 5 MiB per origin and synchronous [36]; it is fine for the existing tiny keys (`radar.zip`, `radar.rem`, `radar.nerd`) but a growing log with notes belongs in IndexedDB. A log is small (hundreds of entries, a few KB each at most), so quota is never the issue; eviction is.

### IndexedDB practice (MDN [35])
- Open with an integer version: `indexedDB.open('radar-log', 1)`. Change the schema only in `onupgradeneeded`, creating only stores and indexes that are missing (`if (!db.objectStoreNames.contains('entries'))`), so later versions migrate in steps (`if (oldVersion < 2) {...}`).
- Stores: `entries` (keyPath `id`, a random id; index on `launchId` and on `t` the liftoff time), `meta` (schema version, created, last export time).
- `db.onversionchange = () => db.close()` so a second open tab does not block an upgrade; handle `onblocked` (tell the visitor to close other tabs only if it persists).
- Keep transactions short: never `await` unrelated work (fetch, timers) inside one, or it auto commits and throws `TransactionInactiveError`. Use `readonly` by default, `readwrite` only to write; `put` to upsert by id.
- Put a clear and a write in one transaction (import that replaces all). Do not start writes in `unload`/`pagehide`.
- Durability: Firefox may report `complete` before the data reaches disk [35]; acceptable for a log, but write on the tap, not on page exit.
- Catch `QuotaExceededError` on every write [36][37] and say so plainly.
- Fallback: if `indexedDB.open` fails (very old browsers, some locked down modes), keep the log in memory for the session and say "This browser can't keep your log".

### Quota, eviction and persistence
- **Best effort by default.** Without persistence, any browser may evict a site's data under storage pressure, least recently used origin first, and all of an origin's storage goes at once (IndexedDB, Cache, localStorage together) [36].
- **Quotas are large:** Chrome up to 60% of disk per origin; Firefox 10% of disk or 10 GiB best effort; Safari 17+ about 60% of disk for browser apps, the same for Home Screen web apps [36][37]. Check with `navigator.storage.estimate()`; it is an upper limit, not a promise [37][34].
- **`navigator.storage.persist()`:** ask only when saving important data, ideally in a user gesture, never on page load [38]. Firefox shows a prompt; Chrome and Safari decide silently on heuristics (engagement; in Safari notably whether it runs as a Home Screen web app) [36][37]. Check with `persisted()`. There is no way to undo it [38]. A WebKit bug reported `persist()` always returning false in Safari 17 on macOS [39]; treat a false as normal, not an error. Recommendation: call `persist()` when the visitor logs their first launch (that tap is the gesture), and never show a prompt or message about it.
- **Safari's 7 day cap (ITP).** With tracking prevention on (the default), Safari deletes all of a site's script writable storage (IndexedDB, localStorage, service worker registrations and caches) after seven days of Safari use without a user interaction on the site [40][36]. Interaction on the site resets the timer [40]. Home Screen web apps have their own day counter based on use of the app and, per WebKit, their first party data is exempt from the cap [40][41]; web.dev repeats that the policy does not apply to installed PWAs [34][38]. Some bug reports claimed deletions anyway [42]. **Practical consequence:** an iPhone visitor who logs a launch in Safari and does not open Astro Radar (and tap something) for a week of Safari use can lose the whole log, along with their ZIP and reminders, which have the same exposure today.
- **Private browsing:** storage is usually deleted when the private session ends, and quotas can be lower (Chrome incognito about 5% of disk) [36][34]. Detecting private mode is unreliable; just say on the Your launches page that the log lives in this browser.

### What to tell the visitor (no pop ups)
- One line on the Your launches page: "Your log is kept only in this browser on this device. Export it to keep a copy." On iPhone in Safari (not standalone, `navigator.standalone` false and not `display-mode: standalone`), add: "Safari may clear it if you don't visit for a week. Add Astro Radar to your Home Screen, or export."
- Show "Last exported: date" (or "Never") quietly next to the Export button. No nagging about it.

### Export and import
- **Format:** one JSON file, `astro-radar-log-YYYY-MM-DD.json`:
  ```json
  {
    "format": "astro-radar-log",
    "version": 1,
    "exported": "2026-11-15T18:00:00Z",
    "entries": [
      {
        "id": "k3f9...", "launchId": "ll2 uuid", "name": "Starlink Group 10-12",
        "vehicle": "Falcon 9", "pad": "SLC-40", "net": "2026-11-12T23:10:00Z",
        "logged": "2026-11-13T01:02:00Z",
        "from": {"zip": "32780"},
        "how": ["plume", "jellyfish"], "note": "From the Max Brewer bridge"
      }
    ]
  }
  ```
  Badges are not exported: they are computed from entries, so the file cannot disagree with the page.
- **Download:** `new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})`, `URL.createObjectURL(blob)`, a temporary `<a download="...">` clicked from the button's handler, then `URL.revokeObjectURL` [43][44]. On iPhone, offering `navigator.share({files: [file]})` for the JSON file as the first option lets the visitor save to Files or send it to themselves; fall back to the download link.
- **Import:** `<input type="file" accept="application/json,.json">`, read with `file.text()`, `JSON.parse` in try/catch, then validate:
  - `format` must equal `astro-radar-log`; `version` an integer no newer than the page knows (older versions are migrated in code; newer ones are refused with "This file is from a newer Astro Radar").
  - Every entry: string `id` and `launchId` of sane length, ISO times that parse, `how` only from the known list, `note` a string cut to the limit, `from.zip` five digits or `from.town` a short string. Drop unknown fields; skip and count bad entries rather than failing the whole file.
  - Cap file size (for example 2 MB) and entry count.
  - Never insert note text as HTML.
- **Merge:** key by `id`; two entries with different ids but the same `launchId` are the same sighting, so keep one (the one with the later `logged`, merging `how` and keeping the longer note). Show the result in one line: "Added 12, 3 already in your log, 1 skipped". Merge is the default; offer "Replace my log" only as a separate, confirmed action.

---

## 3. The Year in Launches share card on iPhone

### Sizes
- **Instagram Stories:** 1080 by 1920 (9:16). Keep text and logos out of the top and bottom ~250 px (the profile bar and reply field); some guides say up to 340 px at the bottom; keep about 65 px clear at the sides [45][46][47]. A centre area of about 1080 by 1420 is safe [45].
- **Feed portrait:** 1080 by 1350 (4:5), the tallest a feed post shows.
- **Link previews (iMessage, X, Slack):** 1200 by 630 is the Open Graph size the site already uses for launch pages. An image file sent in iMessage shows as a photo at its own aspect, so the story card works there too.
- **Recommendation:** render one 1080 by 1920 card with all content inside the central 1080 by 1420 (top and bottom 250 px are background: stars and the planet's rim), so the same file reads well in a story, in iMessage and saved to Photos. Optionally a 1080 by 1350 variant later. Do not put the ZIP or town on it by default.

### Drawing it
- Draw on an offscreen `<canvas>` 1080 by 1920 at a scale of 1 (do not multiply by devicePixelRatio). That is 2.07 million pixels, far under iOS Safari's old 16,777,216 pixel per canvas cap (4096 by 4096; raised in iOS 18 per a secondary source) and its total canvas memory budget (reported 224 to 384 MB depending on version) [48][49]. Release the canvas after use (`canvas.width = canvas.height = 0`) because those budgets count canvases still referenced.
- Wait for fonts before drawing (`document.fonts.load('600 64px "Barlow Condensed"')`), draw provider logos from the same origin PNG copies the share images use (a cross origin image without CORS taints the canvas and `toBlob` then throws).
- `canvas.toBlob(cb, 'image/png')` gives the file; PNG keeps the flat colors and text sharp (JPEG at 0.9 is a smaller fallback if the PNG is over a few MB).

### Sharing it
- `navigator.share()` needs a secure context and a user gesture (a click) [50]. Build the file before the tap if possible (render when the recap opens), because slow async work between the tap and `share()` can lose the gesture on Safari.
- Feature detect with `navigator.canShare({files: [file]})` before calling `share` [50]. Safari has had `canShare` since 14 and `share` since 12.1 [50], but file sharing was unreliable in iOS 14 and 15.0 to 15.1 [51][52]; pass a `File` (not a bare Blob) with a name and `type: 'image/png'` [51]. Use only the `files` field (plus a short `text` at most): adding a `url` alongside files makes some targets drop the image.
- Handle the promise: `AbortError` means the visitor closed the sheet (say nothing); anything else falls back.
- **Fallback:** a download link to the PNG (`<a download="year-in-launches-2026.png">` from an object URL) and, on iOS, show the image itself on the page so a long press gives "Save to Photos". Desktop browsers without file sharing just download.
- CSP: the share happens client side with blob URLs; if the image is shown in an `<img>`, `img-src` must allow `blob:` (check `csp_for` in `build.py`).

### Typical recap stats (from Letterboxd, Strava, Untappd)
Totals (launches logged), unique counts (pads, vehicles, providers), a top list (most seen vehicle or pad), firsts and highlights (first launch of the year, the best one: a jellyfish or crewed), a map or simple location note, and badges earned. For Astro Radar's card: year, number of launches logged, vehicles and pads as small lists, the highlight launch with its date, how it looked (the "how" icons), the badges earned this year, the Astro Radar mark and astroradar.io. Keep it to five or six facts; no comparisons with last year or with other people.

---

## Source list (all accessed 2026-11-15)

1. https://letterboxd.com/2012/ : Letterboxd, "2012: The Year in Review" (search snippet).
2. https://www.cactuslab.com/work/letterboxd-year-in-review/ : Cactuslab, "Letterboxd Year in Review" (fetched).
3. https://cmrosens.com/2025/12/12/letterboxd-wrapped-2025/ : "Letterboxd Wrapped 2025" (blog, search snippet).
4. https://www.academicjobs.com/global-news/letterboxd-wrapped-2025-takes-over-social-media-movie-stats-viral-trends-33 : coverage of Letterboxd 2025 Year in Review (low quality, secondary).
5. https://letterboxd.com/monwest/year/2025/ : an example Letterboxd 2025 year stats page (search snippet).
6. https://www.bikeradar.com/news/strava-year-in-sport-2025 : BikeRadar, "Strava's 2025 Year in Sport report".
7. https://the5krunner.com/2025/12/04/strava-2025-year-in-sport-report-apple-watch-coros-gen-z/ : the5krunner, Strava 2025 Year in Sport report.
8. https://communityhub.strava.com/insider-journal-9/getting-started-with-strava-achievements-1534 : Strava Community Hub, "Getting started with Strava achievements".
9. https://support.strava.com/hc/en-us/articles/216917137-What-s-a-segment- : Strava Support, "What's a segment?".
10. https://220triathlon.com/training/bike-training/what-is-strava-and-how-does-it-work : 220 Triathlon, "What is Strava, and how does it work?".
11. https://cyclingweekly.com/news/forget-distance-covered-these-are-the-key-stats-to-note-in-your-strava-year-in-sport : Cycling Weekly, key stats in your Strava Year in Sport.
12. https://www.cyclingweekly.com/news/im-gutted-about-my-strava-year-in-sport-cycling-stats-but-i-wont-be-doing-anything-differently-in-2026 : Cycling Weekly, "I'm gutted about my Strava Year in Sport cycling stats".
13. https://help.untappd.com/hc/en-us/articles/360034490631-How-Can-I-Hide-Badge-Level-Cards-on-Check-in : Untappd Help, "How can I hide badge level cards on check in".
14. https://lounge.untappd.com/everything-you-need-to-know-about-untappd-badges/ : Untappd, "All About Untappd Badges (2023)" (fetched).
15. https://untappd.com/user/Marykat/badges : an example Untappd badge list ("Untappd at Home (Level 20)").
16. https://untappd.com/blog/post/181615466178/year-in-beer-2018 : Untappd, "Year In Beer 2018".
17. https://axeetech.com/untappd-year-in-beer-uncappd/ : "Untappd Year in Beer: Recappd 2025" (secondary).
18. https://www.nasa.gov/news-release/look-up-new-nasa-app-helps-stargazers-spot-space-station/ : NASA, "Look Up: New NASA App Helps Stargazers Spot Space Station" (fetched).
19. https://apps.apple.com/us/app/spot-the-station/id6449235044 : App Store, Spot the Station (release notes, Past Sightings).
20. https://2013.spaceappschallenge.org/project/iss-spotter : Space Apps Challenge 2013, "ISS Spotter" concept.
21. https://udel.edu/udaily/2024/march/power-of-streaks-motivation-jackie-silverman : UDaily, "How streaks motivate us" (fetched); cites Silverman and Barasch, "On or Off Track: How (Broken) Streaks Affect Consumer Decisions", Journal of Consumer Research 49(6), 2023.
22. https://ideas.repec.org/a/eee/jobhdp/v179y2023ics0749597823000572.html : Silverman, Barasch and Small, "Hot streak! Inferences and predictions about goal adherence", OBHDP 179, 2023.
23. https://uxmag.com/articles/the-psychology-of-hot-streak-game-design : UX Magazine, "The psychology of hot streak game design".
24. https://atticusli.com/blog/posts/duolingo-skinner-habit-loop-variable-reinforcement-behavioral-economics/ : Atticus Li, Duolingo habit loop analysis.
25. https://screenwiseapp.com/guides/managing-duolingo-streaks-when-gamification-becomes-stressful : Screenwise, "Managing Duolingo streaks when gamification becomes stressful".
26. https://www.huntonprivacyblog.com/2022/09/27/ftc-releases-report-on-dark-patterns/ : Hunton, "FTC Releases Report on Dark Patterns" (FTC staff report "Bringing Dark Patterns to Light", Sept 2022).
27. https://www.deceptive.design/types : Harry Brignull, Deceptive Patterns, types (fetch timed out; types as reported by [28]).
28. https://nngroup.com/articles/deceptive-patterns/ : Nielsen Norman Group, "Deceptive Patterns".
29. https://humanetech.com/problem : Center for Humane Technology, "The Issues".
30. https://gitea.it/tommi/quitsocialmedia.club/raw/branch/11ty/eleventy%232420/assets/Humane%20Technology%20for%20Students.pdf : Center for Humane Technology, "Humane Technology for Students" (mirror).
31. https://link.springer.com/article/10.1007/s11423-023-10337-7 : Educational Technology Research and Development, 2023, gamification and intrinsic motivation (cites Deci, Koestner and Ryan 1999).
32. https://glassmanlab.seas.harvard.edu/annotated_works/mekler17.pdf : Mekler, Brühlmann, Tuch and Opwis, "Towards understanding the effects of individual gamification elements on intrinsic motivation and performance", Computers in Human Behavior 71, 2017.
33. https://olj.onlinelearningconsortium.org/index.php/olj/article/download/5188/1617/28002 : Online Learning Journal, gamification meta-analysis (g = 0.257 over 35 interventions; as reported in search results).
34. https://web.dev/articles/storage-for-the-web : web.dev, "Storage for the web" (fetched).
35. https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB : MDN, "Using IndexedDB" (fetched).
36. https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria : MDN, "Storage quotas and eviction criteria" (fetched).
37. https://webkit.org/blog/14403/updates-to-storage-policy/ : WebKit, "Updates to Storage Policy" (Safari 17) (fetched).
38. https://web.dev/articles/persistent-storage : web.dev, "Persistent storage".
39. https://bugs.webkit.org/show_bug.cgi?id=271401 : WebKit Bug 271401, "navigator.storage.persist() always return false".
40. https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/ : WebKit, "Full Third-Party Cookie Blocking and More" (fetched).
41. https://webkit.org/blog/11338/cname-cloaking-and-web-privacy/ : WebKit, "CNAME Cloaking and Bounce Tracking Defense" (home screen first party exemption).
42. https://bugs.webkit.org/show_bug.cgi?id=237350 : WebKit Bug 237350, "Web App Added to Home Screen Cookies Deleted After 7 Days".
43. https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a#download : MDN, `<a>` download attribute (reference, not fetched this session).
44. https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static : MDN, URL.createObjectURL (reference, not fetched this session).
45. https://www.outfy.com/blog/instagram-safe-zone/ : Outfy, "Instagram safe zone".
46. https://www.shopify.com/blog/instagram-story-size : Shopify, "Instagram Story Size".
47. https://wyzowl.com/instagram-story-dimensions/ : Wyzowl, "Instagram Story Dimensions".
48. https://pqina.nl/blog/canvas-area-exceeds-the-maximum-limit/ : PQINA, "Canvas Area Exceeds The Maximum Limit".
49. https://www.pqina.nl/blog/total-canvas-memory-use-exceeds-the-maximum-limit/ : PQINA, "Total Canvas Memory Use Exceeds The Maximum Limit".
50. https://web.dev/articles/web-share : web.dev, "Integrate with the OS sharing UI with the Web Share API" (fetched).
51. https://bugs.webkit.org/show_bug.cgi?id=198606 : WebKit Bug 198606, Web Share files support.
52. https://bugs.webkit.org/show_bug.cgi?id=234187 : WebKit Bug 234187, "File sharing on Safari does not resolve in iOS 15.1.1 and 15.0".
