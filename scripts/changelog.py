"""The change log (docs/LOOKUP.md section 6): what Astro Radar saw change between two of its own feeds, kept as changes.json next to
launches.json.

Each run of scripts/fetch_launches.py compares the feed it just built with the previous one (the output folder's launches.json, else the
live site's) and adds what differs to the previous changes.json. Nothing is invented: an entry is only ever a difference between the
two feeds, with the time this run saw it. Format, compact JSON:

    {"generated": "2026-11-13T12:00:00Z",
     "launches": {"<id>": [{"at": "2026-11-13T12:00:00Z", "k": "slip", "from": "...", "to": "..."}, ...]}}

Kinds, oldest first per launch: slip (the time moved by 60 s or more), scrub (the toasts' rule, diffEvents in src/app.js: a go or hold
launch within a day of its time moving 15 minutes or more later, or back to a time to be confirmed; recorded instead of a slip), status
(st changed), np (the time's precision changed; only when both feeds have it) and gone (a launch within 2 days of its time, not in
flight, that would still be listed but is in neither launches nor recent). A launch seen for the first time gets no entry. Entries
older than KEEP_DAYS are dropped and each launch keeps its MAX_PER newest.
"""
import json
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

KEEP_DAYS = 45
MAX_PER = 20
SLIP_S = 60
SCRUB_S = 15 * 60
SCRUB_WITHIN = timedelta(hours=24)
GONE_WITHIN = timedelta(days=2)
DROP_AFTER = timedelta(minutes=30)   # normalize() drops a launch 30 minutes after its time, which is not a launch leaving the feed
LIVE = "https://astroradar.io/"
FMT = "%Y-%m-%dT%H:%M:%SZ"


def _t(v):
    """An ISO UTC time from the feed as a datetime, else None."""
    if not isinstance(v, str):
        return None
    try:
        t = datetime.fromisoformat(v.replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else None


def _launches(feed):
    out = {}
    for l in (feed or {}).get("launches") or [] if isinstance(feed, dict) else []:
        if isinstance(l, dict) and isinstance(l.get("id"), str) and l["id"]:
            out[l["id"]] = l
    return out


def _entries(prev_changes):
    """The previous log, keeping only well formed entries."""
    got = (prev_changes or {}).get("launches") if isinstance(prev_changes, dict) else None
    out = {}
    if not isinstance(got, dict):
        return out
    for lid, es in got.items():
        if isinstance(lid, str) and isinstance(es, list):
            keep = [e for e in es if isinstance(e, dict) and _t(e.get("at")) and isinstance(e.get("k"), str)]
            if keep:
                out[lid] = keep
    return out


def _compare(p, c, now):
    """What changed for one launch listed in both feeds."""
    out = []
    pu, cu = _t(p.get("utc")), _t(c.get("utc"))
    if pu and cu:
        later = (cu - pu).total_seconds()
        if (p.get("st") in ("go", "hold") and c.get("st") != "flight" and pu - now < SCRUB_WITHIN
                and (later >= SCRUB_S or c.get("st") == "tbd")):
            out.append({"k": "scrub", "from": p["utc"], "to": c["utc"]})
        elif abs(later) >= SLIP_S:
            out.append({"k": "slip", "from": p["utc"], "to": c["utc"]})
    if isinstance(p.get("st"), str) and isinstance(c.get("st"), str) and p["st"] != c["st"]:
        out.append({"k": "status", "from": p["st"], "to": c["st"]})
    if isinstance(p.get("np"), str) and isinstance(c.get("np"), str) and p["np"] != c["np"]:
        out.append({"k": "np", "from": p["np"], "to": c["np"]})
    return out


def diff(prev_feed, cur_feed, prev_changes, now):
    """The new log: prev_changes plus what differs between prev_feed and cur_feed, seen at now; trimmed to KEEP_DAYS and MAX_PER."""
    at = now.astimezone(timezone.utc).strftime(FMT)
    log = _entries(prev_changes)
    if prev_feed is not None:
        old, new = _launches(prev_feed), _launches(cur_feed)
        recent = {r.get("id") for r in (cur_feed or {}).get("recent") or [] if isinstance(r, dict)}
        for lid, p in old.items():
            c = new.get(lid)
            if c is not None:
                found = _compare(p, c, now)
            else:
                pu = _t(p.get("utc"))
                found = []
                if (lid not in recent and pu and p.get("st") != "flight" and abs(pu - now) <= GONE_WITHIN
                        and pu > now - DROP_AFTER):
                    found = [{"k": "gone", "utc": p["utc"]}]
            for e in found:
                es = log.setdefault(lid, [])
                last = dict(es[-1]) if es else None
                if last is not None:
                    last.pop("at", None)
                if last == e:
                    continue  # the same difference read twice (a rerun against the same previous feed)
                es.append({"at": at, **e})
    cut = now - timedelta(days=KEEP_DAYS)
    out = {}
    for lid, es in log.items():
        keep = [e for e in es if _t(e["at"]) >= cut][-MAX_PER:]
        if keep:
            out[lid] = keep
    return {"generated": at, "launches": out}


def _read_json(read):
    try:
        v = json.loads(read())
        return v if isinstance(v, dict) else None
    except Exception:  # noqa: BLE001 - missing or unreadable means none
        return None


def _live(name):
    req = urllib.request.Request(LIVE + name, headers={"User-Agent": "astro-radar-site"})
    return urllib.request.urlopen(req, timeout=20).read().decode("utf-8")


def last_good(out_path, network=True):
    """The previous feed and log: the output folder's launches.json and changes.json, else the live site's (when network is allowed),
    else None. Failures are silent."""
    folder = Path(out_path).resolve().parent
    found = []
    for local, name in ((Path(out_path), "launches.json"), (folder / "changes.json", "changes.json")):
        v = _read_json(lambda: local.read_text(encoding="utf-8")) if local.exists() else None
        if v is None and network:
            v = _read_json(lambda: _live(name))
        found.append(v)
    return found[0], found[1]


def run(out_feed_path, feed, now, prev_feed=None, prev_changes=None):
    """Writes changes.json next to out_feed_path and returns it."""
    changes = diff(prev_feed, feed, prev_changes, now)
    path = Path(out_feed_path).resolve().parent / "changes.json"
    path.write_text(json.dumps(changes, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    return changes
