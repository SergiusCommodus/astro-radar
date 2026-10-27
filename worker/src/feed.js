// Launch Library 2 raw response -> the site's feed. This is scripts/fetch_launches.py in JavaScript: keep the two identical.
// worker/test/parity.test.mjs runs both on the same raw files and compares the output.
import providersFile from '../../data/providers.json' with { type: 'json' };

export const API = 'https://ll.thespacedevs.com/2.2.0/launch/';
export const WINDOW_DAYS = 30;
export const RECENT_DAYS = 7;
export const PAGE = 100;
export const MAX_PAGES = 2;
export const MAX_LAUNCHES = 150;
export const MAX_RECENT = 40;

// provider keys and the Launch Library 2 names they match come from data/providers.json, the same file the page shows
const PROVIDERS = [];
for (const p of providersFile.providers) for (const m of p.match) PROVIDERS.push([m, p.key]);
const STATE_TZ = {
  FL: 'America/New_York', VA: 'America/New_York', CA: 'America/Los_Angeles',
  TX: 'America/Chicago', NM: 'America/Denver', AK: 'America/Anchorage',
  HI: 'Pacific/Honolulu',
};
// go, to be confirmed (TBC and TBD), hold, and flight for a launch that has left the pad. Launch Library has no scrub status:
// a scrub shows as a new launch time or a status back to TBC
const STATUS = { go: 'go', tbc: 'tbd', tbd: 'tbd', hold: 'hold', 'in flight': 'flight' };
const RESULT = { success: 'success', failure: 'failure', 'partial failure': 'partial' };

// Python's float(): numbers and numeric strings, nothing else
function pyFloat(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && /^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$/.test(v)) return Number(v);
  throw new TypeError('not a number');
}
// Python's float %: the result takes the sign of the divisor
function pyMod(x, y) {
  const m = x % y;
  return m !== 0 && (m < 0) !== (y < 0) ? m + y : m;
}
const D2R = Math.PI / 180; // math.radians multiplies by this constant
const R2D = 180 / Math.PI;
const round1 = (x) => Number(x.toFixed(1));
const str = (x) => (typeof x === 'string' ? x : x == null || x === false || x === 0 ? '' : String(x));
const isoSec = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

export function vehicleKey(name) {
  const n = name.toLowerCase();
  for (const [needle, key] of [['falcon heavy', 'FH'], ['falcon 9', 'F9'], ['starship', 'SS'], ['new glenn', 'NG'],
    ['new shepard', 'NS'], ['vulcan', 'VUL'], ['electron', 'EL'], ['haste', 'EL']]) {
    if (n.includes(needle)) return key;
  }
  return 'GEN';
}

function providerKey(name) {
  const n = (name || '').toLowerCase();
  for (const [needle, key] of PROVIDERS) if (n.includes(needle)) return key;
  return 'other';
}

function southeastStarlink(missionName, lat) {
  const m = /group\s*(\d+)/.exec(missionName.toLowerCase());
  return lat < 33 && missionName.toLowerCase().includes('starlink') && !!m && m[1] === '6';
}

function inclination(missionName, orbitAbbrev, orbitName, lat) {
  const o = `${orbitAbbrev || ''} ${orbitName || ''}`.toLowerCase();
  if (missionName.toLowerCase().includes('starlink')) {
    if (lat > 33) return 70.0;
    return southeastStarlink(missionName, lat) ? 43.0 : 53.2;
  }
  if (['sso', 'sun-synchronous', 'polar'].some((k) => o.includes(k))) return 97.5;
  if (['gto', 'geo', 'transfer', 'heliocentric', 'escape', 'lunar', 'mars', 'tli'].some((k) => o.includes(k))) return Math.abs(lat);
  return 51.6;
}

function azimuth(inc, lat, lon, vkey, south = false) {
  if (vkey === 'SS') return 97.0;
  const ratio = Math.max(-1.0, Math.min(1.0, Math.cos(inc * D2R) / Math.cos(lat * D2R)));
  const a = Math.asin(ratio) * R2D;
  const westCoast = lon < -100 && lat > 30;
  if (inc >= 90 || westCoast || south) return round1(pyMod(180 - a, 360));
  return round1(pyMod(a, 360));
}

