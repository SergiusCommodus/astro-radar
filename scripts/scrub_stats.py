"""Scrub and slip odds from real launch history: python3 scripts/scrub_stats.py [--history data/history/ll2_flown.json] [--out data/history/odds.json]

The history is Launch Library 2's own record of flown launches with each launch's update log (its editors' notes, such as "Scrubbed for
the day." or "Now targeting Mar 5 at 12:34 UTC"), saved in data/history/ll2_flown.json (three pages of 100, December 2025 to November 2026).
For each rocket, each rocket family and each provider it counts, over the launches that flew:
  scrubbed   launches with at least one scrub in their notes ("Scrubbed for the day.", "Scrub", "scrubbed")
  late_move  launches that got a new target day in their last 72 hours (a "Now targeting <day>" or "NET <day>" note within 72 hours of
             liftoff naming another day than the note before it; a new time on the same day does not count)
  watched    launches whose notes follow the countdown (a GO, a hold, the weather, a new T-0, a webcast or a scrub); a group where fewer
             than half are watched is not given odds, since its notes are too thin to show a scrub (Launch Library rarely hears of
             scrubs in China, for one)
  to_retry   for launches that scrubbed, the hours from the last scrub note to liftoff (the median says when the next try usually is)
Nothing is estimated or invented: a group with fewer than MIN_N flights is shown as too few to say, with its count. The page always shows
the sample size and the dates. The notes are written by people and can miss a scrub, so the numbers are a floor, and the page says so.
"""
import argparse
import json
import pathlib
import re
import statistics
from datetime import datetime, timedelta

ROOT = pathlib.Path(__file__).resolve().parent.parent
MIN_N = 8
SCRUB = re.compile(r"\bscrub", re.I)
MOVE = re.compile(r"^(?:Now targeting|NET)\s+([A-Z][a-z]{2})[a-z]*\.? (\d{1,2})\b")
MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split()
# a countdown the notes follow closely: a GO, a hold, the weather, a new T-0 or a webcast; without such notes a launch's log is too thin to
# say whether it scrubbed (Launch Library rarely hears of scrubs in China, for one)
WATCHED = re.compile(r"GO for launch|\bhold\b|weather|T-0|Webcast|scrub", re.I)


def _dt(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except ValueError:
        return None


def dehyphen(s):
    return re.sub(r"(?<=\w)-(?=\w)", " ", str(s or ""))


def family(rocket):
    """Atlas V 551 and Atlas V 541 are one family; Falcon 9 stays Falcon 9; Long March 2D stays Long March 2D"""
    r = dehyphen(rocket)
    return re.sub(r"\s+(\d{3}|N\d{2,3}|Block \d+|\(.*\))$", "", r).strip()


def one(l):
    """what the notes say about one flown launch: scrubbed, moved late, hours from its last scrub to liftoff"""
    t0 = _dt(l.get("net"))
    ups = [(u, _dt(u.get("at"))) for u in l.get("updates") or [] if _dt(u.get("at"))]
    scrubs = [a for u, a in ups if SCRUB.search(u.get("text") or "") and not re.search(r"\bno scrub|scrub avoided", u.get("text") or "", re.I)]
    scrubs = [a for a in scrubs if not t0 or a <= t0]
    # a new target day in the last 72 hours: a "Now targeting <day>" note whose day differs from the day the one before it named
    late, prev = False, None
    for u, a in sorted(ups, key=lambda x: x[1]):
        m = MOVE.search(u.get("text") or "")
        if not m or m.group(1) not in MONTHS:
            continue
        d = (MONTHS.index(m.group(1)), int(m.group(2)))
        if prev and d != prev and t0 and timedelta(0) <= t0 - a <= timedelta(hours=72):
            late = True
        prev = d
    retry = (t0 - max(scrubs)).total_seconds() / 3600 if scrubs and t0 else None
    watched = any(WATCHED.search(u.get("text") or "") for u, a in ups)
    return bool(scrubs), late, retry, watched


def stats(launches):
    flown = [l for l in launches if l.get("status") in ("Success", "Failure", "Partial Failure") and _dt(l.get("net"))]
    groups = {}
    for l in flown:
        s, m, r, w = one(l)
        for key in ("rocket:" + dehyphen(l.get("rocket")), "family:" + family(l.get("rocket")), "provider:" + str(l.get("provider") or "")):
            g = groups.setdefault(key, {"n": 0, "scrubbed": 0, "late_move": 0, "watched": 0, "retry": [], "from": l["net"], "to": l["net"]})
            g["n"] += 1
            g["watched"] += w
            g["scrubbed"] += s
            g["late_move"] += m
            if r is not None:
                g["retry"].append(r)
            g["from"], g["to"] = min(g["from"], l["net"]), max(g["to"], l["net"])
    out = {}
    for k, g in groups.items():
        out[k] = {"n": g["n"], "scrubbed": g["scrubbed"], "late_move": g["late_move"], "watched": g["watched"], "from": g["from"][:10], "to": g["to"][:10],
                  "retry_h": round(statistics.median(g["retry"])) if len(g["retry"]) >= 3 else None, "retry_n": len(g["retry"])}
    return out, len(flown)


def odds_for(odds, veh, provider_names):
    """the most specific group with enough flights: the rocket, its family, then the provider (by its Launch Library names); else the most
    specific group there is, marked too few"""
    keys = ["rocket:" + dehyphen(veh), "family:" + family(veh)] + ["provider:" + n for n in provider_names]
    have = [(k, odds["groups"][k]) for k in keys if k in odds.get("groups", {})]
    for k, g in have:
        if g["n"] >= MIN_N and g["watched"] * 2 >= g["n"]:
            return dict(g, key=k, enough=True)
    return dict(have[0][1], key=have[0][0], enough=False) if have else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--history", default=str(ROOT / "data/history/ll2_flown.json"))
    ap.add_argument("--out", default=str(ROOT / "data/history/odds.json"))
    a = ap.parse_args()
    h = json.loads(pathlib.Path(a.history).read_text(encoding="utf-8"))
    groups, n = stats(h["launches"])
    out = {"source": h.get("source"), "flown": n, "min_n": MIN_N, "groups": dict(sorted(groups.items()))}
    pathlib.Path(a.out).write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    f9 = groups.get("rocket:Falcon 9", {})
    print(f"odds: {n} flown launches, {len(groups)} groups; Falcon 9 {f9.get('scrubbed')}/{f9.get('n')} scrubbed, {f9.get('late_move')} moved late")


if __name__ == "__main__":
    main()
