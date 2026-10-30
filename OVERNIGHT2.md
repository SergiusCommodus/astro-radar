# Overnight run 2, October 30, 2026

Branch `overnight2`, cut from `origin/main` (adc8a49). Nothing is merged into main; one pull request at the end.

## Progress log

- 01:51 Started. Created `overnight2` from `origin/main`.
- 01:52 Choice: brought in `visibility-check` (pull request 18, not merged yet) by a fast forward, since PART 1 asks for the same work and builds on it. If 18 is merged first, this branch still merges cleanly.
- 01:52 Choice: did not bring in `hero-fix` (pull request 17). It shows the photo for every launch, while PART 2 asks for a better globe for launches outside the photo. The two go in opposite directions; the globe path is kept here.
- 01:53 Baseline build with a fresh mock feed (`tests/make_mock_ll2.py`) inlined: `dist/index.html` 273,341 bytes.
- 02:05 Baseline check (`check.cjs`, scratchpad): 390, 768, 1440 wide no errors, layout shift 0 to 0.0004; 1920 once showed a 0.13 shift (the intermittent desktop shift seen on main before); six more runs at 1920 gave 0.0001 each.
- 02:20 PART 1: the model, clouds, "Why this rating" and "How we estimate this" come from pull request 18. Added two documented Vandenberg twilight launches to `tests/visibility.test.mjs`: Iridium 4 (Dec 22 2017, Spaceflight Now: photos from Hawthorne, Peoria, Mesa and Gila Bend AZ) and SAOCOM 1A (Oct 7 2018, Spaceflight Now, KQED: Los Angeles to Sacramento, KOLD: Peoria AZ). Both Arizona sightings were at 780 to 820 km from the pad, beyond the 800 km sunlit plume cap, so the model said Not visible for something people saw. Raised `RANGE.lit` to 950 km (the farthest slant range in those sightings is about 944 km). The rating there stays Low view, since the distance tier caps it. Now 39 observer cases from 16 launches: 35 match, 4 more cautious than an official map, 0 mismatch.
- 02:25 PART 1: reviewed the launch heading guess (`azimuth` in `scripts/fetch_launches.py`): ISS from the Cape 45 degrees and from Wallops 52, Starlink Group 6 from the Cape 124, Vandenberg Starlink 155 and polar 189 all match published corridors. Not changed (it would need the Worker port changed with it, and the card already says the heading is a guess). A Cape polar launch is guessed at 189 degrees, while the real corridor hugs the coast at about 165; noted, not changed.
- 02:30 Phone speed (`phone.cjs`, 390 wide, 4x throttle, five alternating runs against a baseline build of 9937199): main thread 4,967 against 4,963 ms, script 1,364 against 1,364 ms. Even.
