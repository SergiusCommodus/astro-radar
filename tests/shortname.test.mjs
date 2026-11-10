// Short launch names: node --test tests/shortname.test.mjs
// ORB.shortName (src/model.js) gives the rows a short name: the part after the vehicle and pipe, "Group" and "Launch" words dropped
// before numbers, parentheses dropped when they repeat words or the name is long enough without them (else folded in), an unknown
// payload replaced by the rocket's headline (Long March 2D Launch), at most 24 characters cut at a word. Checked on every name in the fixtures and on known cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const ORB = require('../src/model.js');
const here = (f) => new URL(f, import.meta.url);

test('known names', () => {
  const cases = [
    ['Falcon 9 Block 5 | Starlink Group 10-1', '', 'Starlink 10-1'],
    ['Starlink Group 11-2', 'Falcon 9', 'Starlink 11-2'],
    ['Long March 8A | SatNet LEO Group 28', '', 'SatNet LEO 28'],
    ["Electron | We're Not Hawking Around (3x HawkEye 360)", '', "We're Not Hawking Around"],
    ['Electron | The Mountain God Rises (iQPS Launch 10)', '', 'The Mountain God Rises'],
    ['Ariane 64 Block 2 | Amazon Leo (LE-04)', '', 'Amazon Leo LE-04'],
    ['GSLV Mk II | IRNSS-1L (NVS-03)', '', 'IRNSS-1L NVS-03'],
    ['Long March 12 | SatNet LEO Group TBD?', '', 'SatNet LEO'],
    ['Unknown Payload', 'Long March 12', 'Long March 12 Launch'],
    ['TBD', 'Falcon 9 Block 5', 'Falcon 9 Launch'],
    ['Vulcan VC4S | USSF-87', '', 'USSF-87'],
    ['Starship | Flight 13', '', 'Flight 13'],
    ['New Shepard | NS-40', '', 'NS-40'],
    ['', 'Electron', 'Electron Launch'],
  ];
  for (const [name, veh, want] of cases) assert.equal(ORB.shortName(name, veh), want, name);
});

test('long names are cut at a word, with an ellipsis, within 25 characters', () => {
  const s = ORB.shortName('Electron | A Very Long Mission Name That Keeps Going On', '');
  assert.ok(s.length <= 25 && s.endsWith('…'), s);
  assert.ok(!/\s…$/.test(s), s);
});

test('every fixture name: short, no pipe, no parentheses, never empty, the same each time', () => {
  const names = [];
  const page = JSON.parse(readFileSync(here('./launches.json'), 'utf-8'));
  for (const L of page.launches || []) names.push([L.mis, L.veh]);
  for (const f of ['./raw_ll2.json', './raw_ll2_window.json']) {
    const raw = JSON.parse(readFileSync(here(f), 'utf-8'));
    for (const r of raw.results || []) names.push([r.name, ((r.rocket || {}).configuration || {}).name || '']);
  }
  assert.ok(names.length > 20, 'fixtures read: ' + names.length);
  for (const [n, v] of names) {
    const s = ORB.shortName(n, v);
    assert.ok(s && s.length <= 25, JSON.stringify([n, s]));
    assert.ok(!/[|()]/.test(s), JSON.stringify([n, s]));
    assert.equal(ORB.shortName(n, v), s);
  }
});

// a payload the feed does not name: the headline is the rocket and the word Launch, never Unknown Payload; a real name stays as it is
test('payload not disclosed: the rocket is the headline', () => {
  const missing = [
    ['Unknown Payload', 'Long March 2D'], ['Unknown', 'Long March 2D'], ['unknown payload', 'Long March 2D'],
    ['Unknown Payloads', 'Long March 2D'], ['TBD', 'Long March 2D'], ['TBD?', 'Long March 2D'], ['TBA', 'Long March 2D'],
    ['TBC', 'Long March 2D'], ['N/A', 'Long March 2D'], ['None', 'Long March 2D'], ['Undisclosed', 'Long March 2D'],
    ['Undisclosed Payload', 'Long March 2D'], ['Classified', 'Long March 2D'], ['Classified Payload', 'Long March 2D'],
    ['', 'Long March 2D'], ['  ', 'Long March 2D'], [null, 'Long March 2D'], ['Long March 2D | Unknown Payload', ''],
    ['Unknown Payload', 'Long March 2D Block 2'],
  ];
  for (const [n, v] of missing) {
    assert.equal(ORB.undisclosed(n), true, JSON.stringify(n));
    assert.equal(ORB.title(n, v), 'Long March 2D Launch', JSON.stringify([n, v]));
    assert.equal(ORB.fullName(n, v), 'Long March 2D Launch', JSON.stringify([n, v]));
    assert.equal(ORB.shortName(n, v), 'Long March 2D Launch', JSON.stringify([n, v]));
  }
  assert.equal(ORB.title('Unknown Payload', ''), 'Launch');
});

test('real names are never hidden and keep their headline', () => {
  const real = [
    ['Starlink Group 12-7', 'Falcon 9'], ['SatNet LEO Group TBD?', 'Long March 12'], ['Test Payload', 'Firefly Alpha'],
    ['NROL-118', 'Vulcan VC4S'], ['SILENTBARKER 2/NROL-118', 'Vulcan'], ['Unknown Pleasures', 'Electron'], ['Yaogan 51-07 to 09', 'Long March 2C'],
    ['Tianzhou 10', 'Long March 7'], ['4 satellites', 'Ceres 2'], ['Demo Flight', 'Mir'], ['TBD Mission Alpha', 'Electron'],
  ];
  for (const [n, v] of real) {
    assert.equal(ORB.undisclosed(n), false, n);
    assert.equal(ORB.title(n, v), n, n);
    assert.equal(ORB.fullName(n, v), v + ' ' + n, n);
  }
});

test('no fixture headline says Unknown Payload', () => {
  const page = JSON.parse(readFileSync(here('./launches.json'), 'utf-8'));
  const names = (page.launches || []).map((L) => [L.mis, L.veh]);
  for (const f of ['./raw_ll2.json', './raw_ll2_window.json']) {
    const raw = JSON.parse(readFileSync(here(f), 'utf-8'));
    for (const r of raw.results || []) names.push([(r.mission || {}).name || r.name, ((r.rocket || {}).configuration || {}).name || '']);
  }
  for (const [n, v] of names)
    for (const s of [ORB.title(n, v), ORB.fullName(n, v), ORB.shortName(n, v)]) assert.ok(s && !/unknown payload/i.test(s), JSON.stringify([n, s]));
});
