"""Space today: a few things from NASA for the bottom of the Launches tab, fetched at build time into data/nasa.json (and small images
into data/nasa/), read by build.py.

    python3 scripts/fetch_nasa.py [--feed dist/launches.json] [--from-dir tests/nasa] [--now 2026-11-09T12:00:00Z]

The key comes only from the environment (NASA_API_KEY), else NASA's public DEMO_KEY (30 requests an hour, 50 a day per address; a run
makes at most seven). It is never written to a file, printed or sent to the page: errors are reported with it removed.

Sources (each tried on its own; one that fails keeps its last good entry in data/nasa.json, marked stale, and one that never worked is
left out, so the page shows only what it has):
  epic     the latest natural color Earth from NASA's EPIC camera on DSCOVR (epic.gsfc.nasa.gov, no key): the thumbnail is saved
  sun      space weather from NOAA's Space Weather Prediction Center (services.swpc.noaa.gov, no key): the X ray flares of the last 3
           days (GOES), the planetary Kp index (now and its highest of the last 3 days) and NOAA's R, S and G scales today, with a rough
           aurora outlook. (NASA's DONKI answered 404 through api.nasa.gov and never answered on its own host in November 2026, so it went)
  events   NASA EONET open natural events of the last 30 days (wildfires, storms, volcanoes, ice; eonet.gsfc.nasa.gov, no key)
  apod     the Astronomy Picture of the Day: embedded (the image saved at 640 px) only when it carries no copyright notice and is an
           image; otherwise a link out with its credit
  neo      NASA JPL close approaches in the next 7 days within 0.05 au (ssd-api.jpl.nasa.gov, no key): how many, the closest, its size
           estimated from its brightness (NeoWs needed a key and answered 429 to the demo key)
  missions for each NASA launch in the feed (--feed), the first photo NASA's Image and Video Library finds for its mission name (no key)

Also writes data/news.json: the latest headlines from the Spaceflight News API (api.spaceflightnewsapi.net, no key, by The Space Devs),
grouped as launches, missions and science, each only its headline, publisher, date, a one line snippet and the link out.

--from-dir reads saved responses (epic.json, swpc_kp.json, swpc_flares.json, swpc_scales.json, eonet.json, news.json, apod.json, neo.json,
images.json) instead of the network, for tests.
"""
import io
import json
import os
import pathlib
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(os.environ.get("NASA_OUT") or ROOT / "data" / "nasa.json")  # (tests write elsewhere)
NEWS = OUT.parent / "news.json"
IMG = OUT.parent / "nasa"
KEY = os.environ.get("NASA_API_KEY") or "DEMO_KEY"
UA = {"User-Agent": "astro-radar-site (github.com/SergiusCommodus/astro-radar)"}
STALE_AFTER = timedelta(days=2)


def clean(msg):
    """an error message with the key taken out, whatever form the URL is in"""
    s = str(msg)
    if KEY and KEY != "DEMO_KEY":
        s = s.replace(KEY, "[key]")
    return re.sub(r"api_key=[^&\s'\"]+", "api_key=[key]", s)


class Source:
    def __init__(self, from_dir):
        self.dir = pathlib.Path(from_dir) if from_dir else None

    def json(self, name, url):
        if self.dir:
            p = self.dir / name
            if not p.exists():
                raise FileNotFoundError(name)
            return json.loads(p.read_text(encoding="utf-8"))
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            return json.load(r)

    def bytes(self, url):
        if self.dir:
            return None  # tests do not download images
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
            return r.read()


def keyed(url, **q):
    q["api_key"] = KEY
    return url + "?" + urllib.parse.urlencode(q)


def save_image(data, name, width):
    """an image saved as JPEG at most `width` wide; returns [path for the page, width, height]"""
    from PIL import Image
    im = Image.open(io.BytesIO(data)).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    IMG.mkdir(parents=True, exist_ok=True)
    im.save(IMG / name, "JPEG", quality=78, optimize=True, progressive=True)
    return ["nasa/" + name, im.width, im.height]


