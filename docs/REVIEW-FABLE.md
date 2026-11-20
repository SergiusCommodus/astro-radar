# Independent review: the visibility model and sign in

Reviewed read only on `main` at 64cfd56, 18 November 2026. Nothing was changed. The model was read end to end and run against the
Miami cases; sign in was read end to end, and Astro's database rules were checked with read only queries.

**Verdict.** The model's physics and geometry are correct; its weak points are the guessed flight heading and a few calibration
choices. Sign in is carefully built and I found no way to take over an account through Radar's own code; the risk is in what a
Radar session can do, which is a decision to make before it is switched on. No Critical findings.

## Findings

### Critical
None.

### High

**H1. The flight heading is guessed wrong for most Cape Starlink launches, so Miami gets the wrong direction and level.**
- Where: `scripts/fetch_launches.py:68` (`southeast_starlink`), `:74` (`inclination`), ported in `worker/src/feed.js:59`.
- Why: only "Group 6" is sent southeast. Every other Starlink group from Florida is given 53.2 degrees, northeast. As I understand
  SpaceX's shells, Group 12 from Florida also flies southeast (43 degrees); check this against one recent Group 12 launch.
- Failure example (my run, Falcon 9 from SLC 40, midnight, ZIP 33196):
  - northeast (what the site computes): Likely, look north (7 degrees), 8 degrees up, in view 52 seconds;
  - southeast (what a 43 degree shell flies): Yes, look east northeast (63 degrees), 27 degrees up, in view over 2 minutes.
  George would be told to look north, low, for a launch that passes high in the east.
- Fix: a small table from Starlink group number to shell inclination and direction, per coast, in both feed files; fall back to
  today's guess for an unknown group. Add a test with the real headings.
- **Fixed** (reviewfixes): a Starlink shell table in both feed files (`STARLINK_FL`, `STARLINK_WEST`; sources in
  `docs/STARLINK_SHELLS.md`, checked against real launches: Groups 6, 12 and 13 fly southeast from Florida at about 124 degrees,
  Group 10 northeast at about 43). An unknown group gets a neutral heading (east from Florida, south from California), never
  northeast, marked `azq: "guess"`, and the page and launch pages say the direction is an estimate. The midnight southeast Starlink
  from 33196 now says east northeast, 27 degrees up, over two minutes (`tests/review.test.mjs`, `tests/test_starlink_shells.py`,
  Worker parity cases).

**H2. "First visible at" is only as good as the liftoff time, and the Starship test does not check it against the sighting.**
- Where: `tests/field_miami.test.mjs:55-65`; the time comes from `L.utc` in `src/model.js:125`.
- Why: Flight 15 lifted off at 22:47:36; the site was counting from the planned 22:45:00, 156 seconds earlier. That slip alone is
  the "about 2 minutes off". The test asserts that the new estimate differs from the old one by about 130 seconds. That is
  circular: no observed clock time is recorded, so the retimed profile is unverified.
- Failure example: any launch that slips a few minutes after the page was built shows a first visible clock time that is early by
  the slip. On main the page's copy can be hours old (no feed Worker; PR #60 adds a direct refresh).
- Fix: record the actual time she first saw it and assert against that. On the page, give the time as "about N minutes after
  liftoff" beside the clock time, and say so when the liftoff time is older than a few minutes.
- **Fixed** (reviewfixes): the Starship test now runs from the real liftoff (22:47:36) and asserts the first visible time is within a
  minute of the sighting (about 22:53:22) and that the view lasts past engine cutoff; the old estimate against estimate check is gone.
  The countdown, Look Up and the sim follow the real liftoff time: the page asks Launch Library directly every 5 minutes in the hour
  around a liftoff, a move later shows a toast, and the page, the rating and the launch page say "Liftoff was 2 min 36 s late"
  (`changes.json`, `late_by`/`loadChanges`).

**H3. A Radar session is a full Astro session, kept in localStorage.**
- Where: `src/account.js:29-35` (`persistSession: true`, `storageKey: 'radar.auth'`).
- Why: the token is the same one the Astro app holds. Astro's row level security lets it read the profiles of the user's friends
  and group members, including the payment handles (zelle, venmo, paypal, cashapp, apple_cash), and edit the user's own profile.
  Radar needs only a name and a planet. Any script injection on astroradar.io, or a bad deploy, would hand over the Astro account.
  The content security policy is strict and well built, but it is a meta tag on a static host and the only barrier.
- Failure example: a future third party script or an XSS in a launch name rendering reads `radar.auth` and uses the refresh token
  from anywhere, for as long as the session lasts (by default, until sign out).
- Fix: before switching on, set a session time limit and an inactivity timeout in Supabase (the setup doc lists this as
  optional; make it required), keep the rule of no third party scripts, and consider `persistSession: false` so the session ends
  with the tab.
