// Visibility model tests: node --test tests/visibility.test.mjs
// 1. The physics the model rests on, checked against independent formulas and known facts.
// 2. Documented launches and who could (or could not) see them, with the source of each. Each case says how strong the evidence is:
//    sighting  = people reported seeing it from there
//    guide     = a viewing guide states it
//    forecast  = an official visibility map or forecast (not proof anyone saw it)
//    cautious  = no source found; the model must not claim a good view (a false "Excellent view" is worse than a false "Low view")
//    Hard checks: sightings must come out visible and must never be rated better than their distance allows; "not visible" guide cases must be
//    not visible; near viewers get Excellent or Great. Forecast cases are printed as a comparison and may be more cautious than the map.
// 3. Invariants over thousands of observer and time combinations: whatever the inputs, the rating can never be higher than distance, daylight and
//    duration allow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const ORB = createRequire(import.meta.url)('../src/model.js');
const D = Math.PI / 180, R = 6371;

ORB.SITES.LC39B = { n: 'LC 39B', full: 'Launch Complex 39B, Kennedy Space Center, Florida', lat: 28.6272, lon: -80.6208, st: 'FL' };

// ---------------------------------------------------------------- 1. physics
test('Earth shadow height: a satellite at 400 km stays lit until the sun is about 20.2 degrees down (the ISS orbit fact), and the height formula holds', () => {
  assert.ok(Math.abs(ORB.shadowFromEl(-Math.acos(R / (R + 400)) / D) - 400) < 0.5);
  assert.equal(ORB.shadowFromEl(0), 0);
  assert.equal(ORB.shadowFromEl(12), 0); // sun up: no shadow below
  const want = { 6: 35.1, 12: 142.3, 18: 327.8 };
  for (const [d, h] of Object.entries(want)) assert.ok(Math.abs(ORB.shadowFromEl(-d) - h) < 0.3, `shadow at ${d} degrees down`);
});

test('horizon: elevation of a target at a given altitude and distance matches the exact geometry (Earth curvature included)', () => {
  for (const [dkm, h] of [[300, 11], [300, 66], [600, 100], [1000, 100], [1000, 200], [800, 5], [150, 3]]) {
    const th = dkm / R, el = Math.atan2((R + h) * Math.cos(th) - R, (R + h) * Math.sin(th)) / D;
    const lk = ORB.look(0, 0, 0, th / D, h);
    assert.ok(Math.abs(lk.el - el) < 0.02, `${h} km up at ${dkm} km: ${lk.el.toFixed(2)} vs ${el.toFixed(2)}`);
  }
  // 100 km up at 1,000 km is only a few degrees above the horizon; 11 km up at 300 km is hidden below it
  assert.ok(ORB.look(0, 0, 0, 1000 / R / D, 100).el < 8);
  assert.ok(ORB.look(0, 0, 0, 300 / R / D, 5).el < 0);
});

