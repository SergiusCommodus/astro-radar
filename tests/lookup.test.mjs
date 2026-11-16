// ORB.lookUp: the Look Up verdict (docs/LOOKUP.md section 3): five levels, Yes, Likely, Maybe, Unlikely and Below horizon, and the one
// thing that limits the view (horizon, daylight, distance, low, short, clouds), on made up visibility results so each branch is covered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const ORB = createRequire(import.meta.url)('../src/model.js');

const best = (o) => Object.assign({ t: 150, az: 95.3, el: 24, range: 180, h: 90, lit: false, sun: -20, sky: 'dark', reg: 'glow', score: 3 }, o);
const sample = (o) => Object.assign({ t: 100, az: 10, el: 6, range: 330, sky: 'day' }, o);
const vis = (o) => { const v = Object.assign({ best: best(), score: 3, first: 100, last: 260, dur: 160, visSec: 160, capBy: null, jelly: 'Low', why: null }, o);
  if (!v.samples) v.samples = v.best ? [Object.assign({}, v.best)] : []; return v; };

test('below the horizon is the only case worded as out of sight', () => {
  const r = ORB.lookUp(vis({ best: null, why: 'below', samples: [sample({ el: -2 })] }), null, 3000);
  assert.equal(r.level, 'Below horizon');
  assert.equal(r.limit, 'horizon');
  assert.match(r.reason, /below your horizon/);
});

test('above the horizon in daylight but past a trail: Unlikely, daylight, with a tip (the Nov 14 ULA case)', () => {
  const r = ORB.lookUp(vis({ best: null, why: 'far', samples: [sample()] }), null, 325);
  assert.equal(r.level, 'Unlikely');
  assert.equal(r.limit, 'daylight');
  assert.match(r.reason, /^Daylight/);
  assert.match(r.tip, /look low toward the north for a small bright dot/);
  assert.doesNotMatch(r.reason, /too far|never/);
});

test('above the horizon at night but far past the glow: Unlikely, distance, still not never', () => {
  const r = ORB.lookUp(vis({ best: null, why: 'far', samples: [sample({ sky: 'dark', range: 1500 })] }), null, 1500);
  assert.equal(r.level, 'Unlikely');
  assert.equal(r.limit, 'distance');
  assert.doesNotMatch(r.reason, /never/);
});

test('a long night or twilight view is a Yes with where and how high', () => {
  const r = ORB.lookUp(vis(), null, 300);
  assert.equal(r.level, 'Yes');
  assert.equal(r.verdict, 'Yes');
  assert.equal(r.limit, null);
  assert.equal(r.dir, 'E');
  assert.equal(r.az, 95);
  assert.equal(r.el, 24);
  assert.equal(r.cloudsKnown, false);
  assert.equal(r.sound, null, 'past 60 km no sound delay is given');
});

test('a sunlit plume low and far over a dark sky is still a Yes (the Miami twilight launches)', () => {
  const r = ORB.lookUp(vis({ best: best({ reg: 'lit', lit: true, el: 9, range: 487 }), jelly: 'High', visSec: 200 }), null, 323);
  assert.equal(r.level, 'Yes');
  assert.match(r.reason, /jellyfish/);
});

test('shorter or lower night views: Likely, then Maybe', () => {
  assert.equal(ORB.lookUp(vis({ visSec: 54, best: best({ el: 7, range: 399 }) }), null, 328).level, 'Likely');
  assert.equal(ORB.lookUp(vis({ visSec: 20, capBy: 'short' }), null, 300).level, 'Maybe');
  assert.match(ORB.lookUp(vis({ visSec: 20, capBy: 'short' }), null, 300).reason, /20 seconds/);
  assert.equal(ORB.lookUp(vis({ visSec: 120, best: best({ el: 3.5 }) }), null, 300).limit, 'low');
});

test('daylight trails: Maybe close in, Unlikely farther, never Yes', () => {
  assert.equal(ORB.lookUp(vis({ best: best({ sky: 'day', reg: 'day', range: 148, el: 20 }), score: 4 }), 0, 77).level, 'Maybe');
  const far = ORB.lookUp(vis({ best: best({ sky: 'day', reg: 'day', range: 190, el: 6 }) }), 0, 180);
  assert.equal(far.level, 'Unlikely');
  assert.equal(far.limit, 'daylight');
});

test('clouds: under 50 not counted against it, 50 to 89 one step down, 90 and over Unlikely', () => {
  assert.equal(ORB.lookUp(vis(), 49, 300).level, 'Yes');
  assert.equal(ORB.lookUp(vis(), 50, 300).level, 'Likely');
  assert.equal(ORB.lookUp(vis(), 50, 300).limit, 'clouds');
  assert.equal(ORB.lookUp(vis(), 90, 300).level, 'Unlikely');
  assert.match(ORB.lookUp(vis(), 90, 300).reason, /^Clouds: 90 percent/);
  assert.equal(ORB.lookUp(vis({ best: null, why: 'below', samples: [] }), 95, 3000).level, 'Below horizon', 'clouds never change below the horizon');
});

test('sound: distance over 343 m/s, only within 60 km', () => {
  assert.equal(ORB.lookUp(vis(), null, 20).sound, 58);
  assert.equal(ORB.lookUp(vis(), null, 60).sound, 175);
  assert.equal(ORB.lookUp(vis(), null, 60.5).sound, null);
});

test('no hyphens in any reason or tip', () => {
  const all = [ORB.lookUp(vis({ best: null, why: 'below', samples: [] }), null, 1), ORB.lookUp(vis({ best: null, why: 'far', samples: [sample()] }), null, 1),
    ORB.lookUp(vis(), 95, 1), ORB.lookUp(vis(), 60, 1), ORB.lookUp(vis(), null, 1), ORB.lookUp(vis({ best: best({ reg: 'lit' }), jelly: 'High' }), null, 1),
    ORB.lookUp(vis({ best: best({ sky: 'day' }) }), null, 1), ORB.lookUp(vis({ visSec: 10, capBy: 'short' }), 70, 1)];
  for (const r of all) assert.doesNotMatch(r.reason + (r.tip || ''), /\w-\w/, r.reason);
});