def epic(src, now):
    d = src.json("epic.json", "https://epic.gsfc.nasa.gov/api/natural")
    if not d:
        raise ValueError("no EPIC images")
    x = d[-1]
    when = datetime.strptime(x["date"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    url = f"https://epic.gsfc.nasa.gov/archive/natural/{when:%Y/%m/%d}/thumbs/{x['image']}.jpg"
    out = {"utc": when.strftime("%Y-%m-%dT%H:%M:%SZ"), "src": "https://epic.gsfc.nasa.gov/", "credit": "NASA EPIC team, DSCOVR"}
    c = x.get("centroid_coordinates") or {}
    if isinstance(c.get("lat"), (int, float)) and isinstance(c.get("lon"), (int, float)):
        out["lat"], out["lon"] = round(c["lat"], 1), round(c["lon"], 1)
    out["page"] = f"https://epic.gsfc.nasa.gov/?date={when:%Y-%m-%d}"
    data = src.bytes(url)
    if data:
        out["img"] = save_image(data, "epic.jpg", 240)
    big = src.bytes(f"https://epic.gsfc.nasa.gov/archive/natural/{when:%Y/%m/%d}/jpg/{x['image']}.jpg")
    if big:
        out["big"] = save_image(big, "epic-640.jpg", 640)
    return out


FLARE_ORDER = "ABCMX"


def flare_key(c):
    try:
        return (FLARE_ORDER.index(c[:1]), float(c[1:] or 0))
    except (ValueError, IndexError):
        return (-1, 0)


def sun(src, now):
    """space weather from NOAA SWPC: X ray flares of the last 3 days, the Kp index and NOAA's scales"""
    since = now - timedelta(days=3)
    flares = src.json("swpc_flares.json", "https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json")
    kp = src.json("swpc_kp.json", "https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json")
    scales = src.json("swpc_scales.json", "https://services.swpc.noaa.gov/products/noaa-scales.json")
    recent = []
    for f in flares or []:
        try:
            t = datetime.fromisoformat(str(f.get("max_time") or f.get("begin_time")).replace("Z", "+00:00"))
        except ValueError:
            continue
        if t.tzinfo is None:
            t = t.replace(tzinfo=timezone.utc)
        c = str(f.get("max_class") or "")
        if since <= t <= now and c[:1] in FLARE_ORDER:
            recent.append(c)
    n = len(recent)
    recent = sorted(set(recent), key=flare_key, reverse=True)
    # the Kp list: dicts (time_tag, Kp) in the 2026 format, or rows with a header row in the older one
    rows = []
    for r in kp or []:
        if isinstance(r, dict):
            rows.append((str(r.get("time_tag")), r.get("Kp")))
        elif isinstance(r, list) and len(r) > 1 and r[0] != "time_tag":
            rows.append((str(r[0]), r[1]))
    vals = []
    for t, v in rows:
        try:
            if t[:16] >= since.strftime("%Y-%m-%dT%H:%M") or t[:16] >= since.strftime("%Y-%m-%d %H:%M"):
                vals.append(float(v))
        except (TypeError, ValueError):
            pass
    if not rows:
        raise ValueError("no Kp values")
    try:
        kp_now = float(rows[-1][1])
    except (TypeError, ValueError):
        raise ValueError("no current Kp")
    kp_max = round(max(vals) if vals else kp_now, 1)
    kp_now = round(kp_now, 1)
    today = (scales or {}).get("0") or {}
    sc = {k: str(((today.get(k) or {}).get("Scale")) or "0") for k in ("R", "S", "G")}
    if any(c[:1] in "MX" for c in recent):
        summary = f"{n} solar flares in the last 3 days, the strongest {recent[0]}."
    elif n:
        summary = f"{n} small solar flares in the last 3 days, none strong (the strongest {recent[0]})." if n > 1 else f"One small solar flare in the last 3 days ({recent[0]})."
    else:
        summary = "A quiet Sun: no X ray flares recorded in the last 3 days."
    if kp_max >= 7:
        aurora = f"Strong geomagnetic storm (Kp {kp_max:g}): aurora may reach the northern states on a clear, dark night."
    elif kp_max >= 5:
        aurora = f"Geomagnetic storm (Kp {kp_max:g}): aurora possible far north (Alaska, Canada, the northern border) on a clear, dark night."
    else:
        aurora = f"No geomagnetic storm (Kp at most {kp_max:g} in 3 days): aurora unlikely outside the far north."
    return {"summary": summary, "aurora": aurora, "kp": kp_max, "kpNow": kp_now, "kpAt": rows[-1][0][:16].replace(" ", "T") + "Z",
            "flares": recent[:6], "flareCount": n, "scales": sc,
            "src": "https://www.swpc.noaa.gov/", "credit": "NOAA Space Weather Prediction Center"}


def events(src, now):
    """NASA EONET: the open natural events of the last 30 days, newest first (at most 6)"""
    d = src.json("eonet.json", "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=40")
    out = []
    for ev in (d or {}).get("events") or []:
        g = (ev.get("geometry") or [{}])[-1]
        cat = ((ev.get("categories") or [{}])[0]).get("title") or ""
        if not ev.get("title") or not g.get("date"):
            continue
        srcs = [x.get("url") for x in ev.get("sources") or [] if str(x.get("url") or "").startswith("https://")]
        out.append({"title": re.sub(r"\s+", " ", ev["title"]).strip()[:90], "cat": cat, "date": str(g["date"])[:10],
                    "link": srcs[0] if srcs else "https://eonet.gsfc.nasa.gov/"})
    if not out:
        raise ValueError("no open events")
    out.sort(key=lambda e: e["date"], reverse=True)
    counts = {}
    for e in out:
        counts[e["cat"]] = counts.get(e["cat"], 0) + 1
    return {"list": out[:6], "count": len(out), "cats": counts, "src": "https://eonet.gsfc.nasa.gov/", "credit": "NASA EONET"}


def demoji(t):
    """text the publisher sent in the wrong encoding (UTF-8 read as Windows-1252: â€™ for ’), put back; else unchanged"""
    if re.search("[\u00c2\u00c3\u00e2][\u0080-\u00bf\u20ac\u2122\u0153\u2018-\u201e]", t):
        try:
            return t.encode("cp1252").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return t


LAUNCH_W = re.compile(r"\b(launch\w*|lift\s?off|rocket|booster|falcon|starship|super heavy|new glenn|new shepard|vulcan|ariane|vega|electron|neutron|"
                      r"long march|kuaizhou|soyuz|angara|proton|pslv|gslv|lvm3|h3|h-?iia|firefly|static fire|scrub\w*|countdown|pad|spaceport)\b", re.I)
MISSION_W = re.compile(r"\b(mission\w*|crew\w*|astronaut\w*|cosmonaut\w*|taikonaut\w*|space station|iss|tiangong|artemis|orion|dragon|starliner|"
                       r"cygnus|progress|lander|rover|probe|spacecraft|orbiter|moon|lunar|mars|satellite\w*|spacewalk\w*|docking|docks?)\b", re.I)


def group_of(a):
    t = a["title"] + " " + a.get("snip", "")
    # by the headline's own words (the API's links to launches are too loose: a valley fog photo came linked to one)
    if LAUNCH_W.search(a["title"]):
        return "launches"
    if a.get("ev") or MISSION_W.search(t):
        return "missions"
    return "science"


def snippet(summary, title):
    t = demoji(re.sub(r"\s+", " ", summary or "")).strip()
    t = re.sub(r"The post .*? appeared first on .*?\.?$", "", t).strip()
    t = re.sub(r"\s*\[(…|\.\.\.|&#8230;)\]\s*$", "", t).strip()
    # nothing when the summary is the page's own navigation or repeats the headline (APOD's listings do both)
    if not t or title.lower()[:24] in t.lower() or re.search(r"Archive|Submissions|Index Search", t):
        return ""
    # the first sentence: a full stop after a lower case word or a number, but not after a short abbreviation (Nov., Dr., St.)
    first = re.split(r"(?<!\b[A-Z][a-z])(?<!\b[A-Z][a-z][a-z])(?<!\b[A-Z])(?<=[a-z0-9)\]”’\"'][.!?])\s+(?=[A-Z“\"'])", t)[0]
    if len(first) > 150:
        first = first[:150].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return first


def news(src, now):
    """the latest headlines from the Spaceflight News API: headline, publisher, date, one line, the link out; never the article"""
    d = src.json("news.json", "https://api.spaceflightnewsapi.net/v4/articles/?limit=40")
    out = []
    for a in (d or {}).get("results") or []:
        url, title = str(a.get("url") or ""), demoji(re.sub(r"\s+", " ", str(a.get("title") or ""))).strip()
        if not url.startswith("https://") or not title or not a.get("published_at"):
            continue
        e = {"id": a.get("id"), "title": title[:160], "site": str(a.get("news_site") or "")[:60], "url": url,
             "date": str(a["published_at"])[:19] + "Z", "snip": snippet(a.get("summary"), title)}
        if a.get("launches"):
            e["ll"] = 1
        if a.get("events"):
            e["ev"] = 1
        e["g"] = group_of(e)
        out.append(e)
    if not out:
        raise ValueError("no articles")
    out.sort(key=lambda e: e["date"], reverse=True)
    return {"list": out, "src": "https://www.spaceflightnewsapi.net/", "credit": "Spaceflight News API, The Space Devs"}


def apod(src, now):
    d = src.json("apod.json", keyed("https://api.nasa.gov/planetary/apod"))
    # (when this was written the API alternated between HTTP 500 and a stand in answer titled "NASA Science" with a tiny image, so an
    # answer counts only with a real explanation and a picture on apod.nasa.gov)
    if (not isinstance(d, dict) or not d.get("title") or not d.get("date") or len(d.get("explanation") or "") < 80
            or not re.match(r"^https://(apod\.nasa\.gov|www\.youtube\.com|player\.vimeo\.com)/", d.get("url") or "")):
        raise ValueError("no usable APOD answer: " + clean(json.dumps(d)[:120]))
    day = datetime.strptime(d["date"], "%Y-%m-%d")
    out = {"title": d["title"].strip(), "date": d["date"], "page": f"https://apod.nasa.gov/apod/ap{day:%y%m%d}.html",
           "credit": re.sub(r"\s+", " ", (d.get("copyright") or "").strip()) or "NASA", "copyright": bool(d.get("copyright"))}
    # embedded only when it is an image with no copyright notice; otherwise the card links out to APOD's own page
    if d.get("media_type") == "image" and not d.get("copyright"):
        data = src.bytes(d.get("url") or "")
        if data:
            out["img"] = save_image(data, "apod.jpg", 640)
    return out


AU_KM = 149597870.7
LD_KM = 384400


def size_m(h):
    """an asteroid's size estimated from its absolute magnitude H, for a dark (albedo 0.25) to a bright (0.05) surface, in metres"""
    return [round(1329000 / (p ** .5) * 10 ** (-h / 5)) for p in (.25, .05)]


def neo(src, now):
    """NASA JPL's close approach data (ssd-api.jpl.nasa.gov, no key): asteroids passing within 0.05 au (7.5 million km) of Earth in the
    next 7 days, the closest first. (NeoWs needs a key and answered 429 to the shared demo key, so it went)"""
    d = src.json("cad.json", "https://ssd-api.jpl.nasa.gov/cad.api?date-min=" + now.strftime("%Y-%m-%dT%H:%M:%S")
                 + "&date-max=%2B7&dist-max=0.05&sort=dist&fullname=true")
    f = (d or {}).get("fields") or []
    rows = [dict(zip(f, r)) for r in (d or {}).get("data") or []]
    if not rows:
        raise ValueError("no close approaches listed")
    best = rows[0]
    km = float(best["dist"]) * AU_KM
    when = datetime.strptime(best["cd"], "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
    return {"count": len(rows), "closest": {"name": str(best.get("des") or "").strip(), "date": when.strftime("%Y-%m-%d"), "utc": when.strftime("%Y-%m-%dT%H:%MZ"),
            "km": round(km), "ld": round(km / LD_KM, 1), "m": size_m(float(best["h"])) if best.get("h") else None,
            "kms": round(float(best["v_rel"]), 1) if best.get("v_rel") else None},
            "src": "https://cneos.jpl.nasa.gov/ca/", "credit": "NASA JPL Center for Near Earth Object Studies"}


def missions(src, now, feed_path):
    """for each NASA launch in the feed, one photo from NASA's Image and Video Library for its mission name"""
    if not feed_path or not pathlib.Path(feed_path).exists():
        return {}
    feed = json.loads(pathlib.Path(feed_path).read_text(encoding="utf-8"))
    out = {}
    for L in (feed.get("launches") or [])[:30]:
        if L.get("prov") != "nasa" or not L.get("mis") or not re.match(r"^[A-Za-z0-9_-]{1,80}$", str(L.get("id") or "")):
            continue
        d = src.json("images.json", "https://images-api.nasa.gov/search?" + urllib.parse.urlencode({"q": L["mis"], "media_type": "image", "page_size": 8}))
        for it in ((d.get("collection") or {}).get("items") or []):
            meta = (it.get("data") or [{}])[0]
            thumb = next((l.get("href") for l in it.get("links") or [] if l.get("render") == "image"), None)
            nid = meta.get("nasa_id")
            title = re.sub(r"\s+-\s+", ", ", (meta.get("title") or "").strip())[:120]
            # a photo, not a poster, logo, patch or drawing
            if not thumb or not nid or not thumb.startswith("https://images-assets.nasa.gov/") or re.search(r"poster|logo|patch|graphic|illustration|infographic|render", title, re.I):
                continue
            e = {"title": title, "page": "https://images.nasa.gov/details/" + urllib.parse.quote(nid),
                 "credit": "NASA" + (", " + meta["photographer"].strip() if meta.get("photographer") else "")}
            data = src.bytes(urllib.parse.quote(thumb, safe=":/~%?=&"))  # (the library's file names have spaces)
            if data:
                from PIL import Image
                w, h = Image.open(io.BytesIO(data)).size
                if h > w:
                    continue  # landscape only, so the launch page stays short
                e["img"] = save_image(data, "m-" + L["id"] + ".jpg", 480)
            out[L["id"]] = e
            break
        if len(out) >= 4:
            break
    return out


def main(argv):
    args = dict(zip(argv[1::2], argv[2::2])) if len(argv) > 1 else {}
    now = datetime.fromisoformat(args["--now"].replace("Z", "+00:00")) if "--now" in args else datetime.now(timezone.utc)
    src = Source(args.get("--from-dir"))
    old = {}
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding="utf-8"))
        except ValueError:
            old = {}
    data = {"generated": now.strftime("%Y-%m-%dT%H:%M:%SZ"), "note": "NASA data and images; Astro Radar is not affiliated with NASA"}
    ok = 0
    for name, fn in (("epic", epic), ("sun", sun), ("events", events), ("apod", apod), ("neo", neo)):
        try:
            v = fn(src, now)
            v["at"] = data["generated"]
            data[name] = v
            ok += 1
            print(f"{name}: ok")
        except Exception as e:  # noqa: BLE001 - every source is optional
            prev = old.get(name)
            if prev:
                prev = dict(prev, stale=True)
                data[name] = prev
            print(f"{name}: failed ({clean(e)[:160]}){', kept the last good copy' if prev else ''}", file=sys.stderr)
    try:
        data["missions"] = missions(src, now, args.get("--feed"))
    except Exception as e:  # noqa: BLE001
        data["missions"] = old.get("missions") or {}
        print(f"missions: failed ({clean(e)[:160]})", file=sys.stderr)
    # mission photos of launches that left the feed go with them
    keep = {pathlib.Path(v["img"][0]).name for v in data["missions"].values() if isinstance(v.get("img"), list)}
    for f in IMG.glob("m-*.jpg") if IMG.exists() else []:
        if f.name not in keep:
            f.unlink()
    text = json.dumps(data, indent=1, ensure_ascii=False)
    assert KEY == "DEMO_KEY" or KEY not in text
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text + "\n", encoding="utf-8")
    print(f"wrote {OUT.name}: {ok} of 5 sources fresh, {len(data['missions'])} mission photos")
    # the news: its own file, the same rule (a failed fetch keeps the last good copy, marked stale)
    oldn = {}
    if NEWS.exists():
        try:
            oldn = json.loads(NEWS.read_text(encoding="utf-8"))
        except ValueError:
            oldn = {}
    try:
        nw = dict(news(src, now), at=data["generated"])
        print("news: ok")
    except Exception as e:  # noqa: BLE001
        nw = dict(oldn, stale=True) if oldn.get("list") else None
        print(f"news: failed ({clean(e)[:160]}){', kept the last good copy' if nw else ''}", file=sys.stderr)
    if nw:
        text = json.dumps(nw, indent=1, ensure_ascii=False)
        assert KEY == "DEMO_KEY" or KEY not in text
        NEWS.write_text(text + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
