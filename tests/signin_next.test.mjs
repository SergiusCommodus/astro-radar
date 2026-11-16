// Where sign in comes back to (safeNext in src/account.js): a path on this site only. node --test tests/signin_next.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/account.js', import.meta.url), 'utf8');
const body = src.match(/function safeNext\(s\) \{([\s\S]*?)\n  \}/)[1];
const safeNext = new Function('s', body);

test('paths on this site are kept', () => {
  for (const p of ['/', '/about/', '/launch/abc/', '/?launch=x#sky', '/provider/spacex/']) assert.equal(safeNext(p), p);
});

test('anything that could leave the site, or loop, goes home', () => {
  for (const p of ['//evil.example', '//evil.example/x', '/\\evil.example', 'https://evil.example/', 'javascript:alert(1)', 'about/',
    '', null, undefined, 42, '/signin/', '/signin', '/signin/?next=/x', '/a b', ' /about/', '/\tx'])
    assert.equal(safeNext(p), '/', String(p));
});