// the NOAA solar calculator equations, written out again here as the independent check
function noaaSunEl(lat, lon, ms) {
  const jd = ms / 86400000 + 2440587.5, T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360, M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const C = Math.sin(M * D) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(2 * M * D) * (0.019993 - 0.000101 * T) + Math.sin(3 * M * D) * 0.000289;
  const trueLong = L0 + C, om = 125.04 - 1934.136 * T, app = trueLong - 0.00569 - 0.00478 * Math.sin(om * D);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60, eps = eps0 + 0.00256 * Math.cos(om * D);
  const dec = Math.asin(Math.sin(eps * D) * Math.sin(app * D)) / D;
  const y = Math.tan(eps * D / 2) ** 2, e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const eqt = 4 * (y * Math.sin(2 * L0 * D) - 2 * e * Math.sin(M * D) + 4 * e * y * Math.sin(M * D) * Math.cos(2 * L0 * D) - 0.5 * y * y * Math.sin(4 * L0 * D) - 1.25 * e * e * Math.sin(2 * M * D)) / D;
  const utcMin = ((ms / 60000) % 1440 + 1440) % 1440, tst = (utcMin + eqt + 4 * lon + 1440 * 4) % 1440;
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  return Math.asin(Math.sin(lat * D) * Math.sin(dec * D) + Math.cos(lat * D) * Math.cos(dec * D) * Math.cos(ha * D)) / D;
}
test('sun elevation agrees with the NOAA equations to 0.2 degrees, at the sites and times that matter', () => {
  const pts = [[28.56, -80.58, '2023-01-15T22:56:00Z'], [28.56, -80.58, '2022-11-16T06:47:44Z'], [34.63, -120.61, '2022-10-28T01:14:10Z'], [33.45, -112.07, '2025-06-17T03:30:00Z'],
    [25.76, -80.19, '2015-09-02T10:18:00Z'], [37.83, -75.49, '2014-07-13T16:52:00Z'], [0, 0, '2026-03-20T12:00:00Z'], [60, 10, '2026-12-21T09:00:00Z'], [-33.9, 151.2, '2026-06-21T20:00:00Z']];
  for (const [la, lo, iso] of pts) {
    const ms = Date.parse(iso), a = ORB.sunEl(la, lo, new Date(ms)), b = noaaSunEl(la, lo, ms);
    assert.ok(Math.abs(a - b) < 0.2, `${la},${lo} ${iso}: model ${a.toFixed(2)} vs NOAA ${b.toFixed(2)}`);
  }
});

test('the flight profiles are consistent: time, altitude and downrange only grow (except a hop coming back down), and the path length matches the speed column', () => {
  for (const [k, prof] of Object.entries(ORB.PROF)) {
    if (k === 'SUB') continue;
    let worst = 0;
    for (let i = 1; i < prof.length; i++) {
      const [t0, h0, d0, v0] = prof[i - 1], [t1, h1, d1, v1] = prof[i];
      assert.ok(t1 > t0, `${k}: time rises`);
      assert.ok(d1 >= d0, `${k}: downrange never shrinks`);
      if (k !== 'NS') assert.ok(h1 >= h0 - 1e-9, `${k}: altitude rises on the way up`);
      const len = Math.hypot(d1 - d0, h1 - h0), spd = (v0 + v1) / 2 / 3600 * (t1 - t0);
      if (len > 3 && spd > 3 && k !== 'NS') worst = Math.max(worst, Math.abs(len / spd - 1));
    }
    assert.ok(worst < 0.45, `${k}: path length vs speed differs by ${(worst * 100).toFixed(0)}% in some segment`);
  }
  // Falcon 9 against the public timelines (Spaceflight Now, Starlink launches: max Q T+1:12 to 1:14, MECO T+2:32 to 2:33)
  const f9 = (t) => ORB.interp(ORB.PROF.F9, t);
  assert.ok(f9(152)[0] > 60 && f9(152)[0] < 75, 'F9 altitude at MECO about 65 to 70 km');
  assert.ok(f9(152)[2] > 7000 && f9(152)[2] < 8800, 'F9 speed at MECO about 8,000 km/h');
  assert.ok(f9(540)[0] > 190 && f9(540)[0] < 290 && f9(540)[1] > 1400 && f9(540)[1] < 2200, 'F9 at SECO about 200 to 280 km up and 1,400 to 2,200 km downrange');
});