const stateOf = (loc) => (/,\s*([A-Z]{2}),\s*USA/.exec(loc || '') || [])[1] || '';
const tzFor = (loc) => { const s = stateOf(loc); return s ? STATE_TZ[s] || 'UTC' : 'UTC'; };
const dehyphen = (name) => (name || '').replace(/\s*-\s*/g, ' ').trim();
const httpsOnly = (u) => (typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null);

const PLATFORMS = { 'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'x.com': 'X', 'twitter.com': 'X', 'plus.nasa.gov': 'NASA+' };

function hostOf(url) { return new URL(url).hostname; }

function platform(url) {
  const host = hostOf(url);
  for (const [dom, name] of Object.entries(PLATFORMS)) if (host === dom || host.endsWith('.' + dom)) return name;
  return '';
}

// the launch's own webcast and where it streams; fan restreams are skipped, then the highest priority wins, English first
function pickVideo(item) {
  let best = null;
  for (const v of item.vidURLs || []) {
    const u = httpsOnly(v.url);
    const kind = str((v.type || {}).name).toLowerCase();
    if (!u || kind.includes('unofficial')) continue;
    const lang = str((v.language || {}).code || 'en').toLowerCase();
    const rank = [lang === 'en', v.priority || 0];
    if (best === null || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && rank[1] > best.rank[1])) {
      let pub = v.publisher;
      pub = (pub && typeof pub === 'object' ? pub.name : pub) || '';
      best = { rank, u, pub: str(pub).trim() };
    }
  }
  if (!best) return [null, null];
  const plat = platform(best.u) || hostOf(best.u).replace(/^www\./, '');
  if (plat === 'NASA+' || !best.pub) return [best.u, plat || null];
  return [best.u, `${best.pub} on ${plat}`];
}

function pickInfo(item) {
  for (const v of item.infoURLs || []) {
    const u = httpsOnly(v.url);
    if (u) return u;
  }
  return null;
}

// an ISO 8601 time with an offset (Launch Library always sends one); anything else is an error, as it is in Python
function parseNet(net) {
  if (typeof net !== 'string' || !/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:?\d\d)$/.test(net)) throw new RangeError('bad time');
  const t = Date.parse(net.replace(' ', 'T'));
  if (Number.isNaN(t)) throw new RangeError('bad time');
  return new Date(t);
}

export function normalize(item, now) {
  const status = STATUS[str((item.status || {}).abbrev).toLowerCase()];
  if (!status) return null;
  const net = item.net;
  if (!net) return null;
  const when = parseNet(net);
  if (when < new Date(now.getTime() - 30 * 60000)) return null;
  const pad = item.pad || {};
  let lat, lon;
  try {
    lat = pyFloat(pad.latitude);
    lon = pyFloat(pad.longitude);
  } catch {
    return null;
  }
  if (lat === 0 && lon === 0) return null; // no usable location, so the flight path cannot be modeled
  const cfg = (item.rocket || {}).configuration || {};
  const fullName = item.name || '';
  const veh = cfg.name || fullName.split('|')[0].trim();
  let vkey = vehicleKey(veh);
  const orbit = (item.mission || {}).orbit || {};
  const orbitName = orbit.name || '';
  const low = `${veh} ${cfg.family || ''} ${orbitName}`.toLowerCase();
  if (vkey === 'GEN' && ['sounding', 'suborbital'].some((k) => low.includes(k))) vkey = 'SUB';
  const missionName = (item.mission || {}).name || (fullName.includes('|') ? fullName.slice(fullName.indexOf('|') + 1).trim() : fullName);
  const lsp = item.launch_service_provider || {};
  const pkey = providerKey(lsp.name);
  let locName = (pad.location || {}).name || '';
  let padName = pad.name || 'Launch pad';
  if (padName.toLowerCase().startsWith('unknown')) {
    // the pad is not picked yet (Rocket Lab often lists its Mahia complex this way) but the site coordinates are known
    padName = locName.split(',')[0].trim() || 'Launch site';
    locName = locName.slice(padName.length).replace(/^[, ]+/, '');
  }
  const prob = item.probability;
  const [vid, vsrc] = pickVideo(item);
  const out = {
    id: item.id ?? null,
    prov: pkey,
    orbit: dehyphen(orbitName.replace(/\s+Orbit$/, '')) || 'To be announced',
    go: Number.isInteger(prob) && prob >= 0 && prob <= 100 ? prob : null,
    v: vkey,
    veh: dehyphen(veh),
    mis: missionName,
    site: `pad${pad.id == null ? 'None' : pad.id}`,
    pad: {
      n: dehyphen(padName),
      full: dehyphen(`${padName}, ${locName}`.replace(/^[, ]+|[, ]+$/g, '')),
      lat, lon, st: stateOf(locName),
    },
    az: azimuth(inclination(missionName, orbit.abbrev, orbitName, lat), lat, lon, vkey, southeastStarlink(missionName, lat)),
    utc: isoSec(when),
    tz: tzFor(locName),
    st: status,
    vid,
    vsrc,
    info: pickInfo(item),
  };
  if (pkey === 'other') {
    // a provider outside data/providers.json: its name and the official site Launch Library lists (lsp.url is an API endpoint,
    // never a web page). No channel is guessed, so without a webcast in the feed the page says none is listed
    out.pv = { n: lsp.name || 'Launch provider', site: httpsOnly(lsp.info_url) };
  }
  return out;
}

