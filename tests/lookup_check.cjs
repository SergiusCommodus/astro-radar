// The Look Up hand checks (docs/LOOKUP.md section 7): three real launches from Launch Library's answer of 13 Nov 2026
// (tests/raw_ll2_lookup.json, through scripts/fetch_launches.py) seen from three ZIP codes, through the page's own model.
// Prints one JSON line per pair; tests/test_lookup_hand.py compares them with a separate geometry check written in Python.
// Usage: node tests/lookup_check.cjs <feed.json>
const fs = require('fs'), path = require('path');
const ORB = require(path.join(__dirname, '..', 'src', 'model.js'));
const feed = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const Z = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'zipdata.json'), 'utf8'));
function zip(code) { for (let i = 0; i < Z.a.length; i++) if (Z.z.slice(i * 5, i * 5 + 5) === code) return { zip: code, lat: Z.a[i] / 100, lon: Z.o[i] / 100, city: Z.n[Z.c[i]] }; return null; }
const PICK = [['Florida', /Amazon Leo \(LV-01\)/], ['Vandenberg', /^USSF-317$/], ['Overseas', /Mountain God/]];
const ZIPS = ['33196', '32801', '90012'];
for (const [where, re] of PICK) {
  const f = feed.launches.find((l) => re.test(l.mis));
  if (!f) { console.log(JSON.stringify({ where, error: 'not in feed' })); continue; }
  ORB.SITES[f.site] = { lat: f.pad.lat, lon: f.pad.lon };
  const L = { id: f.id, v: f.v, az: f.az, utc: f.utc, site: f.site };
  const trk = ORB.track(L, 2);
  for (const z of ZIPS) {
    const o = zip(z), v = ORB.visibility(L, trk, o.lat, o.lon), padKm = ORB.dist(o.lat, o.lon, f.pad.lat, f.pad.lon), r = ORB.lookUp(v, null, padKm);
    console.log(JSON.stringify({ where, mis: f.mis, veh: f.veh, v: f.v, pad: f.pad.n, utc: f.utc, az: f.az, padLat: f.pad.lat, padLon: f.pad.lon, zip: z, city: o.city, lat: o.lat, lon: o.lon,
      padKm: Math.round(padKm), sunObs: Math.round(v.sunObs * 10) / 10, verdict: r.verdict, reason: r.reason, dir: r.dir || null, faceAz: r.az ?? null, el: r.el ?? null,
      bestT: r.at ?? null, bestRange: v.best ? Math.round(v.best.range) : null, bestH: v.best ? Math.round(v.best.h) : null, reg: v.best ? v.best.reg : null, rating: v.rating, sound: r.sound }));
  }
}
