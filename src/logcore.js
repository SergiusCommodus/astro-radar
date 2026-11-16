/* The launch logbook's rules (Part 3), with no browser in them, so node can test them (tests/logbook.test.mjs) and the pages share one copy
   (logbook.js loads this first). A sighting is what the visitor says they saw, kept only in this browser:
     { id: the launch's id, at: when it was logged (ISO), from: a ZIP or a town (never a position), how: some of plume, trail, dot, jellyfish,
       note: up to 280 characters, l: the launch as the page showed it { mis, veh, prov, pn (provider name), pad, site (region), utc, crew, ship } }
   Badges are worked out from the log every time, never awarded and kept: deleting a sighting takes its badge away without a word. They say
   what happened ("Saw a crewed launch"), with counts that stop at 1, 5, 10 and 25; no streaks, no levels, nothing to chase.
   Docs: docs/LOGBOOK_RESEARCH.md (the research), CLAUDE.md (Remember it). */
(function (root) {
  'use strict';
  var HOW = ['plume', 'trail', 'dot', 'jellyfish'];
  var HOW_WORD = { plume: 'a glowing plume', trail: 'a trail', dot: 'a moving dot', jellyfish: 'a twilight jellyfish' };
  var SITE = { cape: 'the Space Coast', vandenberg: 'Vandenberg', starbase: 'Starbase', other: 'elsewhere' };
  var FORMAT = 'astro-radar-log', VERSION = 1, MAX = 2000;
  var ID = /^[A-Za-z0-9_-]{1,80}$/;
  function str(x, n) { return typeof x === 'string' ? x.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n) : ''; }
  // where a launch is from, by the pad's name and place (the same three regions as the Go watch pages)
  function siteOf(pad, st) {
    var s = String(pad || '');
    if (st === 'FL' || /Cape Canaveral|Kennedy Space Center/.test(s)) return 'cape';
    if (/Vandenberg/.test(s)) return 'vandenberg';
    if (/Starbase|Boca Chica/.test(s)) return 'starbase';
    return 'other';
  }
  // a crewed launch by Launch Library's mission type, or by a crewed mission's name
  function crewed(mt, mis) {
    return /Human Exploration|Tourism/i.test(String(mt || '')) || /\b(Crew[ -]?\d+|Axiom|Ax ?\d+|Shenzhou ?\d+|Soyuz MS|Artemis II\b|Polaris|Fram2|Inspiration4)\b/i.test(String(mis || ''));
  }
  // a ZIP (five digits) or a town (letters, spaces, commas, periods and apostrophes); anything else is dropped
  function place(x) {
    var s = str(x, 60);
    if (/^\d{5}$/.test(s)) return s;
    if (/^[A-Za-z][A-Za-z .,'’]{1,58}$/.test(s)) return s.replace(/\s+/g, ' ');
    return '';
  }
  // a sighting as stored, or null when it is not one: every field checked, nothing kept as markup
  function clean(e) {
    if (!e || typeof e !== 'object' || !ID.test(String(e.id || ''))) return null;
    var l = e.l && typeof e.l === 'object' ? e.l : {}, utc = Date.parse(l.utc), at = Date.parse(e.at);
    if (!isFinite(utc)) return null;
    var how = (Array.isArray(e.how) ? e.how : []).filter(function (h, i, a) { return HOW.indexOf(h) >= 0 && a.indexOf(h) === i; });
    return {
      id: String(e.id), at: new Date(isFinite(at) ? at : utc).toISOString(), from: place(e.from), how: how, note: str(e.note, 280),
      l: { mis: str(l.mis, 120) || 'A launch', veh: str(l.veh, 60), prov: str(l.prov, 40), pn: str(l.pn, 60), pad: str(l.pad, 120),
        site: SITE[l.site] ? l.site : 'other', utc: new Date(utc).toISOString(), crew: !!l.crew, ship: !!l.ship || /Starship/i.test(String(l.veh || '')) }
    };
  }
  function tier(n) { return n >= 25 ? 25 : n >= 10 ? 10 : n >= 5 ? 5 : n >= 1 ? 1 : 0; }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : /(ch|sh|s|x)$/.test(w) ? 'es' : 's'); }
  // the badges this log has earned: plain words for what happened, never a target
  function badges(list) {
    var out = [], by = function (k) { var m = {}; list.forEach(function (e) { var v = k(e); if (v) (m[v] = m[v] || []).push(e); }); return m; };
    if (!list.length) return out;
    var first = list.slice().sort(function (a, b) { return a.l.utc < b.l.utc ? -1 : 1; })[0];
    out.push({ key: 'first', title: 'First launch', desc: first.l.mis + (first.l.veh ? ', ' + first.l.veh : ''), group: 'special' });
    var t = tier(list.length);
    if (t > 1) out.push({ key: 'n' + t, title: t + ' launches', desc: 'You have logged ' + plural(list.length, 'launch') + '.', group: 'special' });
    if (list.some(function (e) { return e.l.crew; })) out.push({ key: 'crew', title: 'Saw a crewed launch', desc: list.filter(function (e) { return e.l.crew; }).map(function (e) { return e.l.mis; }).slice(0, 3).join(', '), group: 'special' });
    if (list.some(function (e) { return e.l.ship; })) out.push({ key: 'ship', title: 'Saw Starship fly', desc: list.filter(function (e) { return e.l.ship; }).map(function (e) { return e.l.mis; }).slice(0, 3).join(', '), group: 'special' });
    var jelly = list.filter(function (e) { return e.how.indexOf('jellyfish') >= 0; });
    if (jelly.length) out.push({ key: 'jelly', title: 'Twilight jellyfish', desc: 'The sunlit plume over a dark sky, ' + plural(jelly.length, 'time') + '.', group: 'special' });
    var sites = Object.keys(by(function (e) { return e.l.site !== 'other' && e.l.site; }));
    if (sites.length === 3) out.push({ key: 'coasts', title: 'All three launch coasts', desc: 'The Space Coast, Vandenberg and Starbase.', group: 'special' });
    var v = by(function (e) { return e.l.veh; });
    Object.keys(v).sort().forEach(function (k) { var n = v[k].length; out.push({ key: 'veh:' + k, title: k, desc: plural(n, 'launch'), tier: tier(n), group: 'vehicle' }); });
    var p = by(function (e) { return e.l.pad && e.l.pad.split(',')[0]; });
    Object.keys(p).sort().forEach(function (k) { var n = p[k].length; out.push({ key: 'pad:' + k, title: k, desc: plural(n, 'launch'), tier: tier(n), group: 'pad' }); });
    return out;
  }
  // a year in launches: what the share card says
  function year(list, y) {
    var ys = list.filter(function (e) { return new Date(e.l.utc).getUTCFullYear() === y; }).sort(function (a, b) { return a.l.utc < b.l.utc ? -1 : 1; });
    var count = function (k) { var m = {}; ys.forEach(function (e) { var v = k(e); if (v) m[v] = (m[v] || 0) + 1; }); return Object.keys(m).sort(function (a, b) { return m[b] - m[a] || (a < b ? -1 : 1); }).map(function (x) { return [x, m[x]]; }); };
    return { year: y, n: ys.length, vehicles: count(function (e) { return e.l.veh; }), providers: count(function (e) { return e.l.pn || e.l.prov; }),
      pads: count(function (e) { return e.l.pad && e.l.pad.split(',')[0]; }), first: ys[0] || null, last: ys[ys.length - 1] || null,
      crew: ys.filter(function (e) { return e.l.crew; }).length, jelly: ys.filter(function (e) { return e.how.indexOf('jellyfish') >= 0; }).length };
  }
  function exportDoc(list, now) { return { format: FORMAT, version: VERSION, exported: (now || new Date()).toISOString(), entries: list.map(clean).filter(Boolean) }; }
  // an import: a file of ours, of this version or older; merged by launch (the same launch twice is one sighting: the newer edit wins)
  function readDoc(text) {
    var d;
    try { d = JSON.parse(text); } catch (e) { return { error: 'That file is not a log export (it is not JSON).' }; }
    if (!d || d.format !== FORMAT) return { error: 'That file is not an Astro Radar log export.' };
    if (typeof d.version !== 'number' || d.version > VERSION) return { error: 'That log is from a newer version of Astro Radar. Reload the page and try again.' };
    if (!Array.isArray(d.entries)) return { error: 'That log export has no sightings in it.' };
    var good = [], bad = 0;
    d.entries.slice(0, MAX).forEach(function (e) { var c = clean(e); if (c) good.push(c); else bad++; });
    return { entries: good, bad: bad + Math.max(0, d.entries.length - MAX) };
  }
  function merge(have, incoming) {
    var m = {}, added = 0, same = 0;
    have.forEach(function (e) { m[e.id] = e; });
    incoming.forEach(function (e) { if (!m[e.id]) { added++; m[e.id] = e; } else { same++; if (e.at > m[e.id].at) m[e.id] = e; } });
    return { list: Object.keys(m).map(function (k) { return m[k]; }), added: added, same: same };
  }
  var api = { HOW: HOW, HOW_WORD: HOW_WORD, SITE: SITE, FORMAT: FORMAT, VERSION: VERSION, siteOf: siteOf, crewed: crewed, place: place, clean: clean, tier: tier,
    badges: badges, year: year, exportDoc: exportDoc, readDoc: readDoc, merge: merge };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.LOG = api;
})(this);
