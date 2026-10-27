"""Fetch upcoming launches from Launch Library 2 (The Space Devs) and write launches.json.

Usage: python3 scripts/fetch_launches.py OUT.json [--from-file RAW.json] [--now 2026-10-27T12:00:00Z]

The output is a small, normalized feed the site reads at load time. Exits with
status 1 and writes nothing if the API cannot be reached, so the caller can keep
the previous feed.

worker/src/feed.js is the same normalizer in JavaScript (the Cloudflare Worker serves the live feed with it); keep the two
identical. worker/test/parity.test.mjs runs both on the same raw file and compares the output.
"""
import json
import math
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Launch Library 2 allows 15 anonymous requests an hour. A run makes one request (two only when more than 100 launches fall
# in the window), and the workflow runs every 30 minutes, so the feed stays well inside the limit. One request covers the
# next 30 days and the last 7 (upcoming launches, and the recent ones with their result), ordered by launch time
API = "https://ll.thespacedevs.com/2.2.0/launch/"
WINDOW_DAYS = 30
RECENT_DAYS = 7
MAX_RECENT = 40
PAGE = 100
MAX_PAGES = 2
MAX_LAUNCHES = 150

# provider keys and the Launch Library 2 names they match come from data/providers.json, the same file the page shows
PROVIDERS = [(m, p["key"]) for p in json.loads((Path(__file__).resolve().parent.parent / "data/providers.json")
                                               .read_text(encoding="utf-8"))["providers"] for m in p["match"]]
STATE_TZ = {
    "FL": "America/New_York", "VA": "America/New_York", "CA": "America/Los_Angeles",
    "TX": "America/Chicago", "NM": "America/Denver", "AK": "America/Anchorage",
    "HI": "Pacific/Honolulu",
}
# go, to be confirmed (Launch Library's TBC and TBD), hold, and flight for a launch that has left the pad (it stays listed until
# 30 minutes after liftoff). Launch Library has no scrub status: a scrub shows as a new launch time or a status back to TBC
STATUS = {"go": "go", "tbc": "tbd", "tbd": "tbd", "hold": "hold", "in flight": "flight"}
# the result of a launch that has flown
RESULT = {"success": "success", "failure": "failure", "partial failure": "partial"}


def vehicle_key(name):
    """Flight profile key for the model in src/model.js; GEN is a generic orbital climb for vehicles without a profile of
    their own (normalize switches it to SUB, a straight up and down hop like New Shepard's, for other suborbital rockets)."""
    n = name.lower()
    for needle, key in (("falcon heavy", "FH"), ("falcon 9", "F9"), ("starship", "SS"), ("new glenn", "NG"),
                        ("new shepard", "NS"), ("vulcan", "VUL"), ("electron", "EL"), ("haste", "EL")):
        if needle in n:
            return key
    return "GEN"


def provider_key(name):
    n = (name or "").lower()
    for needle, key in PROVIDERS:
        if needle in n:
            return key
    return "other"


def southeast_starlink(mission_name, lat):
    """Cape Starlink Group 6 goes to a 43 degree shell and flies southeast."""
    m = re.search(r"group\s*(\d+)", mission_name.lower())
    return lat < 33 and "starlink" in mission_name.lower() and bool(m) and m.group(1) == "6"


def inclination(mission_name, orbit_abbrev, orbit_name, lat):
    """Rough target inclination in degrees, used only to choose a launch direction."""
    o = f"{orbit_abbrev or ''} {orbit_name or ''}".lower()
    if "starlink" in mission_name.lower():
        if lat > 33:
            return 70.0
        return 43.0 if southeast_starlink(mission_name, lat) else 53.2
    if any(k in o for k in ("sso", "sun-synchronous", "polar")):
        return 97.5
    if any(k in o for k in ("gto", "geo", "transfer", "heliocentric", "escape", "lunar", "mars", "tli")):
        return abs(lat)  # due east
    return 51.6


def azimuth(inc, lat, lon, vkey, south=False):
    if vkey == "SS":
        return 97.0
    ratio = max(-1.0, min(1.0, math.cos(math.radians(inc)) / math.cos(math.radians(lat))))
    a = math.degrees(math.asin(ratio))
    west_coast = lon < -100 and lat > 30
    if inc >= 90 or west_coast or south:
        return round((180 - a) % 360, 1)
    return round(a % 360, 1)


def tz_for(location_name):
    m = re.search(r",\s*([A-Z]{2}),\s*USA", location_name or "")
    return STATE_TZ.get(m.group(1), "UTC") if m else "UTC"


def state_of(location_name):
    m = re.search(r",\s*([A-Z]{2}),\s*USA", location_name or "")
    return m.group(1) if m else ""


def dehyphen(name):
    """Pad and rocket names as shown on the page, which uses no hyphens (LC-39A reads LC 39A)."""
    return re.sub(r"\s*-\s*", " ", name or "").strip()


def https_only(u):
    return u if isinstance(u, str) and re.fullmatch(r"https://[^\s\"'<>]+", u) else None


PLATFORMS = {"youtube.com": "YouTube", "youtu.be": "YouTube", "x.com": "X", "twitter.com": "X", "plus.nasa.gov": "NASA+"}


def platform(url):
    host = urllib.parse.urlsplit(url).hostname or ""
    for dom, name in PLATFORMS.items():
        if host == dom or host.endswith("." + dom):
            return name
    return ""


def pick_video(item):
    """The launch's own webcast and a label for where it streams (for example "SpaceX on X" or "NASA on YouTube").
    Fan restreams are skipped so the button always opens an official broadcast; among the rest the highest
    Launch Library priority wins, English first."""
    best = None
    for v in item.get("vidURLs") or []:
        u = https_only(v.get("url"))
        kind = ((v.get("type") or {}).get("name") or "").lower()
        if not u or "unofficial" in kind:
            continue
        lang = ((v.get("language") or {}).get("code") or "en").lower()
        rank = (lang == "en", v.get("priority") or 0)
        if best is None or rank > best[0]:
            pub = v.get("publisher")
            pub = (pub.get("name") if isinstance(pub, dict) else pub) or ""
            best = (rank, u, pub.strip())
    if not best:
        return None, None
    _, url, pub = best
    plat = platform(url) or (urllib.parse.urlsplit(url).hostname or "").removeprefix("www.")
    if plat == "NASA+" or not pub:
        return url, plat or None
    return url, f"{pub} on {plat}"


def pick_info(item):
    """The launch's own official page (SpaceX and Rocket Lab publish one per mission), if listed."""
    for v in item.get("infoURLs") or []:
        u = https_only(v.get("url"))
        if u:
            return u
    return None


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
    if lat == 0 and lon == 0:
        return None  # no usable location, so the flight path cannot be modeled
    cfg = ((item.get("rocket") or {}).get("configuration")) or {}
    full_name = item.get("name") or ""
    veh = cfg.get("name") or full_name.split("|")[0].strip()
    vkey = vehicle_key(veh)
    orbit = ((item.get("mission") or {}).get("orbit")) or {}
    orbit_name = orbit.get("name") or ""
    low = f"{veh} {cfg.get('family') or ''} {orbit_name}".lower()
    if vkey == "GEN" and any(k in low for k in ("sounding", "suborbital")):
        vkey = "SUB"
    mission_name = ((item.get("mission") or {}).get("name")
                    or (full_name.split("|", 1)[1].strip() if "|" in full_name else full_name))
    lsp = item.get("launch_service_provider") or {}
    pkey = provider_key(lsp.get("name"))
    loc = (pad.get("location") or {})
    loc_name = loc.get("name") or ""
    pad_name = pad.get("name") or "Launch pad"
    if pad_name.lower().startswith("unknown"):
        # the pad is not picked yet (Rocket Lab often lists its Mahia complex this way) but the site coordinates are known
        pad_name = loc_name.split(",")[0].strip() or "Launch site"
        loc_name = loc_name[len(pad_name):].lstrip(", ")
    prob = item.get("probability")
    vid, vsrc = pick_video(item)
    out = {
        "id": item.get("id"),
        "prov": pkey,
        "orbit": dehyphen(re.sub(r"\s+Orbit$", "", orbit_name)) or "To be announced",
        "go": prob if isinstance(prob, int) and 0 <= prob <= 100 else None,
        "v": vkey,
        "veh": dehyphen(veh),
        "mis": mission_name,
        "site": f"pad{pad.get('id')}",
        "pad": {"n": dehyphen(pad_name), "full": dehyphen(f"{pad_name}, {loc_name}".strip(", ")),
                "lat": lat, "lon": lon, "st": state_of(loc_name)},
        "az": azimuth(inclination(mission_name, orbit.get("abbrev"), orbit_name, lat), lat, lon, vkey,
                      southeast_starlink(mission_name, lat)),
        "utc": when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "tz": tz_for(loc_name),
        "st": status,
        "vid": vid,
        "vsrc": vsrc,
        "info": pick_info(item),
    }
    if pkey == "other":
        # a provider outside data/providers.json: its name and the official site Launch Library lists (lsp["url"] is an API
        # endpoint, never a web page). No channel is guessed, so without a webcast in the feed the page says none is listed
        out["pv"] = {"n": lsp.get("name") or "Launch provider", "site": https_only(lsp.get("info_url"))}
    return out


def normalize_recent(item, now):
    """A launch from the last 7 days with its result, for the Recent launches strip (no flight path is needed)."""
    res = RESULT.get(((item.get("status") or {}).get("abbrev") or "").lower())
    net = item.get("net")
    if not res or not net:
        return None
    when = datetime.fromisoformat(net.replace("Z", "+00:00"))
    if when < now - timedelta(days=RECENT_DAYS) or when > now + timedelta(minutes=5):
        return None
    pad = item.get("pad") or {}
    cfg = ((item.get("rocket") or {}).get("configuration")) or {}
    full_name = item.get("name") or ""
    veh = cfg.get("name") or full_name.split("|")[0].strip()
    mission_name = ((item.get("mission") or {}).get("name")
                    or (full_name.split("|", 1)[1].strip() if "|" in full_name else full_name))
    lsp = item.get("launch_service_provider") or {}
    pkey = provider_key(lsp.get("name"))
    loc_name = (pad.get("location") or {}).get("name") or ""
    pad_name = pad.get("name") or "Launch pad"
    if pad_name.lower().startswith("unknown"):
        pad_name = loc_name.split(",")[0].strip() or "Launch site"
        loc_name = loc_name[len(pad_name):].lstrip(", ")
    vid, vsrc = pick_video(item)
    out = {
        "id": item.get("id"),
        "prov": pkey,
        "veh": dehyphen(veh),
        "mis": mission_name,
        "pad": {"n": dehyphen(pad_name), "full": dehyphen(f"{pad_name}, {loc_name}".strip(", "))},
        "utc": when.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "res": res,
        "vid": vid,
        "vsrc": vsrc,
        "info": pick_info(item),
    }
    if pkey == "other":
        out["pv"] = {"n": lsp.get("name") or "Launch provider", "site": https_only(lsp.get("info_url"))}
    return out


def build(raw, now=None):
    now = now or datetime.now(timezone.utc)
    horizon = (now + timedelta(days=WINDOW_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    launches, recent = [], []
    for item in raw.get("results", []):
        try:
            n = normalize(item, now)
            r = None if n else normalize_recent(item, now)
        except Exception as exc:  # one odd record must not sink the feed
            print(f"skipped {item.get('id')}: {exc}", file=sys.stderr)
            continue
        if n and n["utc"] <= horizon:
            launches.append(n)
        if r:
            recent.append(r)
    launches.sort(key=lambda l: l["utc"])
    recent.sort(key=lambda l: l["utc"], reverse=True)
    return {
        "generated": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "Launch Library 2, The Space Devs (thespacedevs.com)",
        "launches": launches[:MAX_LAUNCHES],
        "recent": recent[:MAX_RECENT],
    }


def fetch():
    now = datetime.now(timezone.utc)
    fmt = "%Y-%m-%dT%H:%M:%SZ"
    url = API + "?" + urllib.parse.urlencode({"limit": PAGE, "mode": "detailed", "ordering": "net",
                                              "net__gte": (now - timedelta(days=RECENT_DAYS)).strftime(fmt),
                                              "net__lte": (now + timedelta(days=WINDOW_DAYS)).strftime(fmt)})
    results = []
    for _ in range(MAX_PAGES):
        req = urllib.request.Request(url, headers={"User-Agent": "astro-radar-site (github.com/SergiusCommodus/astro-radar)"})
        with urllib.request.urlopen(req, timeout=40) as r:
            page = json.load(r)
        results += page.get("results") or []
        url = page.get("next")
        if not url or not url.startswith("https://ll.thespacedevs.com/"):
            break
    return {"results": results}


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    out_path = argv[1]
    if "--from-file" in argv:
        with open(argv[argv.index("--from-file") + 1], encoding="utf-8") as f:
            raw = json.load(f)
    else:
        try:
            raw = fetch()
        except Exception as exc:  # includes HTTP 429 once the hourly limit is used up; the caller keeps the last good feed
            print(f"fetch failed: {exc}", file=sys.stderr)
            return 1
    now = None
    if "--now" in argv:  # a fixed clock, for tests
        now = datetime.fromisoformat(argv[argv.index("--now") + 1].replace("Z", "+00:00"))
    feed = build(raw, now)
    if not feed["launches"]:
        print("feed had no usable launches", file=sys.stderr)
        return 1
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(feed, f, separators=(",", ":"))
    print(f"wrote {len(feed['launches'])} launches to {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
