// The fixes for docs/REVIEW-FABLE.md in the visibility model: node --test tests/review.test.mjs
//   H1  a Starlink group on the 43 degree shell flies southeast from the Cape: from Miami (33196) at midnight, look east northeast, high,
//       for over two minutes (with the old northeast guess it was north, 8 degrees up, under a minute)
//   M1  the sky brightens smoothly around sunset and sunrise: no plain Yes with the sun less than 2 degrees down, a sunlit plume's reach
//       shrinks smoothly from 950 km (sun 6 degrees down) to 200 km (2 degrees up), and a sunset launch is not a Yes because the sun is set
//   M2  Starship and Falcon 9 upper stages keep being seen while they coast in sunlight after engine cutoff, and never in the shade
//   M3  at night the upper stage's flame counts to 400 km (was 250); a northeast launch is still in view about a minute, since the stage is
//       past 400 km from Miami within a minute of staging (a longer reach needs a documented sighting)
//   M4  a time to be confirmed is never more than Maybe, and says so
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url), ORB = req('../src/model.js');
const MIAMI = { lat: 25.66, lon: -80.44 };
function at(L, o = MIAMI) {
  const v = ORB.visibility(L, ORB.track(L, 2), o.lat, o.lon), pad = ORB.SITES[L.site];
  return { v, r: ORB.lookUp(v, null, ORB.dist(o.lat, o.lon, pad.lat, pad.lon)) };
}
// the headings the feed now gives (scripts/fetch_launches.py starlink_heading, tests/test_starlink_shells.py)
const SE = 123.6, NE = 43.1;

test('H1: a southeast Starlink at midnight from the Cape, seen from 33196: look east northeast, high, for over two minutes', () => {
  const { v, r } = at({ v: 'F9', az: SE, utc: '2026-11-18T05:00:00Z', site: 'SLC40' });
  assert.equal(r.level, 'Yes');
  assert.ok(['ENE', 'NE', 'E'].includes(r.dir), 'look ' + r.dir + ' (' + r.az + ' degrees)');
  assert.ok(r.el >= 20, 'about ' + r.el + ' degrees up');
  assert.ok(v.visSec >= 120, 'in view ' + v.visSec + ' s');
  // the northeast shell is a different sky: north and low
  const ne = at({ v: 'F9', az: NE, utc: '2026-11-18T05:00:00Z', site: 'SLC40' });
  assert.ok(ne.r.el < 12 && ['N', 'NNE', 'NNW'].includes(ne.r.dir), 'northeast shell: ' + ne.r.dir + ', ' + ne.r.el + ' degrees');
});

test('M1: the reach of a sunlit plume shrinks smoothly from 950 km to 200 km between 6 degrees down and 2 up', () => {
  assert.equal(Math.round(ORB.litCap(-6)), 950);
  assert.equal(Math.round(ORB.litCap(2)), 200);
  let prev = Infinity;
  for (let s = -8; s <= 4; s += 0.25) { const c = ORB.litCap(s); assert.ok(c <= prev + 1e-9, 'never larger as the sun rises: ' + s); prev = c; }
  // no step anywhere: a quarter degree never changes the reach by more than 10 percent
  for (let s = -6; s < 2; s += 0.25) assert.ok(ORB.litCap(s) / ORB.litCap(s + 0.25) < 1.1, 'smooth at ' + s);
});

test('M1: a Cape launch at sunset from Miami is not a Yes while the sky is still bright, and is one in deep twilight', () => {
  const sunset = at({ v: 'F9', az: NE, utc: '2026-11-18T22:25:00Z', site: 'SLC40' });  // the sun about half a degree up in Miami
  assert.ok(sunset.v.sunObs > 0, 'the sun is up at liftoff: ' + sunset.v.sunObs);
  assert.notEqual(sunset.r.level, 'Yes', 'sunset: ' + sunset.r.level + ' / ' + sunset.r.reason);
  const dusk = at({ v: 'F9', az: SE, utc: '2026-11-18T23:05:00Z', site: 'SLC40' });   // the sun about 7 degrees down
  assert.equal(dusk.r.level, 'Yes', 'dusk: ' + dusk.r.reason);
  // and a bright sky never reads as too far
  for (const x of [sunset, dusk]) assert.doesNotMatch(x.r.reason, /too far/i);
});