// ---------------------------------------------------------------- 2. documented launches
const P = {
  orlando: ['Orlando', 28.5383, -81.3792], titusville: ['Titusville', 28.6122, -80.8076], cocoa: ['Cocoa Beach', 28.32, -80.6076], miami: ['Miami', 25.7617, -80.1918],
  lauderdale: ['Fort Lauderdale', 26.1224, -80.1373], wpb: ['West Palm Beach', 26.7153, -80.0534], jaxbeach: ['Jacksonville Beach', 30.2947, -81.3931], tampa: ['Tampa', 27.9506, -82.4572],
  savannah: ['Savannah GA', 32.0809, -81.0912], sunsetbeach: ['Sunset Beach NC', 33.8624, -78.5069], hatteras: ['Cape Hatteras NC', 35.2232, -75.6346], atlanta: ['Atlanta', 33.749, -84.388],
  lompoc: ['Lompoc', 34.6391, -120.4579], la: ['Los Angeles', 34.0522, -118.2437], phoenix: ['Phoenix', 33.4484, -112.074], vegas: ['Las Vegas', 36.1699, -115.1398], sf: ['San Francisco', 37.7749, -122.4194],
  mesa: ['Mesa AZ', 33.4152, -111.8315], peoria: ['Peoria AZ', 33.5806, -112.2374], sacramento: ['Sacramento', 38.5816, -121.4944], hawthorne: ['Hawthorne', 33.9164, -118.3526],
  dc: ['Washington DC', 38.9072, -77.0369], nyc: ['New York City', 40.7128, -74.006], boston: ['Boston', 42.3601, -71.0589], raleigh: ['Raleigh NC', 35.7796, -78.6382],
};
const SRC = {
  jelly: 'https://en.wikipedia.org/wiki/Space_jellyfish',
  wkmg: 'https://gmg-wkmg-prod.cdn.arcpublishing.com/news/local/2023/01/16/viewers-share-their-spacex-falcon-heavy-launch-photos (WKMG, Jan 16 2023: photos from Orlando, Flagler Beach, Sunset Beach, Oak Island and Hatteras NC, "as far away as North Carolina")',
  artemis: 'https://www.space.com/artemis-1-moon-rocket-night-launch-visibility-map/ (NASA visibility map: as far north as Savannah GA, about 300 miles; Miami expected; plume visible for up to 70 seconds)',
  muos: 'https://astronomynow.com/2015/09/03/atlas-rocket-puts-on-a-spectacular-pre-dawn-sky-show/ (plume visible as far away as Miami); liftoff 10:18 UTC: https://spaceflight101.com/?p=1492',
  fox: 'https://foxweather.com/earth-space/california-spacex-rocket (Oct 27 2022 Vandenberg launch after sunset seen in Los Angeles, Phoenix and outside Las Vegas); liftoff 01:14:10 UTC Oct 28: https://outrocket.com/launch/spacex-falcon-9-0184',
  azfamily: 'https://www.azfamily.com/2025/06/17/spacex-rocket-illuminates-sky-with-comet-like-trail-across-arizona/ (June 16 2025, just after 8:30 pm, seen across Arizona; NWS Phoenix: pad just under 500 miles from downtown)',
  miami: 'https://spacenexus.us/guide/watch-a-launch/miami (Miami is about 195 miles from SLC 40: daytime launches usually invisible; at night a rising point of light for one to three minutes; liftoff not seen)',
  broward: 'https://www.browardpalmbeach.com/?p=40612906 (South Floridians, Fort Lauderdale to Boynton Beach, do not see liftoff but see the rocket as it travels southeast)',
  ftoday: 'https://www.yahoo.com/news/does-liftoff-cape-canaveral-vandenberg-130154621.html (Florida Today: sometimes visible from Jacksonville Beach in the north to West Palm Beach in the south)',
  fcn: 'https://firstcoastnews.com/article/tech/science/aerospace/spacex-falcon-9-launch-caputured-by-cameras-across-first-coast-weather-watchers-vilano-beach/77-e4ac029f-db21-45b7-b72e-20fea2413271 (Falcon 9 night launch photographed from Ponte Vedra Beach and Fleming Island)',
  vulcan: 'https://www.yahoo.com/news/articles/launch-ula-vulcan-rocket-may-221826974.html (Feb 12 2026, 3:30 am, ULA map: Tampa at +150 s, Jacksonville, West Palm Beach, most of Florida)',
  antares: 'https://science.nasa.gov/earth/earth-observatory/launching-from-wallops-island-84008/ (Antares, July 13 2014, 12:52 pm EDT: Washington DC after 90 s, Philadelphia 120 s, New York 150 s, Boston 210 s, weather permitting)',
  newglenn: 'https://www.yahoo.com/news/articles/nasa-blue-origin-rocket-launch-004006746.html (NG-2 afternoon window; Blue Origin graphic: Orlando, Georgia, the Carolinas to Raleigh)',
  noozhawk: 'https://www.noozhawk.com/ (Vandenberg viewing spots: Harris Grade Road, Lompoc, Vandenberg Village)',
  sfn17: 'https://spaceflightnow.com/2017/12/28/falcon-9-launch-lights-up-southern-california-sky/ (Spaceflight Now: Iridium 4, 5:27 pm PST Dec 22 2017 (01:27 UTC), seen across Southern California and in Arizona, photos from Hawthorne, Peoria, Mesa and Gila Bend)',
  saocom: 'https://spaceflightnow.com/2018/10/08/spacex-aces-first-rocket-landing-in-california-after-launching-argentine-satellite/ (Spaceflight Now: SAOCOM 1A, 7:21 pm PDT Oct 7 2018); https://kqed.org/news/11697426/definitely-not-aliens-spacex-launch-brings-dazzling-show-to-california-skies (seen from Los Angeles to Sacramento and the Bay Area); https://www.kold.com/2018/10/08/rocket-launch-flashes-across-arizona-sky/ (photo from Peoria AZ)',
  sandiego: 'https://www.nbclosangeles.com/news/california-news/photos-san-diego-residents-gaze-up-in-awe-as-spacex-rocket-dazzles-socal-sky/3366565 (Vandenberg dusk launches seen across San Diego County and into Tijuana and Ensenada)',
};
// kind: sighting | guide | forecast | cautious | near. expect: { visible, minScore, maxScore, note }
const CASES = [
  { id: 'Iridium 4 from Vandenberg, just after sunset, Dec 22 2017', utc: '2017-12-23T01:27:23Z', site: 'SLC4E', v: 'F9', az: 190, src: [SRC.sfn17], obs: [
    ['sighting', P.hawthorne, { visible: true, maxScore: 3 }], ['sighting', P.mesa, { visible: true, maxScore: 1 }], ['sighting', P.peoria, { visible: true, maxScore: 1 }]] },
  { id: 'SAOCOM 1A from Vandenberg, after sunset, Oct 7 2018', utc: '2018-10-08T02:21:00Z', site: 'SLC4E', v: 'F9', az: 195, src: [SRC.saocom], obs: [
    ['sighting', P.sf, { visible: true, maxScore: 2 }], ['sighting', P.sacramento, { visible: true, maxScore: 2 }], ['sighting', P.peoria, { visible: true, maxScore: 1 }]] },
  { id: 'FH USSF-67, sunset, Jan 15 2023', utc: '2023-01-15T22:56:00Z', site: 'LC39A', v: 'FH', az: 90, src: [SRC.wkmg], obs: [
    ['near', P.orlando, { visible: true, minScore: 3 }], ['sighting', P.sunsetbeach, { visible: true, maxScore: 1 }], ['sighting', P.hatteras, { visible: true, maxScore: 1 }]] },
  { id: 'Artemis I, 1:47 am, Nov 16 2022', utc: '2022-11-16T06:47:44Z', site: 'LC39B', v: 'GEN', az: 90, src: [SRC.artemis], obs: [
    ['near', P.cocoa, { visible: true, minScore: 4 }], ['forecast', P.miami, { maxScore: 2 }], ['forecast', P.savannah, { maxScore: 1 }]] },
  { id: 'Atlas V MUOS-4, pre dawn, Sep 2 2015', utc: '2015-09-02T10:18:00Z', site: 'SLC41', v: 'GEN', az: 90, src: [SRC.muos], obs: [
    ['sighting', P.miami, { visible: true, maxScore: 2 }]] },
  { id: 'Starlink 4-31 from Vandenberg, just after sunset, Oct 27 2022', utc: '2022-10-28T01:14:10Z', site: 'SLC4E', v: 'F9', az: 160, src: [SRC.fox, SRC.sandiego], obs: [
    ['sighting', P.la, { visible: true, maxScore: 3 }], ['sighting', P.vegas, { visible: true, maxScore: 2 }], ['sighting', P.phoenix, { visible: true, maxScore: 1 }]] },
  { id: 'Starlink from Vandenberg, 8:30 pm PDT, Jun 16 2025', utc: '2025-06-17T03:30:00Z', site: 'SLC4E', v: 'F9', az: 160, src: [SRC.azfamily], obs: [
    ['sighting', P.phoenix, { visible: true, maxScore: 1 }]] },
  { id: 'Falcon 9 from Cape Canaveral, midday', utc: '2025-06-16T17:00:00Z', site: 'SLC40', v: 'F9', az: 44, src: [SRC.miami], obs: [
    ['guide', P.miami, { visible: false }], ['near', P.cocoa, { visible: true, minScore: 2 }]] },
  { id: 'Falcon 9 from Cape Canaveral, 1 am', utc: '2025-06-16T05:00:00Z', site: 'SLC40', v: 'F9', az: 44, src: [SRC.miami, SRC.ftoday], obs: [
    ['guide', P.miami, { visible: true, maxScore: 1, secs: [40, 240] }], ['sighting', P.jaxbeach, { visible: true, maxScore: 3 }], ['near', P.titusville, { visible: true, minScore: 4 }],
    ['cautious', P.atlanta, { visible: false }]] },
  { id: 'Starlink to the southeast from Cape Canaveral, 1 am', utc: '2025-06-16T05:00:00Z', site: 'SLC40', v: 'F9', az: 125, src: [SRC.broward, SRC.ftoday], obs: [
    ['guide', P.lauderdale, { visible: true, maxScore: 3, liftoffHidden: true }], ['sighting', P.wpb, { visible: true, maxScore: 3 }]] },
  { id: 'Falcon 9 night launch seen from Jacksonville', utc: '2025-06-16T05:00:00Z', site: 'SLC40', v: 'F9', az: 90, src: [SRC.fcn], obs: [
    ['sighting', P.jaxbeach, { visible: true, maxScore: 3 }]] },
  { id: 'Vulcan, 3:30 am, Feb 12 2026', utc: '2026-02-12T08:30:00Z', site: 'SLC41', v: 'VUL', az: 90, src: [SRC.vulcan], obs: [
    ['forecast', P.tampa, { maxScore: 3 }], ['forecast', P.jaxbeach, { maxScore: 3 }], ['forecast', P.miami, { maxScore: 2 }]] },
  { id: 'Antares from Wallops, midday, Jul 13 2014', utc: '2014-07-13T16:52:00Z', site: 'WALLOPS', v: 'GEN', az: 52, src: [SRC.antares], obs: [
    ['forecast', P.dc, { maxScore: 1 }], ['forecast', P.nyc, { maxScore: 1 }], ['forecast', P.boston, { maxScore: 1 }]] },
  { id: 'New Glenn NG-2, afternoon, Nov 13 2025', utc: '2025-11-13T20:55:00Z', site: 'LC36', v: 'NG', az: 90, src: [SRC.newglenn], obs: [
    ['forecast', P.orlando, { maxScore: 3 }], ['forecast', P.savannah, { maxScore: 2 }], ['forecast', P.raleigh, { maxScore: 1 }]] },
  { id: 'Falcon 9 from Vandenberg, night', utc: '2025-03-05T09:30:00Z', site: 'SLC4E', v: 'F9', az: 175, src: [SRC.noozhawk], obs: [
    ['near', P.lompoc, { visible: true, minScore: 4 }], ['cautious', P.sf, { visible: false }]] },
  { id: 'Falcon 9 from Vandenberg, midday', utc: '2025-03-05T20:00:00Z', site: 'SLC4E', v: 'F9', az: 175, src: [SRC.noozhawk], obs: [
    ['cautious', P.la, { visible: false }], ['near', P.lompoc, { visible: true, minScore: 2 }]] },
];

