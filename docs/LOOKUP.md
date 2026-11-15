# Look Up (Phase 1)

"The launch tracker for people who go outside to watch." Free, no ads, no account. This file holds the critique, the design rules, the
research for the new features and the hand checks. Screenshots are in the private Artifact linked from the pull request.

## 1. Critique of the site on main (13 Nov 2026), ranked

Taken at 390, 768, 1440 and 1920 on every page type: home, Launches, a launch page, Watch, Astro, Live, News, Florida, a provider page
and About. Blunt, worst first.

1. **The main page and every other page are two different sites.** The main page has its own header (the spaced capitals ASTRO RADAR,
   More, a countdown pill), a bottom tab bar on phones and a full width layout. Every other page has a second header (Launches, Live,
   News, More), no tab bar and a narrow column. Moving from the home page to a launch page feels like leaving the site.
2. **Launch pages are small on big screens.** At 1440 and 1920 the launch page is a column about 400 px wide with 11 to 13 px labels
   in the middle of an empty screen. The facts grid packs nine label and value pairs, each with three lines of time, into a box.
3. **Too much tiny text.** Labels at 11 to 12 px (Liftoff, Status, Vehicle, the row times, the source lines, the More menu, the Watch
   source under each button), on a page whose body is 16 to 17 px. The reference sites keep body text at 14 to 17 px and one or two
   label sizes; the radar has seven sizes in its first screen.
4. **The home first screen at 1920 is a strip in the top left corner.** The copy sits in a 600 px column at small sizes and the photo
   takes the rest; the countdown and the button are no bigger than at 1024.
5. **The countdown says 00 Days.** A launch five hours away shows "00 / 05 / 38 / 10" with a Days unit, and the nav pill says 00d.
6. **Pills and chips everywhere.** The Launches filter is a row of 13 pills with counts (wrapping to two lines at 1440); each row has a
   logo chip, a flight tag, a status chip and a chevron; the hero has the logo chip, "Next launch", a status, and a "Data delayed"
   chip. The status "Time to be confirmed" shows twice on the phone hero.
7. **Long names are cut.** "MKA KINOSPUTNI..." and "THE MOUN..." on phone rows; the hero title runs to three lines of condensed capitals
   on a phone.
8. **The same fact in three forms.** A launch page gives liftoff in UTC, then your time, then the pad's time, in a cell, plus a
   sentence above ("Liftoff in 5 h 39 min, time to be confirmed"), plus a status cell.
9. **A literal "\n\n\n" above the header on /live and /news** (a bug in the preload links).
10. **Buttons of four kinds** on one launch page: the solid Watch, the ghost Share to Astro, Add to calendar and Copy link, each with
    different padding, and on the Watch tab "Watch live" with a domain in a second color glued on.
11. **"Data delayed, updated 2 h ago"** on the live site most of the day (the schedule runs late and the Worker is not configured).
    True, but it is the loudest thing on the hero.
12. **No answer to the question the site is for.** "Can I see it?" is a one word rating ("Good") at the bottom of the hero, its reason
    two screens down, and launch pages say only how far the pad is.

**What must stay:** the real NASA night photo (George liked it, and nothing else on the site is as good), the one blue accent, Barlow
and Barlow Condensed, the solid main button, the visibility model and its cautious wording, the launch list's short names, the provider
logos, the Live and News pages' honest "last updated" lines, every test, and the speed (no WebGL, one photo).

## 2. How calm sites stay calm, and the rules here

Looked at on 13 Nov 2026 at 1440 and 390 (screens and computed styles): SpaceX launches, NASA, Apple, Linear and Next Spaceflight.

- **One message per screen.** SpaceX's launch page is one photo, one name, one countdown and one "Watch" link. Apple is one product,
  one line and two buttons. NASA has one headline and one red button.
- **Few sizes.** Each uses two or three body sizes (14, 16, 17 px) and one or two display sizes; the next step up is large (48 px on
  SpaceX, 56 px on Apple), not a ramp of near sizes.
- **Few colors.** SpaceX's text uses 4 colors in total, Next Spaceflight 8; the accent is a single color used only for the action.
- **Space instead of lines.** SpaceX and Apple separate blocks with space and photographs, almost never boxes; Linear uses hairlines
  and one surface color.
- **Numbers are typeset as numbers.** Countdowns are tabular, with small units, and never show a zero unit.

The rules this branch follows (the tokens are in the `ds` block in `src/template.html` and `launch_pages.py`):

1. **Type scale**, five steps only: 13 (labels, never smaller), 16 (body on phones; 17 on desktops), 20 (lead), 28 (section),
   and a display size (the launch name: 40 on phones, up to 72 on wide screens). Labels are sentence case, never spaced capitals.
