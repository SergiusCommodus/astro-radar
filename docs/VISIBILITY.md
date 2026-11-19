# Visibility model: evidence and changes

`ORB.visibility` in `src/model.js` estimates whether, when and how well a launch can be seen from a place. It is a modeled estimate,
never a promise, and it leans cautious: a false "Excellent view" is worse than a false "Low view". This file records the evidence
behind its numbers, every change made to it, and the sightings it still does not explain. The tests are `tests/visibility.test.mjs`
(`node --test tests/visibility.test.mjs` prints the full comparison table).

## How it decides (short)
1. **Geometry.** The rocket must be at least 3 degrees above the observer's horizon (`MINEL`), with the Earth's curvature counted.
2. **Light.** At every second of the flight: is the observer's sky day, twilight or dark, and is the rocket above the Earth's shadow at
   the spot below it (a sunlit plume against a darker sky, the "jellyfish")?
3. **Range by light** (`RANGE`): a daylight trail 200 km, a sunlit plume 950 km (less in a bright twilight sky: `litCap`, from 950 km
   with the sun 6 degrees down to 200 km with it 2 up), engine glow in the dark 400 km (first and upper stage), 150 km in twilight. Smaller rockets get less (`VSCALE`: Electron 0.6, New Shepard and other suborbital hops
   0.35), except Electron's sunlit plume (below).
4. **Rating** inside that: the lower of an angle tier (30, 18, 10 degrees) and a distance tier (150, 250, 400 km), one step lower for a
   daylight trail, and short views held down.

## Evidence
Each documented case gives a launch (time, pad, vehicle profile, initial heading) and places with what was reported there:
- **sighting**: people reported seeing it. Must come out visible; more than 150 km from the pad it may not be rated Excellent.
- **near**: a viewer close to the pad. Must be Great or Excellent.
- **guide**: a viewing guide's statement (visible or not).
- **forecast**: an official map. Printed for comparison; the model may be more cautious, never more generous than the cap.
- **cautious**: no source; the model must not claim a good view.
- **open**: a documented sighting the model misses, whose evidence or inputs are too weak to change the model for. Never rated better
  than Low, and printed as OPEN every run.

There are 88 observations from 34 launches. The 18 launches added on November 10, 2026 come from news reports, official maps and launch
lists, each linked in the test (`SRC2`):

| Launch | Light | Places |
|---|---|---|
| Electron, The Owl's Night Begins, Mahia, Dec 2020 | twilight, rocket sunlit | Napier, Waimate, Alexandra, Invercargill |
| Electron, Owl New World, Mahia, Oct 2025 | before dawn | Tauranga, New Plymouth, Auckland, Whangarei |
| PSLV-C26, Sriharikota, Oct 2014 | night | Chennai |
| Firefly Alpha VICTUS NOX, Vandenberg SLC 2W, Sep 2023 | after sunset | Pahrump, Henderson, Phoenix |
| Starlink 7-16, 11-10 and 11-20, Vandenberg | dusk | Griffith Observatory, Summerlin, Pahrump, Searchlight, Los Angeles, Phoenix |
| WorldView Legion 5 and 6, LC 39A, Feb 2025 | just after sunset | Topsail Beach, Morehead City, Assateague, New York City |
| Atlas V Starliner OFT, Dec 2019 | before sunrise | Oglethorpe County and Loganville, Georgia |
| Falcon Heavy USSF-52, Dec 2023 | night | Orlando, Magic Kingdom, West Palm Beach, Cedar Key, Miami Beach, Myrtle Beach (open) |
| Starlink 10-40 and CRS-35, SLC 40, 2026 | before sunrise | Pinellas County beaches; McDonough GA, Richmond VA |
| Artemis II, Apr 2026 | daylight | Orlando (seen); NASA map for Jacksonville, Tampa, Miami, Savannah, Valdosta |
| Antares NG-18 and NG-19, Wallops | before dawn; after sunset | Guttenberg NJ; Chalfont PA, Emerald Isle NC, coastal Connecticut, Boston, Cape Cod |
| Electron, Virginia Is For Launch Lovers, Wallops, Jan 2023 | after sunset | Chincoteague (near) |
| Minotaur I NROL-111, Wallops, Jun 2021 | daylight | New York City (NASA map) |
| Starship Flight 11, Starbase, Oct 2025 | the ship at sunset, 10 minutes up | Boynton Beach and Sarasota, Florida |

Vehicle profiles are the ones the feed gives (`scripts/fetch_launches.py`): Electron is `EL`; Firefly Alpha, Minotaur, PSLV and Antares
are `GEN`. Headings come from the orbit's inclination where a source gives it; otherwise they follow the cases already in the test for
the same kind of mission, and are marked as assumed in the test.

### Left out on purpose
- Electron "Don't Stop Me Now" (Jun 2020): reported hidden by cloud. The model has no clouds offline (the page uses the National Weather
  Service forecast), so a cloud miss cannot test it.