const rows = [];
function run(c, o) {
  const L = { v: c.v, site: c.site, az: c.az, utc: c.utc }, trk = ORB.track(L, 2), vis = ORB.visibility(L, trk, o[1], o[2]);
  return { vis, km: ORB.dist(o[1], o[2], ORB.SITES[c.site].lat, ORB.SITES[c.site].lon) };
}
for (const c of CASES) {
  test(`documented: ${c.id}`, () => {
    for (const [kind, o, e] of c.obs) {
      const { vis, km } = run(c, o), b = vis.best, got = vis.score;
      const label = got ? ['', 'Low view', 'Good view', 'Great view', 'Excellent view'][got] : 'Not visible';
      let verdict = 'ok';
      const fails = [];
      if (e.visible === true && !b) fails.push('model says not visible, but it was seen');
      if (e.visible === false && b) fails.push('model says visible, but it should not be');
      if (e.minScore && got < e.minScore) fails.push(`rated ${got}, wanted at least ${e.minScore}`);
      if (e.maxScore != null && got > e.maxScore) fails.push(`rated ${got}, more than the evidence allows (${e.maxScore})`);
      if (e.secs && (vis.visSec < e.secs[0] || vis.visSec > e.secs[1])) fails.push(`visible ${vis.visSec} s, guide says ${e.secs[0]} to ${e.secs[1]} s`);
      if (e.liftoffHidden && vis.samples[0].vis) fails.push('liftoff is shown as visible');
      if (kind === 'forecast' && !b) verdict = 'MORE CAUTIOUS than the forecast map';
      if (fails.length) verdict = 'MISMATCH: ' + fails.join('; ');
      rows.push({ case: c.id, obs: o[0], kind, km: Math.round(km), model: label, range: b ? Math.round(b.range) : '', el: b ? Math.round(b.el) : '', how: b ? (b.reg === 'lit' ? 'sunlit plume' : b.reg === 'day' ? 'daylight trail' : 'engine glow') : '', secs: vis.visSec, verdict });
      if (kind !== 'forecast') assert.equal(fails.length, 0, `${c.id}, ${o[0]}: ${fails.join('; ')}`);
      else if (e.maxScore != null) assert.ok(got <= e.maxScore, `${c.id}, ${o[0]}: forecast case rated ${got}, above the cautious limit ${e.maxScore}`);
    }
  });
}