- **Fixed** (reviewfixes), sign in still off: docs/SIGNIN-SETUP.md step 4 is now required before the switch: a 7 day session time
  box and a 1 day inactivity timeout in Supabase, leaked password protection, Confirm email on, and Astro revoking TRUNCATE. The sign
  in page says in one line what Radar can see and that the session is the Astro session. `persistSession` stays on, so a sign in
  survives a reload; the time limit bounds it.

### Medium

**M1. A hard cut at sunset: one minute decides between Unlikely and Yes.**
- Where: `src/model.js:123` (`DAYS=0`), `:130-131`.
- Why: with the sun above 0 degrees the cap is 200 km; below it, a sunlit plume counts to 950 km. A sky two minutes after sunset
  is still bright. The sun's geometric centre is used, so "twilight" starts while the sun's disc is still visible (true sunset is
  at -0.83 degrees).
- Failure example (my run, Miami, 18 November): liftoff 5:25 pm, sun +0.6: Yes, from T+186 s, at 487 km. Liftoff at 6:45 am,
  sun -0.1 and rising: Unlikely. This is the opposite of the model's own rule that a false Yes is worse than a false Low view.
- Fix: ramp the sunlit cap from 200 km at 0 degrees to 950 km at about -4, or cap the verdict at Maybe until the sun is 2 degrees
  down.
- **Fixed** (reviewfixes): a smooth change from 6 degrees below to 2 above the horizon (`litCap`: the sunlit reach falls evenly in
  magnitudes from 950 km to 200 km, as the zenith brightens about 1 magnitude a degree in civil twilight), a sunlit plume under a sky
  with the sun up is rated as a daytime view, and Look Up gives no plain Yes with the sun less than 2 degrees down. The sunset example
  is now Likely at most.

**M2. Starship's track stops at engine cutoff, just as it is best placed from Miami.**
- Where: `src/model.js:21` (profile ends T+489), `:98` (`track`).
- Why: at the last sample the ship is 344 km from Miami, 30 degrees up in the south southwest, and still approaching the point
  abeam. The "best" moment is the final sample, which is the sign of a cut off track. At twilight the ship stays sunlit and
  visible after cutoff.
- Failure example: the page says the view ends at T+8:09 and gives the best direction at that instant; the ship is seen for
  minutes more, moving southeast.
- Fix: continue the track for two or three minutes of coast at the final speed and height, counted only while sunlit.
- **Fixed** (reviewfixes): the track continues past cutoff (`COAST`: Starship 150 s, Falcon 9 and Falcon Heavy upper stages 120 s)
  at the last speed and height, seen only while sunlit, at 0.6 of the sunlit reach.

**M3. At night the upper stage is dropped at 250 km, so the Miami window is under a minute.**
- Where: `src/model.js:118` (`nightUpper:250`).
- Why: for a northeast night launch Miami is 395 km away at staging, so the view is T+102 to T+154 s only: Likely, 52 seconds.
  George sees these every time, and the guide the test itself cites says one to three minutes.
- Fix: raise `nightUpper` toward 400 km for Falcon 9 class rockets on the strength of the Miami reports. The level can stay
  Likely; the window should be longer.
- **Fixed** (reviewfixes): `nightUpper` is 400 km. For this northeast case the stage is past 400 km within a minute of staging, so
  the view is still about 54 seconds; the geometry, not the cap, is what limits it now. A longer reach waits for a documented
  sighting (docs/VISIBILITY.md).

**M4. A launch with no confirmed time still gets a confident verdict.**
- Where: `src/lookup.js`, `launch_pages.py` (`lookup_card`): I found no handling of a time to be confirmed.
- Why: the sun decides almost everything, and it is computed from a placeholder time.
- Failure example: a "Time TBC" launch listed at 00:00 UTC shows Yes or Unlikely, which flips when the real time is set.
- Fix: for `st: tbd` (or a time precision coarser than a minute), say the verdict waits for a confirmed time.
- **Fixed** (reviewfixes): a time to be confirmed is never more than Maybe, marked "Time not confirmed, so this is a rough guess",
  on the page, in Look Up and on the launch page.

**M5. Other heading guesses are rough.**
- Where: `scripts/fetch_launches.py:79` and `:85`.
- Why: every Vandenberg Starlink gets 70 degrees (heading 155); most shells from there are 53 degrees (about 133) or polar. An
  orbit outside the list (MEO, such as O3b mPower, which flies due east) falls to 51.6 degrees, northeast.
- Fix: the same table as H1; treat MEO like GTO (due east) from low latitude pads.
- **Fixed** (reviewfixes): the Vandenberg shells are in the table (53 degrees about 133, 70 about 155, polar about 189); MEO flies
  due east.

**M6. The Privacy page says something the database does not do.**
- Where: `info_pages.py:73`: "Astro's database lets a signed in person read only their own profile."
- Why: the live policy on `profiles` is "see yourself and people in your groups" and friends. Radar's code asks only for the
  user's own row, but the sentence is about the database.
- Fix: "Astro Radar reads only your own profile: your name, planet, colour and whether you confirmed your age." Also say plainly
  that the saved session is your Astro session.
