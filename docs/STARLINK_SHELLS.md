# Starlink shells and launch headings

Used by `STARLINK_FL` and `STARLINK_WEST` in `scripts/fetch_launches.py` and their port in `worker/src/feed.js` (change the two together).
Researched 19 November 2026 for REVIEW-FABLE.md finding H1. The heading comes from the shell's inclination and the pad's latitude:
azimuth = asin(cos i / cos lat), southeast from Florida for the 43 degree shell, northeast for 53 degrees; from Vandenberg every shell
flies south of east (inclination under 90) or south of west (polar). The formula leaves out Earth's rotation and any dogleg, so the
headings are within a few degrees, not exact; no source gives an azimuth in degrees.

| Group | Site | Inclination | Direction | Heading | Confirmed by |
|---|---|---|---|---|---|
| 6 | Florida (SLC 40, LC 39A) | 43.0 | southeast | 124 | Starlink 6-67, 14 May 2025; Starlink 6-88, 4 Jan 2026 ([Spaceflight Now](https://spaceflightnow.com/2026/01/04/live-coverage-spacex-to-launch-first-starlink-deployment-mission-since-problem-strikes-satellite/)) |
| 12 | Florida | 43.0 | southeast | 124 | Starlink 12-25, 18 Mar 2025: "all Group 12 launches thus far" southeast ([Florida Media Now](https://floridamedianow.com/2025/03/spacex-launches-starlink-12-25-this-afternoon)) |
| 13 | Florida (LC 39A) | 43.0 | southeast | 124 | Starlink 13-1, 21 Jan 2025 (the only Group 13 from Florida; inferred from the shell) |
| 10 | Florida | 53.16 | northeast | 43 | Starlink 10-32, 28 May 2025; 10-61, Sep 2025; 10-41, 1 Mar 2026, "the return to Starlink flights heading off on a north-easterly trajectory" ([Spaceflight Now](https://spaceflightnow.com/2026/03/01/live-coverage-spacex-to-launch-29-starlink-satellites-on-falcon-9-rocket-from-cape-canaveral-9/)) |
| 4, 5 | Florida | 53.2, 43.0 | northeast, southeast | 43, 124 | earlier groups, from Wikipedia's [List of Starlink and Starshield launches](https://en.wikipedia.org/wiki/List_of_Starlink_and_Starshield_launches) |
| 11 | Vandenberg (SLC 4E) | 53.0 | south easterly | 133 | Starlink 11-25, 4 Dec 2025 ([Spaceflight Now](https://spaceflightnow.com/tag/starlink-11-25/)) |
| 15 | Vandenberg | 70.0 | south easterly | 155 | Starlink 15-4, May 2025; 15-14, Jul 2026 ([Spaceflight Now](https://spaceflightnow.com/tag/starlink-15-4/)) |
| 17 | Vandenberg | 97.6 | southerly | 189 | Starlink 17-2, Jul 2025 ([Spaceflight Now](https://spaceflightnow.com/2025/07/18/live-coverage-spacex-to-launch-24-starlink-satellites-into-polar-orbit-on-falcon-9-rocket-from-california/)); 17-20, Jan 2026 |
| 13 | Vandenberg | 97.6 | southerly | 189 | Starlink 13-4, 31 Jul 2025 ([Spaceflight Now](https://spaceflightnow.com/2025/07/31/space-x-launches-west-coast-falcon-9-rocket-on-starlink-13-4-mission/)) |
| 2, 3 | Vandenberg | 70.0, 97.6 | south easterly, southerly | 155, 189 | earlier groups, from Wikipedia's list |

**Group 13 depends on the pad**: 43 degrees from Florida, 97.6 from Vandenberg, so the table is keyed by coast and group.

**Any other group** (7, 8, 9, 14, 16 and later, unconfirmed): no shell is guessed. The heading is a neutral one, due east from Florida and
due south from California, and the launch carries `azq: "guess"`, so the page says the direction is an estimate. The old rule sent every
Florida group but 6 northeast, which put Group 12 (southeast all through 2025) on the wrong side of the sky.

Starship flights carry Starlink too but fly their own heading (97 degrees from Starbase); the table never applies to them.

Add a group only with a source that says its direction for a real launch.