test('Crew-2 style pre dawn launch: the rocket climbs into sunlight part way up, not at liftoff (the jellyfish lasts minutes)', () => {
  const L = { v: 'F9', site: 'LC39A', az: 44, utc: '2021-04-23T09:49:02Z' }, vis = ORB.visibility(L, ORB.track(L, 2), 28.54, -81.38);
  assert.equal(vis.samples[0].lit, false, 'dark at liftoff');
  assert.equal(vis.samples.find((s) => s.t === 60).lit, false);
  assert.equal(vis.samples[vis.samples.length - 1].lit, true, 'sunlit by the time of orbit insertion');
  const onset = vis.samples.find((s) => s.lit).t;
  assert.ok(onset > 120 && onset < 480, 'sunlight reaches it ' + onset + ' s in');
});

test('the same launch is not rated better because the sun moved during the flight: sun is worked out at every second, not at liftoff', () => {
  const L = { v: 'F9', site: 'SLC40', az: 44, utc: '2025-06-16T10:40:00Z' }, vis = ORB.visibility(L, ORB.track(L, 2), 28.3, -80.6);
  const suns = vis.samples.map((s) => s.sun);
  assert.ok(Math.abs(suns[0] - suns[suns.length - 1]) > 1.2, 'observer sun changes by degrees over the flight (' + suns[0].toFixed(1) + ' to ' + suns[suns.length - 1].toFixed(1) + ')');
});