- **Fixed** (reviewfixes): the Privacy page now says exactly what the session can read (your profile, and your friends' and group
  members' profiles with the payment names they share), how long it lasts, and that sign in is switched off for now.

**M7. Radar asks for the Astro password on a second domain.**
- Where: `signin_page.py:47-50`, `src/signin.js:115`.
- Why: the password goes straight to Supabase and Radar never stores it, which is right. But it teaches people to type their
  Astro password on a site that is not Astro, which is what a phishing page asks for.
- Fix: consider Google only on Radar, or a hand off to astrosocial.io for the password. If kept, turn on leaked password
  protection as the setup doc says.
- **Left for George** (reviewfixes): a decision note is in docs/SIGNIN-SETUP.md step 4 (Google only, or both once leaked password
  protection is on); leaked password protection is now a required step.

### Low

- **`maxEl` is broken and unused** (`src/model.js:159`): it compares against `RANGE.dark`, which does not exist, so it always
  returns -90. Delete it.
  **Fixed**: deleted.
- **The Miami field test cannot catch H1**: every Florida entry in `tests/field/miami_launches.json` carries the feed's own
  guess (45 degrees). Store the real headings.
  **Fixed**: O3b mPower now flies due east (90). The other Florida entries are not Starlink: Crew, CRS (51.6 degrees) and Amazon
  Leo (51.9) do fly northeast, so their 45 stays; H1 is covered by the new shell tests instead.
- **The sign in form has no `method`** (`signin_page.py:47`): if the submit handler were ever missing, the browser would put
  the email and password in the address. The form is hidden until the script runs, so this is belt and braces: add
  `method="post"`.
  **Fixed**: added.
- **A meta tag policy cannot forbid framing** and sets no referrer policy. The one time code is removed from the address before
  anything else loads, so the exposure is small. Add `<meta name="referrer" content="no-referrer">` on `/signin/`.
  **Fixed**: added.
- **Google sign in links to an Astro account by matching email.** That is safe only while Astro requires a confirmed email;
  check that "Confirm email" is on.
  **Fixed** as a required setup step (SIGNIN-SETUP.md step 4).
- **Astro's own grants** (not Radar's): `anon` and `authenticated` hold DELETE and TRUNCATE on `profiles`. Row level security
  does not cover TRUNCATE. The REST API does not expose it, but revoke it.
  **Listed** for Astro in SIGNIN-SETUP.md step 4; not Radar's to change.

## Solid, no change needed

**The model**
- Sun position and elevation: local noon at the June solstice gives 87.7 degrees (expected 87.8); Miami sunrise on 18 November
  comes out 11:41:39 UTC with the sun at 111 degrees, both right.
- Azimuth convention (clockwise from north), the look angle through Earth centred coordinates, and Earth's curvature: Miami to
  the pad is 323 km at 358 degrees. Degrees and radians are handled consistently, and distances are km throughout.
- The Earth's shadow height (35.1 km with the sun 6 degrees down) and the rule that the rocket's light uses the sun at the spot
  below the rocket, at that second.
- Everything is computed in UTC, so time zones cannot shift the sun. Polar and southbound paths work (a polar launch from the
  Cape passes 63 degrees up from Miami, as it should).
- Midday Cape launches from Miami: Unlikely, with the reason "Daylight", never "too far". No "too far" wording exists on main.
- Twilight and pre dawn Cape launches from Miami: Yes, which matches George. The tests encode the daylight and twilight cases
  correctly.
- The profiles are monotonic and end near orbital speed. Sound delay (distance at 343 m/s, only within 60 km) is sound.

**Sign in**
- Off means off: no page, no script, no new origin.
- The build refuses a secret key and any URL that is not the project's.
- PKCE is on, only `/signin/` exchanges a code, and the code is stripped from the address first. A code planted by an attacker
  fails without the victim's verifier.
- The return path (`safeNext`) accepts only a path on this site; I could not get it to leave the site.
- Every message from the auth server is mapped to fixed text and written with `textContent`. There is no `innerHTML` in either
  file.
- The sign in page's policy allows no inline script or style and one outside origin.
- Sign out revokes the session and removes every key, even when the server cannot be reached.
- The setup doc asks for one exact redirect address, no wildcard.
- The publishable key exposes nothing the Astro app does not already expose.
- The 18 and over rule holds today: I confirmed the live trigger `handle_new_user` is enabled and refuses a new user without
  the age confirmation, so Google sign in on Radar cannot create an Astro account. Row level security is on for `profiles`.

## Top 3 to do first

1. **Fix the heading guess (H1, M5)** with a table of Starlink shells, in both feed files, and test it with real headings.
2. **Before sign in is switched on (H3, M6):** set a session time limit and inactivity timeout in Supabase, and correct the
   Privacy page.
3. **Soften the sunset cut and stop cutting views short (M1, M2, M3),** and record the real Starship sighting time so the test
   checks the clock, not the old estimate (H2).
