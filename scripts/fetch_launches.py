"""Fetch upcoming launches from Launch Library 2 (The Space Devs) and write launches.json.

Usage: python3 scripts/fetch_launches.py OUT.json [--from-file RAW.json]

The output is a small, normalized feed the site reads at load time. Exits with
status 1 and writes nothing if the API cannot be reached, so the caller can keep
the previous feed.
"""
import json
import math
import re
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

API = ("https://ll.thespacedevs.com/2.2.0/launch/upcoming/"
       "?limit=40&mode=detailed&hide_recent_previous=true")
MAX_LAUNCHES = 20

PROVIDERS = [  # (substring of provider name, key)
    ("spacex", "spacex"),
    ("blue origin", "blue"),
    ("united launch alliance", "ula"),
    ("rocket lab", "rocketlab"),
    ("national aeronautics", "nasa"),
]
STATE_TZ = {
    "FL": "America/New_York", "VA": "America/New_York", "CA": "America/Los_Angeles",
    "TX": "America/Chicago", "NM": "America/Denver", "AK": "America/Anchorage",
    "HI": "Pacific/Honolulu",
}
STATUS = {"go": "go", "tbc": "tbd", "tbd": "tbd", "hold": "hold"}


def vehicle_key(name):
    n = name.lower()
    for needle, key in (("falcon heavy", "FH"), ("falcon 9", "F9"), ("starship", "SS"),
                        ("new glenn", "NG"), ("vulcan", "VUL"), ("electron", "EL")):
        if needle in n:
            return key
    return "GEN"


def provider_key(name):
    n = (name or "").lower()
    for needle, key in PROVIDERS:
        if needle in n:
            return key
    return "other"


def inclination(mission_name, orbit_abbrev, orbit_name, lat):
    """Rough target inclination in degrees, used only to choose a launch direction."""
    o = f"{orbit_abbrev or ''} {orbit_name or ''}".lower()
    if "starlink" in mission_name.lower():
        return 70.0 if lat > 33 else 53.2
    if any(k in o for k in ("sso", "sun-synchronous", "polar")):
        return 97.5
    if any(k in o for k in ("gto", "geo", "transfer", "heliocentric", "escape", "lunar", "mars", "tli")):
        return abs(lat)  # due east
    return 51.6


def azimuth(inc, lat, lon, vkey):
    if vkey == "SS":
        return 97.0
    ratio = max(-1.0, min(1.0, math.cos(math.radians(inc)) / math.cos(math.radians(lat))))
    a = math.degrees(math.asin(ratio))
    west_coast = lon < -100 and lat > 30
    if inc >= 90 or west_coast:
        return round((180 - a) % 360, 1)
    return round(a % 360, 1)


def tz_for(location_name):
    m = re.search(r",\s*([A-Z]{2}),\s*USA", location_name or "")
    return STATE_TZ.get(m.group(1), "UTC") if m else "UTC"


def state_of(location_name):
    m = re.search(r",\s*([A-Z]{2}),\s*USA", location_name or "")
    return m.group(1) if m else ""


def pick_video(item):
    urls = [v.get("url") for v in (item.get("vidURLs") or []) if v.get("url")]
    for u in urls:
        if "youtube.com" in u or "youtu.be" in u:
            return u
    return urls[0] if urls else None


def normalize(item, now):
    status = STATUS.get(((item.get("status") or {}).get("abbrev") or "").lower())
    if not status:
        return None
    net = item.get("net")
    if not net:
        return None
    when = datetime.fromisoformat(net.replace("Z", "+00:00"))
    if when < now - timedelta(minutes=30):
        return None
    pad = item.get("pad") or {}
    try:
        lat, lon = float(pad["latitude"]), float(pad["longitude"])
    except (KeyError, TypeError, ValueError):
        return None
    cfg = ((item.get("rocket") or {}).get("configuration")) or {}
    full_name = item.get("name") or ""
    veh = cfg.get("name") or full_name.split("|")[0].strip()
    vkey = vehicle_key(veh)
    orbit = ((item.get("mission") or {}).get("orbit")) or {}
    orbit_name = orbit.get("name") or ""
    low = f"{veh} {cfg.get('family') or ''} {orbit_name}".lower()
    if vkey == "GEN" and any(k in low for k in ("new shepard", "sounding", "suborbital")):
        return None  # suborbital hops do not fit the orbital flight model
    mission_name = ((item.get("mission") or {}).get("name")
                    or (full_name.split("|", 1)[1].strip() if "|" in full_name else full_name))
    lsp = item.get("launch_service_provider") or {}
    pkey = provider_key(lsp.get("name"))
    loc = (pad.get("location") or {})
    loc_name = loc.get("name") or ""
    pad_name = pad.get("name") or "Launch pad"
    prob = item.get("probability")
    out = {
        "id": item.get("id"),
        "prov": pkey,
        "orbit": re.sub(r"\s+Orbit$", "", orbit_name) or "To be announced",
        "go": prob if isinstance(prob, int) and 0 <= prob <= 100 else None,
        "v": vkey,
        "veh": veh,
        "mis": mission_name,
        "site": f"pad{pad.get('id')}",
        "pad": {"n": pad_name, "full": f"{pad_name}, {loc_name}".strip(", "),
                "lat": lat, "lon": lon, "st": state_of(loc_name)},
        "az": azimuth(inclination(mission_name, orbit.get("abbrev"), orbit_name, lat), lat, lon, vkey),
        "utc": when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tz": tz_for(loc_name),
        "st": status,
        "vid": pick_video(item),
    }
    if pkey == "other":
        out["pv"] = {"n": lsp.get("name") or "Launch provider",
                     "site": lsp.get("info_url") or lsp.get("url") or "https://thespacedevs.com/",
                     "yt": "https://www.youtube.com/results?search_query="
                           + (lsp.get("name") or "rocket launch").replace(" ", "+") + "+launch+live",
                     "d": ""}
    return out


def build(raw, now=None):
    now = now or datetime.now(timezone.utc)
    launches = []
    for item in raw.get("results", []):
        try:
            n = normalize(item, now)
        except Exception as exc:  # one odd record must not sink the feed
            print(f"skipped {item.get('id')}: {exc}", file=sys.stderr)
            continue
        if n:
            launches.append(n)
    launches.sort(key=lambda l: l["utc"])
    return {
        "generated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "Launch Library 2, The Space Devs (thespacedevs.com)",
        "launches": launches[:MAX_LAUNCHES],
    }


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    out_path = argv[1]
    if "--from-file" in argv:
        raw = json.load(open(argv[argv.index("--from-file") + 1]))
    else:
        req = urllib.request.Request(API, headers={"User-Agent": "astro-radar-site (github.com/SergiusCommodus/astro-radar)"})
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                raw = json.load(r)
        except Exception as exc:
            print(f"fetch failed: {exc}", file=sys.stderr)
            return 1
    feed = build(raw)
    if not feed["launches"]:
        print("feed had no usable launches", file=sys.stderr)
        return 1
    with open(out_path, "w") as f:
        json.dump(feed, f, separators=(",", ":"))
    print(f"wrote {len(feed['launches'])} launches to {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