- Inspiration4 and Cygnus OA-5: the sources name only states or a stretch of coast, no place to test from.
- Vulcan USSF-106 (Aug 2025): the lights seen 90 minutes after liftoff were probably vented propellant, and one article blamed a
  different launch the same night.
- New Glenn NG-1, Delta IV, a Plesetsk GLONASS launch, Spectrum from Andøya: no usable sighting source found.

## Changes
### November 19, 2026: an independent review (docs/REVIEW-FABLE.md)
- **Headings** (H1, M5): Starlink groups get their real shell (docs/STARLINK_SHELLS.md). Groups 6, 12 and 13 fly southeast from Florida
  (124 degrees), Group 10 northeast (43). A group not in the table gets a neutral heading marked as an estimate, never northeast by
  default. MEO flies due east. A southeast Starlink at midnight from Miami is now look east northeast, 27 degrees up, over two minutes;
  with the old northeast guess it was north, 8 degrees up, under a minute.
- **Sunset and sunrise** (M1): a sunlit plume's reach shrinks smoothly with the sky's brightness, evenly in magnitudes, from 950 km
  (sun 6 degrees down) to 200 km (sun 2 degrees up); the zenith dims about 1 magnitude a degree between sunset and the end of civil
  twilight (SQM measurements, hnsky.org/sqm_twilight.htm). A sunlit plume under a sky with the sun still up is rated as a daytime view.
  Look Up gives no plain Yes with the sun less than 2 degrees down. A launch at sunset (sun half a degree up) seen from Miami was a Yes;
  it is now Likely at most.
- **The coast** (M2): Starship (150 s) and Falcon 9 and Falcon Heavy upper stages (120 s) keep their last speed and height past engine
  cutoff, seen only while sunlit (0.6 of the sunlit reach) and never in the shade.
- **The upper stage at night** (M3): 400 km (was 250), the same as the first stage. A northeast launch is still in view from Miami
  about a minute, since the stage is past 400 km within a minute of staging; a longer reach waits for a documented sighting.
- **A time to be confirmed** (M4): never more than Maybe, and the reason says so.
- **Starship Flight 15** (H2): from the real liftoff (22:47:36), first visible from Miami comes within a minute of the sighting (about
  22:53:22: the page showed 22:51:22 and it was seen "about 2 minutes" later). The old test compared the new estimate with the old one.
- Every documented case below still passes.
### November 14, 2026: the answer in five levels, and Starship retimed (field reports from Miami, docs/LOOKUP.md section 8)
- The visibility model itself (geometry, light, ranges) is unchanged. What changed is how its result is worded: `ORB.lookUp` gives Yes,
  Likely, Maybe, Unlikely or Below horizon and the one thing that limits the view. A Cape launch seen from Miami before dawn or at
  twilight (in view three minutes, about 9 degrees up, a sunlit plume) was a "Low view" and is now a Yes; a daytime launch above
  Miami's horizon was "Not visible, too far" and is now Unlikely because of daylight. The internal score and its tiers are kept.
- Starship's ascent is retimed to Flight 15's published timeline (hot staging T+2:21, ship engine cutoff T+8:09); heights and
  distances at each step unchanged. Flight 11's Florida sightings are still seen.
### November 10, 2026: Electron's sunlit plume gets the full range
- **Evidence.** The Owl's Night Begins (Dec 15 2020, 10:09 UTC, Mahia) was photographed from Waimate (830 km from the pad), Central
  Otago (960 km) and Invercargill (1,110 km), per an NZ Herald photo story. The model puts the rocket in sunlight from about 7 minutes in, as it
  climbs south into the polar summer, at 700 to 900 km from those places. With Electron's sunlit range scaled to 570 km (0.6 x 950) it
  called them not visible.
- **Change.** `VSCALE_LIT` in `model.js`: Electron's sunlit plume is not scaled down (the exhaust spreads in near vacuum whatever the
  rocket's size). Its daylight trail and engine glow still are. New Shepard and suborbital hops keep 0.35 everywhere.
- **Why it stays cautious.** Past 400 km the rating can only be Low, so the change turns "Not visible" into "Low view" for Electron's
  twilight launches at 570 to 950 km and nothing better. The invariants test now checks every non sunlit view against the scaled range.

### Not changed
- No other number moved. The new evidence agreed with the model everywhere else.

## Still open
- **Falcon Heavy USSF-52 from Myrtle Beach** (588 km, night, a home camera): with the assumed eastward heading the rocket stays under
  5 degrees and in the shade, so it is not visible; flown 30 degrees east of north it would be. No source gives USSF-52's heading, and a
  camera sees fainter than an eye, so the model is left as it is.
- **Owl New World**: the time is from a search summary (about 16:33 UTC) and the orbit is not confirmed. The cases pass with the Owl
  missions' sun synchronous heading.
- **A real check of the twilight rule at the far end.** The 950 km sunlit plume rests on sightings from Arizona (Iridium 4, SAOCOM 1A)
  and now New Zealand. More Starlink dusk launches seen from Phoenix and Las Vegas would tighten it.
