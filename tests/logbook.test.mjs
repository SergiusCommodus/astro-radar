// The launch logbook's rules (src/logcore.js): node --test tests/logbook.test.mjs
// What a sighting may hold (a ZIP or a town, never a position; no markup), the badges (worked out from the log, plain words, no streaks),
// the year card's numbers, export and import (a file of ours only, merged by launch), and that the crewed rule matches logbook_pages.py.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const L = require(path.join(ROOT, 'src/logcore.js'));

const launch = (id, o = {}) => ({ id, at: '2026-11-15T20:00:00Z', from: '32780', how: ['plume'], note: '', l: { mis: 'Mission ' + id, veh: 'Falcon 9', prov: 'spacex', pn: 'SpaceX', pad: 'Space Launch Complex 40, Cape Canaveral SFS, FL, USA', site: 'cape', utc: '2026-11-15T17:00:00Z', crew: false, ship: false, ...(o.l || {}) }, ...o, ...(o.l ? { l: { mis: 'Mission ' + id, veh: 'Falcon 9', prov: 'spacex', pn: 'SpaceX', pad: 'Space Launch Complex 40, Cape Canaveral SFS, FL, USA', site: 'cape', utc: '2026-11-15T17:00:00Z', crew: false, ship: false, ...o.l } } : {}) });

test('a sighting keeps a ZIP or a town, never a position or markup', () => {
  assert.equal(L.place('32780'), '32780');
  assert.equal(L.place('Titusville, FL'), 'Titusville, FL');
  assert.equal(L.place('28.61, -80.81'), '', 'coordinates are dropped');
  assert.equal(L.place('<b>x</b>'), '');
  const c = L.clean(launch('a1', { note: '<img src=x onerror=alert(1)> great', how: ['plume', 'plume', 'laser'] }));
  assert.equal(c.note, 'img src=x onerror=alert(1) great');
  assert.deepEqual(c.how, ['plume']);
  assert.equal(L.clean({ id: '../x', l: { utc: '2026-01-01T00:00:00Z' } }), null, 'an id that is not a launch id');
  assert.equal(L.clean({ id: 'ok', l: { utc: 'never' } }), null, 'a launch with no time');
  assert.equal(L.clean(launch('s', { l: { veh: 'Starship' } })).l.ship, true, 'Starship is known by its rocket');
});

test('badges say what happened, and go when the sighting goes', () => {
  const a = L.clean(launch('a')), b = L.clean(launch('b', { how: ['jellyfish'], l: { veh: 'Starship', site: 'starbase', pad: 'Orbital Launch Mount A, Starbase, TX, USA' } }));
  const c = L.clean(launch('c', { l: { crew: true, mis: 'Crew 12', site: 'vandenberg', pad: 'Space Launch Complex 4E, Vandenberg SFB, CA, USA' } }));
  const k = (list) => L.badges(list).map((x) => x.key);
  assert.deepEqual(L.badges([]), []);
  assert.ok(k([a]).includes('first'));
  assert.ok(!k([a]).includes('jelly') && !k([a]).includes('ship') && !k([a]).includes('crew'));
  const all = k([a, b, c]);
  for (const want of ['first', 'jelly', 'ship', 'crew', 'coasts', 'veh:Falcon 9', 'veh:Starship', 'pad:Space Launch Complex 40']) assert.ok(all.includes(want), want);
  assert.ok(!k([a, c]).includes('ship'), 'removing the Starship sighting takes its badge away');
  const many = Array.from({ length: 11 }, (_, i) => L.clean(launch('m' + i)));
  const v = L.badges(many).find((x) => x.key === 'veh:Falcon 9');
  assert.equal(v.tier, 10, 'counts stop at 1, 5, 10 and 25');
  assert.equal(L.badges(many).find((x) => x.key === 'n10').title, '10 launches');
  assert.equal(L.tier(4), 1); assert.equal(L.tier(24), 10); assert.equal(L.tier(99), 25);
  const words = JSON.stringify(L.badges([a, b, c]));
  assert.doesNotMatch(words, /streak|level|master|elite|unlock|don't break|in a row/i, 'no streaks, levels or chasing');
});

test('a year in launches', () => {
  const list = [L.clean(launch('a')), L.clean(launch('b', { how: ['jellyfish'], l: { veh: 'Electron', pn: 'Rocket Lab', utc: '2026-03-01T00:00:00Z', crew: true } })),
    L.clean(launch('c', { l: { utc: '2025-12-31T23:00:00Z' } }))];
  const y = L.year(list, 2026);
  assert.equal(y.n, 2);
  assert.deepEqual(y.vehicles, [['Electron', 1], ['Falcon 9', 1]]);
  assert.equal(y.first.id, 'b'); assert.equal(y.last.id, 'a');
  assert.equal(y.crew, 1); assert.equal(y.jelly, 1);
  assert.equal(L.year(list, 2025).n, 1);
});

test('export and import: our files only, merged by launch', () => {
  const have = [L.clean(launch('a')), L.clean(launch('b'))];
  const doc = L.exportDoc(have, new Date('2026-11-16T00:00:00Z'));
  assert.equal(doc.format, 'astro-radar-log'); assert.equal(doc.version, 1); assert.equal(doc.entries.length, 2);
  const back = L.readDoc(JSON.stringify(doc));
  assert.deepEqual(back.entries, have); assert.equal(back.bad, 0);
  assert.match(L.readDoc('not json').error, /not JSON/);
  assert.match(L.readDoc('{"format":"other","version":1,"entries":[]}').error, /not an Astro Radar log/);
  assert.match(L.readDoc('{"format":"astro-radar-log","version":9,"entries":[]}').error, /newer version/);
  const mixed = L.readDoc(JSON.stringify({ ...doc, entries: [...doc.entries, { id: 'bad id!' }, { id: 'c', l: { utc: '2026-11-01T00:00:00Z' } }] }));
  assert.equal(mixed.entries.length, 3); assert.equal(mixed.bad, 1);
  const newer = { ...have[0], at: '2026-11-20T00:00:00Z', note: 'edited' };
  const m = L.merge(have, [newer, L.clean(launch('z'))]);
  assert.equal(m.added, 1); assert.equal(m.same, 1); assert.equal(m.list.length, 3);
  assert.equal(m.list.find((x) => x.id === 'a').note, 'edited', 'the newer edit wins');
});

test('the crewed rule is the same in logcore.js and logbook_pages.py', () => {
  const cases = [['Human Exploration', 'Crew 12'], ['Tourism', 'NS-38'], [null, 'Axiom Mission 5'], [null, 'Shenzhou 22'], [null, 'Soyuz MS-29'],
    [null, 'Artemis II'], [null, 'Artemis III'], ['Communications', 'Starlink Group 12-7'], [null, 'Crew Dragon test'], ['Resupply', 'CRS-34']];
  const py = JSON.parse(execFileSync(process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    ['-c', 'import json,sys; sys.path.insert(0, "."); import logbook_pages as m; print(json.dumps([m.crewed(a, b) for a, b in json.load(sys.stdin)]))'],
    { cwd: ROOT, input: JSON.stringify(cases) }).toString());
  assert.deepEqual(cases.map(([a, b]) => L.crewed(a, b)), py);
  assert.deepEqual(py, [true, true, true, true, true, true, false, false, false, false]);
});
