// ORB.lookUp: the Look Up verdict's rules (docs/LOOKUP.md section 3), on made up visibility results so each branch is covered.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const ORB = createRequire(import.meta.url)('../src/model.js');

const best = (o) => Object.assign({ t: 150, az: 95.3, el: 24, range: 180, h: 90, lit: false, sun: -20, sky: 'dark', reg: 'glow', score: 3 }, o);
const vis = (o) => Object.assign({ best: best(), score: 3, first: 100, last: 260, dur: 160, visSec: 160, capBy: null, jelly: 'Low', why: null }, o);

test('not visible: below the horizon or too far for the light', () => {
  assert.equal(ORB.lookUp({ best: null, why: 'below' }, null, 3000).verdict, 'No');
  assert.match(ORB.lookUp({ best: null, why: 'below' }, null, 3000).reason, /below your horizon/);
  assert.match(ORB.lookUp({ best: null, why: 'far' }, null, 900).reason, /too far away/);
});

test('a good night view is a Yes with where and how high', () => {
  const r = ORB.lookUp(vis(), null, 300);
  assert.equal(r.verdict, 'Yes');
  assert.equal(r.dir, 'E');
  assert.equal(r.az, 95);
  assert.equal(r.el, 24);
  assert.equal(r.cloudsKnown, false);
  assert.equal(r.sound, null, 'past 60 km no sound delay is given');
});

test('the twilight plume reads as a jellyfish only when the model says High', () => {
  assert.match(ORB.lookUp(vis({ best: best({ reg: 'lit', lit: true }), jelly: 'High' }), 10, 500).reason, /jellyfish/);
  assert.doesNotMatch(ORB.lookUp(vis({ best: best({ reg: 'lit', lit: true }), jelly: 'Low' }), 10, 500).reason, /jellyfish/);
});

test('clouds: under 50 counted as clear, 50 to 89 a Maybe, 90 and over a No', () => {
  assert.equal(ORB.lookUp(vis(), 49, 300).verdict, 'Yes');
  assert.equal(ORB.lookUp(vis(), 50, 300).verdict, 'Maybe');
  assert.equal(ORB.lookUp(vis(), 89, 300).verdict, 'Maybe');
  assert.equal(ORB.lookUp(vis(), 90, 300).verdict, 'No');
  assert.match(ORB.lookUp(vis(), 90, 300).reason, /90 percent/);
});

test('a daytime trail is never a Yes', () => {
  const r = ORB.lookUp(vis({ best: best({ sky: 'day', reg: 'day' }), score: 4 }), 0, 40);
  assert.equal(r.verdict, 'Maybe');
  assert.match(r.reason, /daylight/);
});

test('a low or short or far view is a Maybe with its reason', () => {
  assert.match(ORB.lookUp(vis({ score: 1, capBy: 'short', visSec: 14 }), null, 500).reason, /14 seconds/);
  assert.match(ORB.lookUp(vis({ score: 1, best: best({ el: 6 }) }), null, 500).reason, /6 degrees/);
  assert.match(ORB.lookUp(vis({ score: 1, best: best({ el: 20 }) }), null, 500).reason, /far away/);
  assert.equal(ORB.lookUp(vis({ score: 1 }), null, 500).verdict, 'Maybe');
});

test('sound: distance over 343 m/s, only within 60 km', () => {
  assert.equal(ORB.lookUp(vis(), null, 20).sound, 58);
  assert.equal(ORB.lookUp(vis(), null, 60).sound, 175);
  assert.equal(ORB.lookUp(vis(), null, 60.5).sound, null);
});

test('no hyphens in any reason', () => {
  const all = [ORB.lookUp({ best: null, why: 'below' }, null, 1), ORB.lookUp({ best: null, why: 'far' }, null, 1), ORB.lookUp(vis(), 95, 1),
    ORB.lookUp(vis(), 60, 1), ORB.lookUp(vis(), null, 1), ORB.lookUp(vis({ best: best({ reg: 'lit' }), jelly: 'High' }), null, 1),
    ORB.lookUp(vis({ best: best({ sky: 'day' }) }), null, 1), ORB.lookUp(vis({ score: 1, capBy: 'short' }), 70, 1)];
  for (const r of all) assert.doesNotMatch(r.reason, /\w-\w/, r.reason);
});
