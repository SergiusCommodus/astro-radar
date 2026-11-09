"""Space today: a few things from NASA for the bottom of the Launches tab, fetched at build time into data/nasa.json (and small images
into data/nasa/), read by build.py.

    python3 scripts/fetch_nasa.py [--feed dist/launches.json] [--from-dir tests/nasa] [--now 2026-11-09T12:00:00Z]

The key comes only from the environment (NASA_API_KEY), else NASA's public DEMO_KEY (30 requests an hour, 50 a day per address; a run
makes at most seven). It is never written to a file, printed or sent to the page: errors are reported with it removed.

Sources (each tried on its own; one that fails keeps its last good entry in data/nasa.json, marked stale, and one that never worked is
left out, so the page shows only what it has):
  epic     the latest natural color Earth from NASA's EPIC camera on DSCOVR (epic.gsfc.nasa.gov, no key): the thumbnail is saved
  sun      DONKI solar flares (FLR) and geomagnetic storms (GST) of the last 3 days: a one line summary and a rough aurora outlook from
           the highest Kp. DONKI through api.nasa.gov timed out and then answered 503 when this was written, and its own host
           (kauai.ccmc.gsfc.nasa.gov) did not answer at all, so both are tried and the card simply stays away while neither works
  apod     the Astronomy Picture of the Day: embedded (the image saved at 640 px) only when it carries no copyright notice and is an
           image; otherwise a link out with its credit
  neo      NeoWs close approaches in the next 7 days: how many, how many NASA marks potentially hazardous, the closest
  missions for each NASA launch in the feed (--feed), the first photo NASA's Image and Video Library finds for its mission name (no key)

--from-dir reads saved responses (epic.json, flr.json, gst.json, apod.json, neo.json, images.json) instead of the network, for tests.
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
    data = src.bytes(url)
    if data:
        out["img"] = save_image(data, "epic.jpg", 240)
    return out


def kp_of(gst):
    best = 0.0
    for g in gst or []:
        for k in g.get("allKpIndex") or []:
            try:
                best = max(best, float(k.get("kpIndex") or 0))
            except (TypeError, ValueError):
                pass
    return best


def sun(src, now):
    a, b = (now - timedelta(days=3)).strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d")
    flr = gst = None
    errors = []
    for base, kw in (("https://api.nasa.gov/DONKI/", True), ("https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/", False)):
        try:
            flr = src.json("flr.json", (keyed if kw else lambda u, **q: u + "?" + urllib.parse.urlencode(q))(base + "FLR", startDate=a, endDate=b))
            gst = src.json("gst.json", (keyed if kw else lambda u, **q: u + "?" + urllib.parse.urlencode(q))(base + "GST", startDate=a, endDate=b))
            break
        except Exception as e:  # noqa: BLE001 - one host down, try the other
            errors.append(clean(e))
            flr = gst = None
    if flr is None or gst is None:
        raise RuntimeError("; ".join(errors))
    classes = sorted({str(f.get("classType") or "") for f in flr if f.get("classType")}, key=lambda c: ("ABCMX".find(c[:1]), c), reverse=True)
    big = [c for c in classes if c[:1] in "MX"]
    kp = kp_of(gst)
    if big:
        summary = f"{len(flr)} solar flare{'s' if len(flr) != 1 else ''} in the last 3 days, the strongest {classes[0]}."
    elif flr:
        summary = f"{len(flr)} small solar flare{'s' if len(flr) != 1 else ''} in the last 3 days, none strong."
    else:
        summary = "A quiet Sun: no solar flares listed in the last 3 days."
    if kp >= 7:
        aurora = "Strong geomagnetic storm (Kp " + f"{kp:g}" + "): aurora may reach the northern states on a clear, dark night."
    elif kp >= 5:
        aurora = "Geomagnetic storm (Kp " + f"{kp:g}" + "): aurora possible far north (Alaska, Canada, the northern border) on a clear, dark night."
    else:
        aurora = "No geomagnetic storm listed: aurora unlikely outside the far north."
    return {"summary": summary, "aurora": aurora, "kp": kp, "flares": classes[:6], "storms": len(gst),
            "src": "https://kauai.ccmc.gsfc.nasa.gov/DONKI/", "credit": "NASA DONKI, CCMC"}


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


def neo(src, now):
    a, b = now.strftime("%Y-%m-%d"), (now + timedelta(days=6)).strftime("%Y-%m-%d")
    d = src.json("neo.json", keyed("https://api.nasa.gov/neo/rest/v1/feed", start_date=a, end_date=b))
    objs = [o for day in (d.get("near_earth_objects") or {}).values() for o in day]
    if not objs:
        raise ValueError("no close approaches listed")
    best, km = None, None
    for o in objs:
        for c in o.get("close_approach_data") or []:
            try:
                m = float(c["miss_distance"]["kilometers"])
            except (KeyError, TypeError, ValueError):
                continue
            if km is None or m < km:
                best, km, when = o, m, c.get("close_approach_date")
    dia = ((best or {}).get("estimated_diameter") or {}).get("meters") or {}
    return {"count": len(objs), "hazardous": sum(1 for o in objs if o.get("is_potentially_hazardous_asteroid")),
            "closest": {"name": re.sub(r"[()]", "", (best or {}).get("name") or "").strip(), "date": when, "km": round(km or 0),
                        "m": [round(dia.get("estimated_diameter_min") or 0), round(dia.get("estimated_diameter_max") or 0)]},
            "src": "https://cneos.jpl.nasa.gov/ca/", "credit": "NASA JPL CNEOS, NeoWs"}


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
    for name, fn in (("epic", epic), ("sun", sun), ("apod", apod), ("neo", neo)):
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
    print(f"wrote {OUT.name}: {ok} of 4 sources fresh, {len(data['missions'])} mission photos")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
