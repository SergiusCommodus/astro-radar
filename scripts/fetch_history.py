"""This year's flown launches and the yearly totals, for the Statistics page (/stats/): python3 scripts/fetch_history.py [--year 2026]
[--from-dir DIR] [--out data/history/stats.json]

Launch Library 2 (The Space Devs) is the only source: /2.3.0/launches/previous/ in detailed mode for every launch of the year so far (each
with its update log, its editors' notes, which scripts/scrub_stats.py reads for scrubs), and one count request per outcome for each of the
two years before (mode=list, limit=1: only the count is read). A run makes at most 11 requests (three or four pages and eight counts),
inside Launch Library's free limit of 15 an hour, so it is run by hand and the result committed, like data/history/ll2_flown.json; the
page says the date it was fetched. Nothing is estimated: each record keeps only what Launch Library says.

Status ids: 3 success, 4 failure, 7 partial failure. A launch counts as suborbital when its mission's orbit is "Sub" (Suborbital), as
Launch Library files New Shepard and similar hops; every other launch is an orbital attempt.

--from-dir reads saved pages (p0.json, p100.json, ... and c<year>-<all|3|4|7>.json) instead of the network, for tests.
"""
import argparse
import json
import pathlib
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = "https://ll.thespacedevs.com/2.3.0/launches/previous/"
UA = "AstroRadar/1.0 (+https://astroradar.io/data/)"
OUTCOMES = (("all", None), ("success", 3), ("failure", 4), ("partial", 7))
STATE = re.compile(r",\s*([A-Z]{2}),\s*USA$")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def compact(l):
    """the fields the page and scrub_stats.py use, from one detailed Launch Library record"""
    rk = ((l.get("rocket") or {}).get("configuration") or {})
    fams = rk.get("families") or []
    pad = l.get("pad") or {}
    loc = pad.get("location") or {}
    mission = l.get("mission") or {}
    orbit = (mission.get("orbit") or {}).get("abbrev") or ""
    lsp = l.get("launch_service_provider") or {}
    country = ((pad.get("country") or {}).get("alpha_3_code") or "")
    m = STATE.search(loc.get("name") or "")
    return {
        "id": l.get("id"), "name": l.get("name"), "net": l.get("net"),
        "status": (l.get("status") or {}).get("abbrev"),
        "provider": lsp.get("name"), "rocket": rk.get("full_name") or rk.get("name"),
        "family": fams[0].get("name") if fams and isinstance(fams[0], dict) else None,
        "pad": pad.get("name"), "location": loc.get("name"), "country": country, "state": m.group(1) if m else None,
        "orbit": orbit, "suborbital": orbit == "Sub",
        "updates": [{"at": u.get("created_on"), "text": u.get("comment")} for u in (l.get("updates") or []) if u.get("comment")],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=datetime.now(timezone.utc).year)
    ap.add_argument("--from-dir")
    ap.add_argument("--out", default=str(ROOT / "data/history/stats.json"))
    a = ap.parse_args()
    y = a.year
    span = {"net__gte": f"{y}-01-01T00:00:00Z", "net__lt": f"{y + 1}-01-01T00:00:00Z"}
    src = pathlib.Path(a.from_dir) if a.from_dir else None
    launches, off, total = [], 0, None
    while total is None or off < total:
        if src:
            page = json.loads((src / f"p{off}.json").read_text(encoding="utf-8"))
        else:
            page = get(API + "?" + urllib.parse.urlencode({**span, "limit": 100, "offset": off, "mode": "detailed", "ordering": "net"}))
            time.sleep(3)
        total = page.get("count") or 0
        launches += [compact(l) for l in page.get("results") or []]
        off += 100
        if not page.get("results"):
            break
    years = {}
    for yy in (y - 2, y - 1):
        c = {}
        for k, sid in OUTCOMES:
            if src:
                d = json.loads((src / f"c{yy}-{'all' if sid is None else sid}.json").read_text(encoding="utf-8"))
            else:
                q = {"net__gte": f"{yy}-01-01T00:00:00Z", "net__lt": f"{yy + 1}-01-01T00:00:00Z", "limit": 1, "mode": "list"}
                if sid:
                    q["status__ids"] = sid
                d = get(API + "?" + urllib.parse.urlencode(q))
                time.sleep(2)
            c[k] = d.get("count")
        years[str(yy)] = c
    ids = [l["id"] for l in launches]
    assert len(ids) == len(set(ids)), "a launch came twice (the list moved while paging): run again"
    out = {
        "source": "Launch Library 2 (The Space Devs), /2.3.0/launches/previous/: detailed records for " + str(y)
                  + ", counts by outcome for " + str(y - 2) + " and " + str(y - 1),
        "fetched": (datetime.fromtimestamp((src / "p0.json").stat().st_mtime, timezone.utc) if src else datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "year": y, "count": total, "years": years, "launches": launches,
    }
    pathlib.Path(a.out).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(launches)} launches in {y} (Launch Library says {total}); totals {years}")


if __name__ == "__main__":
    main()