2. **Spacing scale**, multiples of 4: 4, 8, 12, 16, 24, 32, 48, 64, 96. Sections are 64 apart on phones, 96 on desktops.
3. **One accent**, the existing blue, used only for the main action and links. Status colors (go, hold, scrub) appear only as a
   small dot with a word.
4. **One card style**: the surface color, 16 px radius, no border, 24 px padding (16 on phones). At most two chips per card.
5. **One main action per screen.** Secondary actions are text links or one More menu.
6. **One header and one footer on every page**, the same width (1200 px), the same links.
7. **Content width:** 720 px for reading, 1200 px for grids; launch pages use the full 1200 on desktops (two columns: the story on the
   left, the Look Up card and facts on the right).
8. **Numbers:** tabular figures; a countdown drops leading zero units (5 h 38 m, not 00 days 05 hours).
9. **Never invent data.** A missing field says so in plain words ("Landing not announced", "No timeline from the provider yet").

### Two directions

`?design=a`, **Mission control**: the black of space with no photo, data forward: the countdown large in tabular figures, a thin grid of
facts, the Look Up verdict as a large word. `?design=b`, **Cinematic**: the NASA night photo across the hero, a large launch name, more
space, the facts below the fold. Both share every token above; only the hero and the launch page header differ. The choice is kept in
this browser (`radar.design`); a link with `?design=` sets it.

**Default: B, Cinematic.** It is the one a stranger reads as premium in three seconds (a real photograph of the Earth at night carries
the brand the way SpaceX's and NASA's photos do), George asked for the photo back, and it costs nothing in speed since the photo is
already on the page. A is the better tool for someone who checks often; it stays one link away.

## 3. Look Up: the math

Everything comes from the existing visibility model (`ORB.visibility` in `src/model.js`, documented in `docs/VISIBILITY.md`) and the
feed; the card only words its result. `ORB.lookUp` turns it into a verdict:

Five levels, and the one thing that limits the view (`limit`), so the headline reason is the real one (changed 14 Nov 2026 after field
reports from Miami, section 8):

- **Yes:** in view at night or in twilight for a minute or more, at least 5 degrees up, as a sunlit plume or within 400 km.
- **Likely:** in view at night or in twilight for 30 seconds or more, at least 4 degrees up.
- **Maybe:** in view but low, brief or far; or a daylight trail close in (within 150 km and 10 degrees up).
- **Unlikely:** daylight (above the horizon, but a bright sky hides all but a faint trail; with a tip to look low in the right
  direction for a small bright dot or trail if the sky is very clear), far and faint at night, or 90 percent cloud.
- **Below horizon:** the rocket never climbs 3 degrees above the horizon. Only this case is worded as out of sight; nothing says
  "never" or "too far to see" otherwise.

Clouds come last: 50 to 89 percent takes one level off, 90 percent or more makes it Unlikely. The reasons are kept apart on the radar
(Distance and horizon, Light, Clouds) and the limiting one is listed first.

The card gives: the reason in one sentence; the direction to face at the best moment (compass word and degrees, `best.az`); how high
(`best.el`, in degrees and in fists at arm's length, about 10 degrees each); the time window (first and last second it can be seen,
in the visitor's time); clouds (NWS sky cover for the ZIP at launch time); the twilight chance (`jelly`: the sun 3 or more degrees below
the visitor's horizon while the rocket is in sunlight, the "jellyfish" window); and sound: **"You'll hear it about N seconds after you
see it"**, from the distance to the pad at 343 m/s (sound at 20 C), only when the pad is within 60 km. Farther than that the rumble is
usually lost, so the card says "Too far to hear". It is labeled **Estimate** with a link to how it works.

The heading is not in Launch Library: the feed's `az` comes from the orbit Launch Library names and the pad (`azimuth` in
`scripts/fetch_launches.py`). The card says so ("Heading estimated from the target orbit").

How others word it: Orbital Radar and LaunchX give a yes or no style verdict with a viewing chance; findstarlink.com gives a time,
a direction to face and an elevation. The card does all three in one line each, and says Estimate.

## 4. Sonic booms

Launch Library's detailed record has the first stage's landing (`rocket.launcher_stage[0].landing`: `attempt`, `type.abbrev` RTLS for a
return to the launch site, ASDS for a drone ship, `location.abbrev` such as LZ-1, LZ-2, LZ-4 or OLM-B). The feed keeps it as `land`
(type, place, place name). A landing on land near the pad can be heard as one or more sonic booms; a drone ship landing hundreds of
kilometres out at sea normally is not.

