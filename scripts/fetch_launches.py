"""Fetch upcoming launches from Launch Library 2 (The Space Devs) and write launches.json.

Usage: python3 scripts/fetch_launches.py OUT.json [--from-file RAW.json] [--now 2026-10-27T12:00:00Z]
                                          [--prev-feed OLD.json] [--prev-changes OLD_CHANGES.json]

The output is a small, normalized feed the site reads at load time. Exits with
status 1 and writes nothing if the API cannot be reached, so the caller can keep
the previous feed. Also writes changes.json, the change log (scripts/changelog.py), next to OUT.json.

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
DESC_MAX = 400       # the mission description's length on the page (desc_of)
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


def nerd(item):
    """Optional facts, added only when Launch Library has them (the feed stays as it was for older readers): n, the provider's launch
    count including this one (agency_launch_attempt_count: set per launch, stable once the launch is listed, and present for every
    provider, so the rows' flight tag reads the same way for all of them); mt, the mission type; bst, the first stage booster's serial
    and which flight of it this is (reusable boosters only). Ported in worker/src/feed.js: change the two together."""
    o = {}
    n = item.get("agency_launch_attempt_count")
    if isinstance(n, int) and not isinstance(n, bool) and n > 0:
        o["n"] = n
    mt = (item.get("mission") or {}).get("type")
    if isinstance(mt, str) and mt.strip():
        o["mt"] = dehyphen(mt.strip())
    for st in ((item.get("rocket") or {}).get("launcher_stage") or [])[:1]:
        sn = ((st or {}).get("launcher") or {}).get("serial_number")
        if isinstance(sn, str) and sn.strip():
            b = {"sn": sn.strip()}
            fl = (st or {}).get("launcher_flight_number")
            if isinstance(fl, int) and not isinstance(fl, bool) and fl > 0:
                b["fl"] = fl
            o["bst"] = b
    return o


def desc_of(item):
    """The mission's description from Launch Library (detailed mode), as plain text for the launch page and a row's details, added only
    when there is one: tags and runs of spaces removed, a hyphen between letters or digits made a space (the page uses no hyphens),
    placeholders under 25 characters ("Details TBD.") left out, and cut to DESC_MAX characters at the end of a sentence (when that keeps
    at least 200), else at a word with an ellipsis. Lengths count characters (code points). Ported in worker/src/feed.js: change the two
    together."""
    d = (item.get("mission") or {}).get("description")
    if not isinstance(d, str):
        return {}
    d = re.sub(r"\s+", " ", re.sub(r"<[^>]*>", " ", d)).strip()
    d = re.sub(r"(?<=[A-Za-z0-9])-(?=[A-Za-z0-9])", " ", d)
    if len(d) < 25:
        return {}
    if len(d) > DESC_MAX:
        cut = d[:DESC_MAX]
        end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
        d = cut[:end + 1] if end >= 200 else cut[:cut.rfind(" ")].rstrip(",;: ") + "…"
    return {"desc": d}


LU_RE = re.compile(r"\d{4}-\d\d-\d\d[T ]\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:?\d\d)", re.ASCII)


def lu_of(item):
    """lu: when Launch Library last changed the record (last_updated), in UTC to the second. It only ever grows, so the calendar files
    number their revisions from it (SEQUENCE) and say when the event last changed. Only when it is a well formed time with an offset
    (the same rule as the Worker's parseNet). Ported in worker/src/feed.js: change the two together."""
    v = item.get("last_updated")
    if not isinstance(v, str) or not LU_RE.fullmatch(v):
        return {}
    try:
        t = datetime.fromisoformat(v.replace(" ", "T").replace("Z", "+00:00"))
    except ValueError:
        return {}
    return {"lu": t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


NP_RE = re.compile(r"[A-Z0-9]{1,4}", re.ASCII)
DUR_RE = re.compile(r"([+-])?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)(?:\.\d+)?S)?)?", re.ASCII)
TL_MAX = 40          # timeline entries kept per launch
TL_TEXT = 60         # characters kept of each timeline entry's name
DUR_MAX = 10 ** 8     # seconds; a longer offset is not a real timeline entry (and keeps the Worker's numbers exact)


def utc_of(v):
    """A Launch Library time (an ISO 8601 time with an offset, the rule of LU_RE) in UTC to the second, else None."""
    if not isinstance(v, str) or not LU_RE.fullmatch(v):
        return None
    try:
        t = datetime.fromisoformat(v.replace(" ", "T").replace("Z", "+00:00"))
    except ValueError:
        return None
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def duration_s(v):
    """An ISO 8601 duration relative to T0 (-PT35M33S, PT2M30S, -P1DT2H, P0D) as whole seconds, negative before liftoff; None if it is not
    one (fractions of a second are dropped)."""
    if not isinstance(v, str):
        return None
    m = DUR_RE.fullmatch(v)
    if not m or not any(m.group(i) for i in range(2, 6)) or v.endswith("T"):
        return None
    d, h, mi, s = (int(m.group(i) or 0) for i in range(2, 6))
    n = ((d * 24 + h) * 60 + mi) * 60 + s
    if n > DUR_MAX:
        return None
    return -n if m.group(1) == "-" else n


def landing(item):
    """land: the first stage's landing when one is attempted (rocket.launcher_stage[0].landing): t, its type (RTLS, ASDS, ATL, OCEAN), at,
    the place's short name (LZ-1, OCISLY, OLM-B), n, the place's name; each only when given. Ported in worker/src/feed.js."""
    for st in ((item.get("rocket") or {}).get("launcher_stage") or [])[:1]:
        ld = (st or {}).get("landing") if isinstance(st, dict) else None
        if not isinstance(ld, dict) or ld.get("attempt") is not True:
            return {}
        loc = ld.get("location") if isinstance(ld.get("location"), dict) else {}
        typ = ld.get("type") if isinstance(ld.get("type"), dict) else {}
        o = {}
        for k, v in (("t", typ.get("abbrev")), ("at", loc.get("abbrev")), ("n", loc.get("name"))):
            if isinstance(v, str) and v.strip():
                o[k] = v.strip()
        return {"land": o} if o else {}
    return {}


def extras(item):
    """Optional facts for the trust strip, the sonic boom note and the timeline (docs/LOOKUP.md), each only when Launch Library has it:
    np, how precise the time is (net_precision.abbrev: SEC, MIN, HR, DAY, M, Q4, Y); ws and we, the launch window in UTC when it is not
    zero length; land (landing()); tl, the timeline as [seconds from T0, name] sorted by time, at most TL_MAX. Ported in
    worker/src/feed.js: change the two together."""
    o = {}
    npv = item.get("net_precision")
    ab = npv.get("abbrev") if isinstance(npv, dict) else None
    if isinstance(ab, str) and NP_RE.fullmatch(ab):
        o["np"] = ab
    ws, we = utc_of(item.get("window_start")), utc_of(item.get("window_end"))
    if ws and we and ws != we:
        o["ws"], o["we"] = ws, we
    o.update(landing(item))
    tl = []
    raw_tl = item.get("timeline")
    for e in raw_tl if isinstance(raw_tl, list) else []:
        if not isinstance(e, dict):
            continue
        sec = duration_s(e.get("relative_time"))
        typ = e.get("type")
        ab = typ.get("abbrev") if isinstance(typ, dict) else None
        if sec is None or not isinstance(ab, str) or not ab.strip():
            continue
        tl.append([sec, ab.strip()[:TL_TEXT].strip()])
    tl.sort(key=lambda x: x[0])
    if tl:
        o["tl"] = tl[:TL_MAX]
    return o


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
    out.update(nerd(item))
    out.update(desc_of(item))
    out.update(lu_of(item))
    out.update(extras(item))
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
    out.update(desc_of(item))
    out.update(landing(item))
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


ISS_URL = "https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle"
TLE_LINE = re.compile(r"^[12] 25544U?[ 0-9A-Z.+-]{60,67}$")


def iss_from(text, now):
    """the ISS's two line elements from CelesTrak's answer, with their epoch; None unless both lines look right"""
    lines = [l.strip() for l in (text or "").splitlines() if l.strip()]
    l1 = next((l for l in lines if l.startswith("1 25544")), None)
    l2 = next((l for l in lines if l.startswith("2 25544")), None)
    if not l1 or not l2 or not TLE_LINE.match(l1) or not TLE_LINE.match(l2):
        return None
    yy, day = int(l1[18:20]), float(l1[20:32])
    epoch = datetime(2000 + yy if yy < 57 else 1900 + yy, 1, 1, tzinfo=timezone.utc) + timedelta(days=day - 1)
    return {"tle": [l1, l2], "epoch": epoch.strftime("%Y-%m-%dT%H:%M:%SZ"), "at": now.strftime("%Y-%m-%dT%H:%M:%SZ")}


def iss_last_good(out_path):
    """the elements the last good feed had (the output file, else the live site's), marked stale"""
    for read in (lambda: Path(out_path).read_text(encoding="utf-8"),
                 lambda: urllib.request.urlopen(urllib.request.Request("https://astroradar.io/launches.json", headers={"User-Agent": "astro-radar-site"}), timeout=20).read().decode()):
        try:
            v = json.loads(read()).get("iss")
            if isinstance(v, dict) and v.get("tle"):
                return dict(v, stale=True)
        except Exception:  # noqa: BLE001 - either may be missing
            pass
    return None


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
    # the ISS's orbital elements for the pass card (CelesTrak, no key; --iss-file reads a saved answer, for tests). A failed fetch keeps
    # the last good elements, marked stale; the page shows passes only from elements under ten days old
    iss = None
    try:
        if "--iss-file" in argv:
            text = Path(argv[argv.index("--iss-file") + 1]).read_text(encoding="utf-8")
        elif "--from-file" in argv:
            text = None
        else:
            req = urllib.request.Request(ISS_URL, headers={"User-Agent": "astro-radar-site (github.com/SergiusCommodus/astro-radar)"})
            with urllib.request.urlopen(req, timeout=30) as r:
                text = r.read().decode("utf-8", "replace")
        iss = iss_from(text, now or datetime.now(timezone.utc)) if text is not None else None
    except Exception as exc:  # noqa: BLE001 - the launches matter more than the ISS
        print(f"ISS elements: fetch failed ({exc})", file=sys.stderr)
    if iss is None and "--from-file" not in argv:
        iss = iss_last_good(out_path)
    if iss:
        feed["iss"] = iss
    # the change log (scripts/changelog.py): what differs from the previous feed, added to the previous changes.json and written next to
    # the output. The previous files come from --prev-feed and --prev-changes (tests), else the output folder, else the live site; a run
    # on a saved answer (--from-file) with neither flag never touches the network and starts empty
    try:
        import changelog
        if "--prev-feed" in argv or "--prev-changes" in argv:
            def arg_json(flag):
                if flag not in argv:
                    return None
                try:
                    v = json.loads(Path(argv[argv.index(flag) + 1]).read_text(encoding="utf-8"))
                    return v if isinstance(v, dict) else None
                except (OSError, ValueError):
                    return None
            prev_feed, prev_changes = arg_json("--prev-feed"), arg_json("--prev-changes")
        elif "--from-file" in argv:
            prev_feed, prev_changes = None, None
        else:
            prev_feed, prev_changes = changelog.last_good(out_path)
        changelog.run(out_path, feed, now or datetime.now(timezone.utc), prev_feed, prev_changes)
    except Exception as exc:  # noqa: BLE001 - the launches matter more than the change log
        print(f"change log: not written ({exc})", file=sys.stderr)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(feed, f, separators=(",", ":"))
    print(f"wrote {len(feed['launches'])} launches to {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