// ---------------------------------------------------------------- 3. invariants
test('invariants over many observers, launches and times: the rating never beats what distance, daylight and duration allow', () => {
  const sites = ['SLC40', 'SLC4E', 'WALLOPS', 'STARBASE'], vehs = ['F9', 'FH', 'NG', 'SS', 'EL', 'NS', 'GEN'], azs = { SLC40: [44, 90, 125], SLC4E: [160, 190], WALLOPS: [52, 90], STARBASE: [97] };
  const hours = [0, 3, 6, 9, 11, 12, 14, 17, 20, 23];
  let n = 0, shown = 0;
  for (const s of sites) for (const v of vehs) for (const az of azs[s]) for (const h of hours) {
    const site = ORB.SITES[s], L = { v, site: s, az, utc: `2026-06-16T${String(h).padStart(2, '0')}:20:00Z` }, trk = ORB.track(L, 4);
    for (let dla = -9; dla <= 9; dla += 3) for (let dlo = -12; dlo <= 12; dlo += 3) {
      const la = site.lat + dla, lo = site.lon + dlo, vis = ORB.visibility(L, trk, la, lo); n++;
      const scale = { EL: .6, NS: .35, SUB: .35 }[v] || 1;
      for (const x of vis.samples) if (x.vis) {
        assert.ok(x.range <= ORB.RANGE.lit * scale + 1e-6, `visible beyond ${ORB.RANGE.lit} km`);
        if (x.reg === 'day') { assert.ok(x.range <= 200 * scale + 1e-6, 'daylight view beyond 200 km'); if (x.range > 150) assert.equal(x.score, 1, 'daylight view past 150 km above Low'); }
        assert.ok(x.el >= ORB.MINEL - 1e-9, 'visible under the minimum angle');
        if (x.score === 4) assert.ok(x.range <= 150 && x.el >= 30, 'Excellent beyond 150 km or under 30 degrees');
        if (x.score >= 3) assert.ok(x.range <= 250 && x.el >= 18, 'Great beyond 250 km or under 18 degrees');
        if (x.score >= 2) assert.ok(x.range <= 400 && x.el >= 10, 'Good beyond 400 km or under 10 degrees');
      }
      if (vis.score === 4) assert.ok(vis.visSec >= 45 && vis.best.range <= 150 && vis.best.el >= 30);
      if (vis.score >= 3) assert.ok(vis.best.range <= 250);
      if (vis.score >= 2) assert.ok(vis.visSec >= 20);
      if (vis.best && vis.best.sky === 'day') assert.ok(vis.score <= 3 && /Daytime/.test(vis.rating));
      if (vis.best && vis.best.reg === 'glow' && vis.best.sky === 'dark') assert.ok(vis.best.range <= 400 * scale + 1e-6, 'engine glow beyond 400 km');
      if (vis.best && ORB.skyOf(vis.best.sun) !== vis.best.sky) assert.fail('sky label disagrees with the sun');
      if (!vis.best) assert.ok(vis.why === 'below' || vis.why === 'far');
      if (vis.score === 0 && shown++ < 0) console.log('x');
    }
  }
  assert.ok(n > 5000, 'enough combinations ' + n);
});

test('observers farther from the pad never get a better rating than nearer ones along the same line (same launch, same time, dark sky)', () => {
  const L = { v: 'F9', site: 'SLC40', az: 90, utc: '2025-06-16T05:00:00Z' }, trk = ORB.track(L, 2), s = ORB.SITES.SLC40;
  let prev = 9;
  for (let km = 40; km <= 900; km += 20) {
    const o = ORB.dest(s.lat, s.lon, 330, km), sc = ORB.visibility(L, trk, o[0], o[1]).score;
    assert.ok(sc <= prev + 0, `score rises from ${prev} to ${sc} at ${km} km`);
    prev = sc;
  }
});

test.after(() => {
  console.log('\nComparison with documented launches (kind: sighting = people saw it, guide = a viewing guide says so, forecast = an official map, cautious = no source, near = obvious)');
  console.table(rows);
  const mm = rows.filter((r) => /MISMATCH/.test(r.verdict)), cau = rows.filter((r) => /CAUTIOUS/.test(r.verdict));
  console.log(`${rows.length} observer cases: ${rows.length - mm.length - cau.length} match, ${cau.length} are more cautious than an official forecast map, ${mm.length} mismatch.`);
});
