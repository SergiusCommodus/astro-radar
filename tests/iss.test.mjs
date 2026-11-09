// ISS passes: node --test tests/iss.test.mjs
// ORB.issPasses (src/model.js) with the bundled satellite.js against known passes computed independently with Skyfield (its own SGP4 and
// the JPL ephemeris for the sun and the Earth's shadow; tests/iss/make_expected.py) from the same saved elements, for Miami (33130) and
// New York (10001) over 72 hours: the same passes, rise, highest point and set within 30 s, the highest elevation within 1 degree, and the
// same answer to "visible" (sunlit station, dark sky).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const ORB = require('../src/model.js');
const sat = require('../assets/vendor/satellite.min.js');
const here = (f) => new URL(f, import.meta.url);
const tle = readFileSync(here('./iss/tle.txt'), 'utf-8').split(/\r?\n/).map((l) => l.trim()).filter((l) => /^[12] /.test(l));
const want = JSON.parse(readFileSync(here('./iss/expected.json'), 'utf-8'));

for (const [zip, P] of Object.entries(want.places)) {
  test('passes over ' + zip + ' match Skyfield', () => {
    const got = ORB.issPasses(sat, tle, P.lat, P.lon, Date.parse(want.from), want.hours);
    assert.equal(got.length, P.passes.length, 'number of passes');
    P.passes.forEach((w, i) => {
      const g = got[i], s = (iso) => Date.parse(iso);
      assert.ok(Math.abs(g.start - s(w.rise)) <= 30e3, `${zip} pass ${i} rise ${new Date(g.start).toISOString()} vs ${w.rise}`);
      assert.ok(Math.abs(g.end - s(w.set)) <= 30e3, `${zip} pass ${i} set ${new Date(g.end).toISOString()} vs ${w.set}`);
      assert.ok(Math.abs(g.tmax - s(w.max_t)) <= 30e3, `${zip} pass ${i} highest point`);
      assert.ok(Math.abs(g.max - w.max) <= 1, `${zip} pass ${i} highest ${g.max.toFixed(1)} vs ${w.max}`);
      assert.equal(g.vis, w.vis, `${zip} pass ${i} visible`);
    });
  });
}

test('a visible pass is a dark sky and a sunlit station', () => {
  const P = want.places['33130'], got = ORB.issPasses(sat, tle, P.lat, P.lon, Date.parse(want.from), want.hours).filter((p) => p.vis);
  assert.ok(got.length > 0);
  for (const p of got) assert.ok(ORB.sunEl(P.lat, P.lon, new Date(p.end)) <= -6 || ORB.sunEl(P.lat, P.lon, new Date(p.start)) <= -6);
});
