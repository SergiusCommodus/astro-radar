// Field reports from Miami (ZIP 33196, about 200 mi south of Cape Canaveral), November 2026, against the Look Up verdict (ORB.lookUp on
// ORB.visibility). The launches are real, with their real liftoff times (tests/field/miami_launches.json, from Launch Library 2).
//  - George saw every SpaceX launch from the Cape and Kennedy in the last two months from Miami, mostly the twilight morning ones around
//    6 to 6:30 AM, plus night launches, on video: a twilight one (a long bright trail, then the glowing engine and plume) and one before
//    dawn (a full jellyfish plume with stage separation). Night and twilight Cape launches must be Yes or Likely.
//  - Daytime launches 200 mi away are above the horizon; the limit is daylight, never distance: Unlikely, with the daylight reason and a tip.
//  - Starship Flight 15 (Starlink 31-2, Nov 13 2026) was seen from Miami at twilight, over 1,000 mi from Starbase. Real liftoff
//    22:47:36 UTC; the site showed the time planned before, 22:45:00. The profile follows Flight 15's published timeline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url), ORB = req('../src/model.js'), F = req('./field/miami_launches.json').launches;
const MIAMI = { lat: 25.66, lon: -80.44 }; // ZIP 33196 in the site's own table
function at(mis) {
  const f = F.find((x) => x.mis.startsWith(mis)); assert.ok(f, mis);
  ORB.SITES[f.site] = { lat: f.pad.lat, lon: f.pad.lon };
  const L = { id: f.id, v: f.v, az: f.az, utc: f.utc, site: f.site }, v = ORB.visibility(L, ORB.track(L, 2), MIAMI.lat, MIAMI.lon);
  return { f, v, r: ORB.lookUp(v, null, ORB.dist(MIAMI.lat, MIAMI.lon, f.pad.lat, f.pad.lon)) };
}
const sunAt = (f) => ORB.sunEl(MIAMI.lat, MIAMI.lon, new Date(f.utc));

const NIGHT_OR_TWILIGHT = [
  ['Dragon CRS-2 SpX-35', 'Oct 13, 6:33 AM EDT, before dawn: the sky is dark and the plume sunlit (the jellyfish)'],
  ['Bandwagon 5', 'Oct 20, 7:04 AM EDT, twilight: the long trail, then the glowing plume'],
  ['NROL-97', 'Oct 2, 11:54 PM EDT, night: Falcon Heavy, the engine flame'],
];
for (const [mis, why] of NIGHT_OR_TWILIGHT) {
  test('Miami sees ' + mis + ' (' + why + '): Yes or Likely', () => {
    const { f, r } = at(mis);
    assert.ok(sunAt(f) < 0, 'it is before sunrise or after sunset in Miami');
    assert.ok(r.level === 'Yes' || r.level === 'Likely', mis + ': ' + r.level + ' / ' + r.reason);
  });
}

for (const mis of ['Crew-13', 'O3b mPower 11-13', 'Amazon Leo (LV-01)']) {
  test('a daytime launch from Florida (' + mis + ') is Unlikely because of daylight, with a tip, not too far', () => {
    const { f, r } = at(mis);
    assert.ok(sunAt(f) > 20, 'midday sun in Miami');
    assert.equal(r.level, 'Unlikely');
    assert.equal(r.limit, 'daylight');
    assert.match(r.reason, /^Daylight/);
    assert.match(r.tip, /look low toward the north/);
    assert.doesNotMatch(r.reason + r.tip, /too far|never|can.t be seen/i);
  });
}

test('every SpaceX launch from Florida in the last two months is sorted by light at 33196', () => {
  const fl = F.filter((x) => x.prov === 'spacex' && x.pad.st === 'FL' && x.utc >= '2026-09-14');
  const sorted = fl.map((f) => { const s = sunAt(f), { v } = at(f.mis); return [f.mis, s > 0 ? 'day' : v.best && v.best.lit ? 'twilight, rocket in sunlight' : 'night']; });
  assert.deepEqual(Object.fromEntries(sorted), {
    'Bandwagon 5 (Dedicated Mid-Inclination Rideshare)': 'twilight, rocket in sunlight', 'Dragon CRS-2 SpX-35': 'twilight, rocket in sunlight',
    'NROL-97': 'night', 'Crew-13': 'day' });
});

test('Starship Flight 15 from Miami: Yes, first seen in the west about T+5:56 (22:53:32 UTC)', () => {
  const { f, v, r } = at('Starlink Group 31-2');
  assert.equal(f.utc, '2026-11-13T22:47:36Z', 'the real liftoff');
  assert.equal(r.level, 'Yes');
  assert.ok(v.first >= 336 && v.first <= 376, 'first visible T+' + v.first + ' s');
  assert.ok(v.firstS.az > 255 && v.firstS.az < 280, 'first seen in the west: ' + v.firstS.az);
  // the site's earlier estimate counted from the planned 22:45:00 with the slower profile (first visible T+382 s): 22:51:22 UTC,
  // about 2 minutes before this one; the report said the sighting was about 2 minutes off from the site's time
  const now = Date.parse(f.utc) + v.first * 1000, before = Date.parse('2026-11-13T22:45:00Z') + 382 * 1000;
  assert.ok(Math.abs((now - before) / 1000 - 130) <= 20, 'the gap to the earlier estimate: ' + (now - before) / 1000 + ' s');
});

test('no reason says never or too far unless the rocket stays below the horizon', () => {
  for (const f of F) {
    const { r } = at(f.mis);
    if (r.level !== 'Below horizon') assert.doesNotMatch(r.reason + (r.tip || ''), /never|too far|can.t be seen|cannot be seen/i, f.mis + ': ' + r.reason);
  }
});