Who may hear it, from the providers' and the bases' own past notices (news coverage, 2018 to 2024): for a Cape landing (LZ-1, LZ-2,
LZ-40 and SLC landing pads at Cape Canaveral) residents of Brevard, Orange, Osceola, Indian River, Seminole, Volusia, Polk, St. Lucie
and Okeechobee counties; for Vandenberg (LZ-4) Santa Barbara, Ventura and San Luis Obispo counties; for a Starbase return (the
launch mount) Cameron County, Texas. The note says this is from past notices, that the booms depend on the weather, and that the
provider's own notice for the flight is the one to trust. A landing elsewhere says only that the booster lands and where.

## 5. Calendar feeds and search

`launches.ics` already exists (RFC 5545, stable UIDs, SEQUENCE and LAST-MODIFIED from Launch Library's `last_updated`). Added:
`/calendar/pad/<slug>.ics` for every pad with a launch and `/calendar/provider/<key>.ics` for every provider. Each is written at every
build, so a subscribed calendar updates on its own schedule when a launch slips (each calendar app decides how often it checks; Google's can take up to a day); the
SEQUENCE rises with each change, and a launch that left the feed is gone at the next refresh.

Launch pages carry Event markup; a launch that slipped is marked `eventStatus` EventRescheduled with `previousStartDate` (the time
before the last slip, from the change log), as Google's Event documentation describes.

## 6. Trust strip and change log

Every launch shows: the source (Launch Library 2), when it was last checked (the feed's time), the time confidence from Launch
Library's `net_precision` (to the second or minute: Confirmed; to the hour: Within the hour; a day, month or quarter: Estimated) and
the window when the feed gives one; and a change log. The change log is built by diffing our own saved feed: each run of
`scripts/fetch_launches.py` reads the last `changes.json` and `launches.json` (the output folder, else the live site), compares every
launch, and records a slip (the new time and how far it moved), a scrub (as the toasts define it), a status change and a launch that
left the feed, with the time it was seen. Entries are kept 45 days. It is our record, not Launch Library's, so it says "Seen by Astro
Radar".

## 7. Hand checks

Three real launches from Launch Library's answer of 13 Nov 2026 (`tests/raw_ll2_lookup.json`), from three ZIP codes, through the page's own
model (`tests/lookup_check.cjs`). `tests/test_lookup_hand.py` checks every row with arithmetic written separately in Python: the haversine
distance and bearing, the sun's elevation from `launch_pages.sun_el`, the horizon limit for a rocket 200 km up, a daylight trail's reach,
and, for a Yes or Maybe, that the point the card says to look at (direction, elevation and slant range) lies on the launch's own heading
from the pad, within 25 km, at the rocket's height within 6 km.

| Launch (UTC) | ZIP | Pad distance | Sun at the ZIP | Verdict | Face | Up | Reason on the card |
|---|---|---|---|---|---|---|---|
| Florida: Vulcan, Amazon Leo LV-01, SLC-41, 14 Nov 17:32 | 33196 Miami | 202 mi (325 km) | 45.5 up | **Unlikely** | N, 3 degrees | 3 degrees | Daylight: the rocket climbs above your horizon, but in a bright sky it is only a faint trail. |
| | 32801 Orlando | 48 mi (77 km) | 42.8 up | **Maybe** | ENE, 66 degrees | 20 degrees | Daylight: it is close enough that its trail may show, but a bright sky makes it easy to miss. |
| | 90012 Los Angeles | 2,242 mi (3,608 km) | 29.7 up | **Below horizon** | | | It stays below your horizon from here, because the Earth curves away. |
| Vandenberg: Falcon 9, USSF-317, SLC-4E, 18 Nov 03:14 | 33196 Miami | 2,462 mi (3,962 km) | 63.2 down | **Below horizon** | | | It stays below your horizon from here, because the Earth curves away. |
| | 32801 Orlando | 2,333 mi (3,754 km) | 61.9 down | **Below horizon** | | | It stays below your horizon from here, because the Earth curves away. |
| | 90012 Los Angeles | 141 mi (227 km) | 30.2 down | **Yes** | SW, 214 degrees | 45 degrees | Its engine flame should stand out against the dark sky. |
| Overseas: Electron, The Mountain God Rises, Mahia, 14 Nov 05:30 | 33196 Miami | 7,915 mi (12,738 km) | 80.7 down | **Below horizon** | | | It stays below your horizon from here, because the Earth curves away. |
| | 32801 Orlando | 7,975 mi (12,835 km) | 78.7 down | **Below horizon** | | | It stays below your horizon from here, because the Earth curves away. |
| | 90012 Los Angeles | 6,505 mi (10,468 km) | 57.5 down | **Below horizon** | | | It stays below your horizon from here, because the Earth curves away. |

By hand: Los Angeles to Vandenberg is 227 km; 3.5 minutes after liftoff a Falcon 9 heading south is about 100 km up over the sea southwest
of the city, 141 km away in a straight line, so atan of about 100 over 100 gives 45 degrees, and at 7:14 PM PST the sun is 30 degrees
down, so the engine flame is against a dark sky: Yes. Orlando is 77 km from SLC-41 at 12:32 PM: the rocket is in view, but in full
daylight only a trail shows: Maybe. Miami is 325 km away and the rocket does climb above its horizon, but at noon: Unlikely, because of daylight, not distance. The New Zealand launch is
10,000 km or more from every US ZIP, far past the 1,600 km at which even a rocket 200 km up reaches the horizon: Below horizon.

## 8. Field reports from Miami (14 Nov 2026)

George, Miami, ZIP 33196, about 200 mi south of Cape Canaveral: every SpaceX launch from the Cape and Kennedy in the last two months seen
from Miami (video of a twilight one: a long bright trail, then the glowing engine and plume; and of one before dawn: a full jellyfish
plume with stage separation); Starship seen from Miami at twilight; a midday ULA launch rated "Not visible, too far to see".

**The launches** (Launch Library 2, `tests/field/miami_launches.json`), sorted by the light at 33196:

| Launch | Liftoff (Miami time) | Light at 33196 | Before | After |
|---|---|---|---|---|
| Dragon CRS-35, SLC-40 | 13 Oct, 6:33 AM EDT | dark sky, sun 11 degrees down, rocket in sunlight (the jellyfish) | Low view | **Yes** |
| Bandwagon 5, SLC-40 | 20 Oct, 7:04 AM EDT | twilight, sun 5 degrees down, rocket in sunlight | Low view | **Yes** |
| NROL-97, Falcon Heavy, LC-39A | 1 Oct, 11:54 PM EDT | night | Low view | **Likely** (in view 54 s, 7 degrees up) |
| Crew-13, SLC-40 | 1 Oct, 11:10 AM EDT | day | Not visible, too far | **Unlikely: daylight**, with the tip |
| O3b mPower 11-13, SLC-40 (13 Sep, just before the two months) | 2:49 PM EDT | day | Not visible, too far | **Unlikely: daylight** |
| ULA Vulcan, Amazon Leo LV-01, SLC-41 (planned) | 14 Nov, 12:32 PM EST | day | Not visible, too far | **Unlikely: daylight** |

**What produced "too far" for the ULA launch:** the model caps a daylight trail at 200 km (`RANGE.day`). Miami is 325 km from SLC-41,
and the rocket climbs above Miami's horizon, so the model marked it `why: 'far'`, and the page turned that into "Too far to see" and
"the rocket never gets close enough to see". The geometry was right; the words blamed distance for what daylight does. Now the verdict
looks at the sky where the rocket is above your horizon: in daylight the limit is the light.

**Why the twilight launches were "Low view":** the old rating took the lower of an angle tier (10 degrees for Good) and a distance tier
(400 km for Good). From Miami a Cape launch heads away to the northeast and peaks about 9 degrees up, 490 km away, so it scored the
lowest tier even though it is in view for over three minutes as a sunlit plume. The new levels weigh how long it is in view and how it is
lit: three minutes of sunlit plume against a dark sky is a Yes, however low.

**Starship Flight 15** (Starlink 31-2, 13 Nov 2026): the site's estimate counted from the planned liftoff, 22:45:00 UTC, but Starship
lifted off at 22:47:36, 2 minutes 36 seconds later, which is the gap reported (the deployed feed had not caught up). The ascent profile
was also slower than the real flight (hot staging at T+2:40 against the published T+2:21, ship engine cutoff at T+8:40 against T+8:09),
so the profile is now retimed to Flight 15's timeline in Launch Library, with the same heights and distances. From 33196 it now first
shows at T+5:56 (22:53:32 UTC, 5:53 PM EST), in the west 5 degrees up, peaking 30 degrees up in the south southwest at engine cutoff; the
old estimate said 22:51:22, 2 minutes 10 seconds earlier. We do not have the exact minute it was first seen, so the match to within a
minute cannot be confirmed; it climbs above the 3 degree horizon about 30 seconds before that, at 1,076 km, past the 950 km a sunlit
plume is credited with, so a sighting slightly earlier than T+5:56 would not surprise us.