test('M1: with the sun less than 2 degrees down at the best moment, at most Likely, and the reason says the sky is still bright', () => {
  for (let m = 0; m <= 40; m += 2) {
    const utc = new Date(Date.parse('2026-11-18T22:20:00Z') + m * 60000).toISOString().replace('.000', '');
    const { r } = at({ v: 'F9', az: SE, utc, site: 'SLC40' });
    if (r.best && r.best.sun > -2 && r.best.sky !== 'day') {
      assert.notEqual(r.level, 'Yes', utc);
      if (r.level === 'Likely') assert.match(r.reason, /still bright/);
    }
  }
});

test('M2: the coast after engine cutoff is in the track for Starship and Falcon, seen only while sunlit', () => {
  for (const k of ['SS', 'F9', 'FH']) {
    const L = { v: k, az: 90, utc: '2026-11-13T22:47:36Z', site: k === 'SS' ? 'STARBASE' : 'SLC40' }, trk = ORB.track(L, 2), end = ORB.PROF[k][ORB.PROF[k].length - 1][0];
    assert.ok(trk[trk.length - 1].t >= end + ORB.COAST[k] - 2, k + ' coasts ' + ORB.COAST[k] + ' s');
    assert.ok(trk.filter((p) => p.coast).every((p) => p.t > end), k + ': the coast comes after cutoff');
  }
  // midnight, nothing sunlit: the coast adds nothing to the view
  const { v } = at({ v: 'F9', az: SE, utc: '2026-11-18T05:00:00Z', site: 'SLC40' });
  assert.ok(v.samples.filter((s) => s.t > 540).every((s) => !s.vis), 'no coasting stage seen in the shade');
});

test('M3: a northeast Falcon 9 at night from Miami: the upper stage counts to 400 km; the stage passes 400 km within a minute, so about a minute in view', () => {
  const { v, r } = at({ v: 'F9', az: NE, utc: '2026-11-18T05:00:00Z', site: 'SLC40' });
  assert.ok(v.visSec >= 50, 'in view ' + v.visSec + ' s');
  assert.ok(r.level === 'Yes' || r.level === 'Likely', r.level);
  assert.equal(ORB.RANGE.nightUpper, 400);
});

test('M4: a launch time to be confirmed is never more than Maybe, and the reason says the time is not confirmed', () => {
  for (const utc of ['2026-11-18T05:00:00Z', '2026-11-18T10:50:00Z', '2026-11-18T17:00:00Z']) {
    const { r } = at({ v: 'F9', az: SE, utc, site: 'SLC40', st: 'tbd' });
    assert.ok(ORB.LEVELS.indexOf(r.level) <= 2, utc + ': ' + r.level);
    assert.equal(r.tbc, true);
    assert.match(r.reason, /^Time not confirmed/);
  }
  const confirmed = at({ v: 'F9', az: SE, utc: '2026-11-18T05:00:00Z', site: 'SLC40', st: 'go' });
  assert.equal(confirmed.r.level, 'Yes');
  assert.ok(!confirmed.r.tbc);
});

test('the slip moves the view: first visible follows the liftoff time the feed has, second for second', () => {
  const a = at({ v: 'SS', az: 97, utc: '2026-11-13T22:45:00Z', site: 'STARBASE' }), b = at({ v: 'SS', az: 97, utc: '2026-11-13T22:47:36Z', site: 'STARBASE' });
  const fa = Date.parse('2026-11-13T22:45:00Z') + a.v.first * 1000, fb = Date.parse('2026-11-13T22:47:36Z') + b.v.first * 1000;
  assert.ok(Math.abs((fb - fa) / 1000 - 156) <= 40, 'first visible moved ' + (fb - fa) / 1000 + ' s with a 156 s slip');
});
