// scripts/fetch_launches.py and worker/src/feed.js must turn the same Launch Library response into the same feed.
// Run: cd worker && npm test   (needs python3 on the path)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFeed } from '../src/feed.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmp = mkdtempSync(join(tmpdir(), 'astro-parity-'));
const PY = ['python3', 'python', 'py'].find((p) => spawnSync(p, ['--version']).status === 0);

function python(args) {
  const r = spawnSync(PY, args, { cwd: root, encoding: 'utf-8' });
  assert.equal(r.status, 0, r.stderr);
}

function both(rawPath, now) {
  const out = join(tmp, 'py-' + Math.random().toString(36).slice(2) + '.json');
  python(['scripts/fetch_launches.py', out, '--from-file', rawPath, '--now', now]);
  const py = JSON.parse(readFileSync(out, 'utf-8'));
  const js = JSON.parse(JSON.stringify(buildFeed(JSON.parse(readFileSync(rawPath, 'utf-8')), new Date(now))));
  return { py, js };
}

test('python is available', () => assert.ok(PY, 'python3 not found'));

test('tests/raw_ll2.json: the original sample', () => {
  const { py, js } = both(join(root, 'tests/raw_ll2.json'), '2026-10-26T00:00:00Z');
  assert.ok(py.launches.length >= 5);
  assert.deepEqual(js, py);
});

test('tests/raw_ll2_window.json: a real response with launches both sides of now', () => {
  const { py, js } = both(join(root, 'tests/raw_ll2_window.json'), '2026-10-27T18:47:06Z');
  assert.ok(py.launches.length >= 5 && py.recent.length >= 5);
  assert.deepEqual(js, py);
});

test('the mock feed: every provider type, worldwide pads, every status and result', () => {
  const raw = join(tmp, 'mock.json');
  python(['tests/make_mock_ll2.py', raw, '--now', '2026-10-27T12:00:00Z']);
  const { py, js } = both(raw, '2026-10-27T12:00:00Z');
  assert.ok(py.launches.some((l) => l.st === 'flight') && py.recent.some((r) => r.res === 'failure') && py.recent.some((r) => r.res === 'partial'));
  assert.deepEqual(js, py);
});

test('odd records: both skip or fill the same way', () => {
  const mock = JSON.parse(readFileSync(join(tmp, 'mock.json'), 'utf-8'));
  const base = mock.results[0];
  const net = (h) => new Date(Date.parse('2026-10-27T12:00:00Z') + h * 3600000).toISOString().replace(/\.\d+Z$/, 'Z');
  const mk = (id, over) => ({ ...JSON.parse(JSON.stringify(base)), id, net: net(10), ...over });
  const odd = [
    mk('e1', { pad: { ...base.pad, latitude: 'abc' } }),
    mk('e2', { pad: { ...base.pad, latitude: null } }),
    mk('e3', { pad: { ...base.pad, latitude: '0', longitude: '0' } }),
    mk('e4', { pad: null }),
    mk('e5', { net: 'garbage' }),
    mk('e6', { net: '2026-10-28T12:00:00.250+00:00' }),
    mk('e7', { net: null }),
    mk('e8', { status: null }),
    mk('e9', { status: { abbrev: 'Scrub' } }),
    mk('e10', { probability: 100 }),
    mk('e11', { probability: 101 }),
    mk('e12', { probability: -1 }),
    mk('e13', { probability: 50.5 }),
    mk('e14', { name: 'Just a name', mission: null, rocket: null }),
    mk('e15', { name: 'Rocket - X | Mission - Y', mission: null, rocket: { configuration: { name: 'Falcon-9 Block 5' } } }),
    mk('e16', { vidURLs: [{ url: 'http://insecure.example/x', publisher: 'A' }, { url: 'https://a.example/x', publisher: ' Pub ', priority: null, type: { name: 'Official Webcast' } },
      { url: 'https://youtu.be/abc', publisher: { name: 'Chan' }, priority: 3, language: { code: 'EN' } }, { url: 'https://www.x.com/i/b/1', publisher: '', priority: 3, language: { code: 'en' } }] }),
    mk('e17', { vidURLs: [{ url: 'https://plus.nasa.gov/x', publisher: 'NASA' }, { url: 'https://fan.example/', type: { name: 'Unofficial Re-stream' }, priority: 99 }] }),
    mk('e18', { infoURLs: [{ url: 'javascript:alert(1)' }, { url: 'https://ok.example/page' }] }),
    mk('e19', { mission: { name: 'Starlink Group 6-99', orbit: { name: 'Low Earth Orbit', abbrev: 'LEO' } }, name: 'Falcon 9 | Starlink Group 6-99' }),
    mk('e20', { mission: { name: 'Polar thing', orbit: { name: 'Sun-Synchronous Orbit', abbrev: 'SSO' } }, pad: { ...base.pad, latitude: '34.7', longitude: '-120.6' } }),
    mk('e21', { mission: { name: 'To the Moon', orbit: { name: 'Lunar Transfer Orbit', abbrev: '' } } }),
    mk('e22', { rocket: { configuration: { name: 'Sounder 1', family: 'Sounding rocket' } }, name: 'Sounder 1 | Hop', mission: { name: 'Hop', orbit: { name: 'Suborbital' } } }),
    mk('e23', { launch_service_provider: { name: 'Some Unknown Org', info_url: 'https://unknown.example/' } }),
    mk('e24', { launch_service_provider: null }),
    mk('e25', { pad: { ...base.pad, name: 'Unknown Pad', location: { name: 'Pad Site, Somewhere, TX, USA' } } }),
    mk('e26', { pad: { ...base.pad, name: 'Unknown Pad', location: { name: null } } }),
    mk('e27', { pad: { ...base.pad, name: 'LC-39A', location: { name: 'Kennedy Space Center, FL, USA' }, id: null } }),
    mk('e28', { id: null }),
    // recent: edges of the 7 day window, and results
    mk('r1', { net: net(-24 * 7 + 0.01), status: { abbrev: 'Success' } }),
    mk('r2', { net: net(-24 * 7 - 0.01), status: { abbrev: 'Success' } }),
    mk('r3', { net: net(0.05), status: { abbrev: 'Failure' } }),
    mk('r4', { net: net(0.2), status: { abbrev: 'Failure' } }),
    mk('r5', { net: net(-5), status: { abbrev: 'Partial Failure' }, launch_service_provider: { name: 'Odd Org', info_url: 'https://odd.example/' } }),
    mk('r6', { net: net(-5), status: { abbrev: 'Go' } }),
    mk('r7', { net: net(-0.4), status: { abbrev: 'Go' } }),
    mk('r8', { net: net(-0.6), status: { abbrev: 'Go' } }),
    mk('r9', { net: net(-6), status: { abbrev: 'Success' }, pad: { ...base.pad, name: 'Unknown Pad', location: { name: 'Mahia Peninsula, New Zealand' } } }),
    mk('r10', { net: net(-6), status: { abbrev: 'Success' }, pad: null }),
  ];
  const file = join(tmp, 'odd.json');
  writeFileSync(file, JSON.stringify({ results: odd }));
  const { py, js } = both(file, '2026-10-27T12:00:00Z');
  assert.ok(py.launches.length > 10 && py.recent.length > 3);
  assert.deepEqual(js, py);
});