// a launch from the last 7 days with its result, for the Recent launches strip (no flight path is needed)
export function normalizeRecent(item, now) {
  const res = RESULT[str((item.status || {}).abbrev).toLowerCase()];
  const net = item.net;
  if (!res || !net) return null;
  const when = parseNet(net);
  if (when < new Date(now.getTime() - RECENT_DAYS * 86400000) || when > new Date(now.getTime() + 5 * 60000)) return null;
  const pad = item.pad || {};
  const cfg = (item.rocket || {}).configuration || {};
  const fullName = item.name || '';
  const veh = cfg.name || fullName.split('|')[0].trim();
  const missionName = (item.mission || {}).name || (fullName.includes('|') ? fullName.slice(fullName.indexOf('|') + 1).trim() : fullName);
  const lsp = item.launch_service_provider || {};
  const pkey = providerKey(lsp.name);
  let locName = (pad.location || {}).name || '';
  let padName = pad.name || 'Launch pad';
  if (padName.toLowerCase().startsWith('unknown')) {
    padName = locName.split(',')[0].trim() || 'Launch site';
    locName = locName.slice(padName.length).replace(/^[, ]+/, '');
  }
  const [vid, vsrc] = pickVideo(item);
  const out = {
    id: item.id ?? null,
    prov: pkey,
    veh: dehyphen(veh),
    mis: missionName,
    pad: { n: dehyphen(padName), full: dehyphen(`${padName}, ${locName}`.replace(/^[, ]+|[, ]+$/g, '')) },
    utc: isoSec(when),
    res,
    vid,
    vsrc,
    info: pickInfo(item),
  };
  if (pkey === 'other') out.pv = { n: lsp.name || 'Launch provider', site: httpsOnly(lsp.info_url) };
  return out;
}

export function buildFeed(raw, now = new Date()) {
  const horizon = isoSec(new Date(now.getTime() + WINDOW_DAYS * 86400000));
  const launches = [];
  const recent = [];
  for (const item of raw.results || []) {
    let n = null;
    let r = null;
    try {
      n = normalize(item, now);
      r = n ? null : normalizeRecent(item, now);
    } catch (err) { // one odd record must not sink the feed
      continue;
    }
    if (n && n.utc <= horizon) launches.push(n);
    if (r) recent.push(r);
  }
  const byTime = (a, b) => (a.utc < b.utc ? -1 : a.utc > b.utc ? 1 : 0);
  launches.sort(byTime);
  recent.sort((a, b) => byTime(b, a));
  return {
    generated: isoSec(now),
    source: 'Launch Library 2, The Space Devs (thespacedevs.com)',
    launches: launches.slice(0, MAX_LAUNCHES),
    recent: recent.slice(0, MAX_RECENT),
  };
}

// the upstream request: the next 30 days and the last 7 in one go, ordered by launch time (same query as fetch() in the Python script)
export function upstreamUrl(now = new Date()) {
  const q = new URLSearchParams({
    limit: String(PAGE), mode: 'detailed', ordering: 'net',
    net__gte: isoSec(new Date(now.getTime() - RECENT_DAYS * 86400000)),
    net__lte: isoSec(new Date(now.getTime() + WINDOW_DAYS * 86400000)),
  });
  return `${API}?${q}`;
}
