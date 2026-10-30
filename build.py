"""Builds dist/index.html from src/, data/ and assets/: one page plus the hero photo files next to it (dist/artifact.html inlines the photo)."""
import base64, html, json, os, pathlib, re, shutil, urllib.parse
from datetime import datetime, timedelta, timezone


def b36(n):
    d, s, m = "0123456789abcdefghijklmnopqrstuvwxyz", "", abs(n)
    while True:
        s, m = d[m % 36] + s, m // 36
        if not m:
            return ("-" if n < 0 else "") + s


def delta(values):
    out, prev = [], 0
    for v in values:
        out.append(b36(v - prev))
        prev = v
    return ",".join(out)


def pack_zips(raw):
    """ZIP table as base 36 deltas (v2): about 40% smaller gzipped. app.js unpacks it at load."""
    z = json.loads(raw)
    codes = [int(z["z"][i:i + 5]) for i in range(0, len(z["z"]), 5)]
    return json.dumps({"v": 2, "z": delta(codes), "a": delta(z["a"]), "o": delta(z["o"]), "c": delta(z["c"]), "n": z["n"]},
                      separators=(",", ":"), ensure_ascii=False)


def zip_entry(raw, code):
    """One ZIP as the page's place object (zipInfo in app.js). The page starts on the default ZIP before zips.json arrives."""
    z = json.loads(raw)
    i = next(k for k in range(len(z["a"])) if z["z"][k * 5:k * 5 + 5] == code)
    city = z["n"][z["c"][i]]
    return {"zip": code, "lat": z["a"][i] / 100, "lon": z["o"][i] / 100, "city": city, "st": city[-2:], "short": city.split(",")[0]}


# Barlow and Barlow Condensed, latin subset, only the weights the page uses (SIL Open Font License). Self hosted; the page preloads the ones the first screen needs.
FONTS = [("Barlow", 400, "barlow-400"), ("Barlow", 500, "barlow-500"), ("Barlow", 600, "barlow-600"),
         ("Barlow Condensed", 500, "barlow-condensed-500"), ("Barlow Condensed", 600, "barlow-condensed-600")]
FONT_FIRST = ("barlow-400", "barlow-600", "barlow-condensed-500", "barlow-condensed-600")  # 500 is not on the first screen
FONT_FACE = "".join(f"@font-face{{font-family:'{n}';font-style:normal;font-weight:{w};font-display:swap;src:url(fonts/{f}.woff2) format('woff2')}}\n" for n, w, f in FONTS)
FONT_LINKS = "".join(f'<link rel="preload" as="font" type="font/woff2" href="fonts/{f}.woff2" crossorigin>\n' for f in FONT_FIRST)
# The hosted artifact has no files beside it, so it keeps the Google Fonts stylesheet.
GOOGLE = "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Condensed:wght@500;600&display=swap"
ART_FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
             f'<link rel="stylesheet" href="{GOOGLE}" media="print" onload="this.media=\'all\'">\n<noscript><link rel="stylesheet" href="{GOOGLE}"></noscript>')


# The page fills the hero text in when its script runs, which moves everything below it. With the feed inlined, the build writes the first
# launch's text into the static HTML instead, as the script would (renderHero, setDataNote in app.js), so the first paint is final.
STATUS = {"go": ("s-go", "Go for launch"), "tbd": ("s-tbd", "Time to be confirmed"), "hold": ("s-hold", "On hold"), "flight": ("s-go", "Launched")}
US_ABBR = {"EST", "EDT", "CST", "CDT", "MST", "MDT", "PST", "PDT", "AKST", "AKDT", "HST", "HDT"}


def first_launch(feed, now):
    """The launch the page shows first: the first valid one that has not left more than 30 minutes ago (applyFeed). That cut is made when
    the page opens, and a build is opened 15 minutes after it was made on average (the feed is rebuilt every 30), so it is made 15 minutes
    early here: a launch that leaves the list in between is then the one case where the script changes the hero's text."""
    for f in feed.get("launches", []):
        try:
            when = datetime.fromisoformat(f["utc"].replace("Z", "+00:00"))
            pad = f["pad"]
            if when > now - timedelta(minutes=15) and isinstance(pad["lat"], (int, float)) and isinstance(pad["lon"], (int, float)) and f["veh"] and f["mis"]:
                return f, when
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
    return None, None


def when_text(when, tzname):
    """'Fri, Oct 30 · 11:42 PM EDT' as Intl formats it in en-US for a US zone or UTC; None when the zone cannot be read."""
    from zoneinfo import ZoneInfo
    try:
        local = when.astimezone(ZoneInfo(tzname or "UTC"))
    except Exception:
        return None
    ab = local.strftime("%Z")
    if not (tzname == "UTC" or ((tzname or "").startswith("America/") or tzname == "Pacific/Honolulu") and ab in US_ABBR):
        return None
    hour = local.hour % 12 or 12
    return f"{local.strftime('%a, %b')} {local.day} · {hour}:{local.minute:02d} {'AM' if local.hour < 12 else 'PM'} {ab}"


def safe_url(u):
    return u if isinstance(u, str) and re.fullmatch(r"https://[^\s\"'<>]+", u) else None


def src_of(u, name):
    """Port of srcOf in app.js: what to call the place a link streams from."""
    m = re.match(r"https://([^/?#]+)", u)
    h = re.sub(r"^www\.", "", m.group(1)) if m else ""
    if re.search(r"(^|\.)(youtube\.com|youtu\.be)$", h):
        return "YouTube"
    if re.search(r"(^|\.)(x|twitter)\.com$", h):
        return f"{name} on X"
    return "NASA+" if h == "plus.nasa.gov" else h


def same_url(a, b):
    """Port of sameUrl in app.js."""
    x, y = urllib.parse.urlsplit(a), urllib.parse.urlsplit(b)
    return x.netloc.lower() == y.netloc.lower() and x.path.rstrip("/") == y.path.rstrip("/") and x.query == y.query


def watch_opts(f, providers):
    """Port of watchOpts in app.js: the launch's own webcast (main), else the provider's live page; alt is that page when it differs."""
    prov = providers.get(f.get("prov")) or f.get("pv") or {"n": "Launch provider"}
    name = str(prov.get("n") or "Launch provider")
    own, page = safe_url(f.get("vid")), safe_url(prov.get("live"))
    a = {"url": own, "src": f.get("vsrc") or src_of(own, name), "own": True} if own else None
    b = {"url": page, "src": prov.get("liveSrc") or src_of(page, name), "own": False, "name": name} if page else None
    if a and b and same_url(a["url"], b["url"]):
        b = None
    return (a, b) if a else (b, None) if b else None


def is_live(f, when, now):
    """Port of liveOf in app.js: a launch in flight, or within 15 minutes before liftoff to 30 after (never a time still to be confirmed)."""
    if f.get("st") == "flight":
        return True
    if f.get("st") == "tbd":
        return False
    return timedelta(minutes=-30) <= when - now <= timedelta(minutes=15)


def hero_static(page, feed, now, providers):
    """The page with the first launch's hero text, nav countdown name and Watch button already in the markup."""
    f, when = first_launch(feed, now)
    if not f:
        return page
    e = lambda x: html.escape(str(x), quote=False)

    def swap(old, new):
        nonlocal page
        assert page.count(old) == 1, old  # a template edit must update this list
        page = page.replace(old, new)
    st = STATUS.get(f.get("st"), STATUS["tbd"])
    swap('<span class="status s-go" id="heroStatus">Go for launch</span>', f'<span class="status {st[0]}" id="heroStatus">{st[1]}</span>')
    gen = datetime.fromisoformat(feed["generated"].replace("Z", "+00:00"))
    m = max(0, round((now - gen).total_seconds() / 60))
    ago = f"{m} min ago" if m < 60 else f"{round(m / 60)} h ago" if m < 2880 else f"{round(m / 1440)} days ago"
    swap('<span class="dtag" id="dataTag">Sample data</span>', f'<span class="dtag live" id="dataTag">Live data · updated {ago}</span>')
    swap('<h1 id="heroTitle">Starlink</h1>', f'<h1 id="heroTitle">{e(f["mis"])}</h1>')
    wt = when_text(when, f.get("tz") or "UTC")
    if wt:
        swap('<div class="hero-sub" id="heroSub"></div>', f'<div class="hero-sub" id="heroSub"><span>{e(f["veh"])}</span><span>{e(f["pad"]["full"])}</span><span>{wt}</span></div>')
    swap('<b id="hfVeh">Falcon 9</b>', f'<b id="hfVeh">{e(f["veh"])}</b>')
    swap('<b id="hfPad">SLC 40</b>', f'<b id="hfPad">{e(f["pad"]["n"])}</b>')
    swap('<b id="hfOrbit">Low Earth</b>', f'<b id="hfOrbit">{e(f["orbit"])}</b>')
    go = f.get("go")
    swap('<b id="hfWx" class="s-go">90% go</b>', f'<b id="hfWx"{"" if go is None else " class=\"s-go\""}>{"Pending" if go is None else f"{go}% go"}</b>')
    swap('<span id="ncName">Starlink</span>', f'<span id="ncName">{e(f["mis"])}</span>')
    # the Watch button and the line under the hero buttons (heroWatch in app.js)
    opts = watch_opts(f, providers)
    q = lambda x: html.escape(str(x), quote=True)
    swap('id="heroWatch" href="https://www.youtube.com/@SpaceX/streams"', f'id="heroWatch" href="{q(opts[0]["url"])}"' if opts else 'id="heroWatch" href="#" hidden')
    if opts:
        main, alt = opts
        label = "Watch live" if is_live(f, when, now) else "Watch page"
        swap('<span id="heroWatchT">Watch live</span></span><small class="w-src" id="heroWatchS">spacex.com</small>', f'<span id="heroWatchT">{label}</span></span><small class="w-src" id="heroWatchS">{e(main["src"])}</small>')
        if alt:
            key = f'{alt["url"]}|{alt["name"]}|{alt["src"]}'
            line = f'Also <a href="{q(alt["url"])}" target="_blank" rel="noopener" aria-label="{q(alt["name"] + " live page on " + alt["src"])} (opens in a new tab)">{e(alt["name"])} live page</a> · {e(alt["src"])}'
        else:
            key = "w" if main["own"] else "p"
            line = "Webcast for this launch" if main["own"] else "Provider live page"
        swap('<p class="label hero-src" id="heroSrc" data-k="p">Provider live page</p>', f'<p class="label hero-src" id="heroSrc" data-k="{q(key)}">{line}</p>')
    else:
        swap('<p class="label hero-src" id="heroSrc" data-k="p">Provider live page</p>', '<p class="label hero-src" id="heroSrc">No official stream listed yet</p>')
    return page


root = pathlib.Path(__file__).parent
zips_raw = (root / "data/zipdata.json").read_text(encoding="utf-8")
zips_packed = pack_zips(zips_raw)
t = (root / "src/template.html").read_text(encoding="utf-8")
# The official mark is the single source for both the nav icon and the favicon. The C2PA provenance <metadata> block is dead weight on the page, so drop it.
mark = re.sub(r"<metadata>.*?</metadata>", "", (root / "assets/astro-mark.svg").read_text(encoding="utf-8"), flags=re.S)
inner = re.search(r"<svg[^>]*>(.*)</svg>", mark, re.S).group(1)
for k in ("lg", "lo", "lm"):  # prefix ids so the inline symbol cannot collide with other defs on the page
    inner = inner.replace(f'id="{k}"', f'id="am-{k}"').replace(f"url(#{k})", f"url(#am-{k})")
symbol = '<symbol id="i-astro" viewBox="0 0 64 64">' + inner + "</symbol>"
# the hero photo and its calibration (horizon, air glow, lat/lon fit) come from assets/earth.json, so a photo swap is a file swap
photo = json.loads((root / "assets/earth.json").read_text(encoding="utf-8"))
# The live feed Worker (worker/README.md): data/config.json sets its URL, and a FEED_URL variable in the deploy overrides it. Empty means the page
# polls launches.json only. Only an https URL (or a local one, for testing) is accepted, since the page fetches it.
feed_url = (os.environ.get("FEED_URL") or json.loads((root / "data/config.json").read_text(encoding="utf-8")).get("feedUrl") or "").strip()
if feed_url and not re.fullmatch(r"https://[^\s\"'<>]+|http://(localhost|127\.0\.0\.1)(:\d+)?(/[^\s\"'<>]*)?", feed_url):
    print(f"ignoring feedUrl {feed_url!r}: it must be an https URL")
    feed_url = ""
# The deploy fetches the feed into dist/launches.json before building, and the page inlines it so it opens on live launches.
# Without that file (a plain local build) the page loads launches.json after it opens, or shows its sample data.
feed = "null"
feed_obj = None
try:
    feed_obj = json.loads((root / "dist/launches.json").read_text(encoding="utf-8"))
    feed = json.dumps(feed_obj, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")
except (OSError, ValueError):
    pass
now = datetime.now(timezone.utc)


def staticize(page):
    """The page with the first launch written in; unchanged (the script fills the hero in as before) with no usable feed or a feed shape this does not know."""
    if not (isinstance(feed_obj, dict) and feed_obj.get("generated")):
        return page
    try:
        return hero_static(page, feed_obj, now, {p["key"]: p for p in json.loads((root / "data/providers.json").read_text(encoding="utf-8"))["providers"]})
    except (KeyError, TypeError, ValueError, AttributeError) as err:
        print(f"hero text left to the script: {err!r}")
        return page

# The page loads the photo as its own files (WebP, a JPEG fallback) with a tiny placeholder inlined; see "web" in earth.json.
web = photo["web"]
data_uri = lambda p: "data:image/" + ("webp" if p.suffix == ".webp" else "jpeg") + ";base64," + base64.b64encode(p.read_bytes()).decode()
tiny = data_uri(root / "assets" / web["tiny"])
t = (t.replace("__MARK__", symbol)
      .replace("__EARTHTINY__", tiny)
      .replace("__PHOTO__", json.dumps(photo, separators=(",", ":")))
      .replace("__PROVIDERS__", json.dumps(json.loads((root / "data/providers.json").read_text(encoding="utf-8"))["providers"],
                                           separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/"))
      .replace("__MODEL__", (root / "src/model.js").read_text(encoding="utf-8"))
      .replace("__APP__", (root / "src/app.js").read_text(encoding="utf-8"))
      .replace("__ZIP0__", json.dumps(zip_entry(zips_raw, "33130"), separators=(",", ":")))
      .replace("__FEEDURL__", json.dumps(feed_url))
      .replace("__FEED__", feed))  # last, so text inside the feed is never taken for a marker
# The calendar subscription (launches.ics, written with the launch pages): offered only when the build has live launches to put in it
_has_feed = isinstance(feed_obj, dict) and bool(feed_obj.get("generated")) and bool(feed_obj.get("launches"))
t = (t.replace("<!--CALSUB-->", '    <p class="note cal-sub"><span>Every upcoming launch in your calendar, with alerts a day before and 30 minutes before. '
               'Times update as launches move.</span><a href="webcal://astroradar.io/launches.ics">Subscribe to calendar</a>'
               '<span>or add <a href="https://astroradar.io/launches.ics">astroradar.io/launches.ics</a> by URL</span></p>' if _has_feed else "")
      .replace("<!--CALFOOT-->", '        <a href="webcal://astroradar.io/launches.ics">Launch calendar</a>\n' if _has_feed else ""))
# The page body has no document wrapper (it is also published as a hosted artifact), so add one for standalone hosting.
# the favicon sits on the page color tile (the PNG icons do too), so the white A still shows on a light browser tab
fav = "data:image/svg+xml," + urllib.parse.quote(re.sub(r"(<svg[^>]*>)", r'\1<rect width="64" height="64" rx="14" fill="#04050C"/>', mark, count=1))
# Metadata for search and link previews. The share image (1200 by 630) and the PNG icons in assets/ were rendered in headless
# Chrome from earth.jpg and astro-mark.svg, so render them again if either changes.
SITE = "https://astroradar.io/"
TITLE = "Astro Radar · Every rocket launch, checked against your sky"
DESC = ("Every rocket launch in the next 30 days from SpaceX, NASA, Blue Origin, Rocket Lab and every other major provider, "
        "with the official stream and whether you can see it from your ZIP code.")
META = "".join(f'<meta {k}="{n}" content="{v}">\n' for k, n, v in (
    ("name", "description", DESC),
    ("property", "og:type", "website"), ("property", "og:site_name", "Astro Radar"), ("property", "og:url", SITE),
    ("property", "og:title", TITLE), ("property", "og:description", DESC),
    ("property", "og:image", SITE + "og-image.jpg"), ("property", "og:image:width", "1200"), ("property", "og:image:height", "630"),
    ("property", "og:image:alt", "Astro Radar over a night view of Earth from orbit"),
    ("name", "twitter:card", "summary_large_image"), ("name", "twitter:title", TITLE), ("name", "twitter:description", DESC),
    ("name", "twitter:image", SITE + "og-image.jpg")))
# Installable: the web app manifest and the iPhone home screen tags (app.js registers the service worker once the page has loaded)
APP_HEAD = ('<link rel="manifest" href="manifest.webmanifest">\n<meta name="apple-mobile-web-app-capable" content="yes">\n'
            '<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
            '<meta name="apple-mobile-web-app-title" content="Radar">\n')
PREFIX = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#04050C">\n'
          '<title>' + TITLE + '</title>\n' + META + '<link rel="canonical" href="' + SITE + '">\n'
          '<link rel="icon" href="' + fav + '" type="image/svg+xml">\n<link rel="icon" href="favicon-32.png" type="image/png" sizes="32x32">\n'
          '<link rel="apple-touch-icon" href="apple-touch-icon.png">\n' + APP_HEAD +
          '<script>if(/[?&]launch=/.test(location.search))document.documentElement.className="dl"</script>\n'
          '<link rel="preload" as="image" href="' + web["webp"] + '" type="image/webp" fetchpriority="high">\n</head>\n<body>\n')
(root / "dist").mkdir(exist_ok=True)
for f in (web["webp"], web["jpeg"], "og-image.jpg", "apple-touch-icon.png", "favicon-32.png",
          "icon-192.png", "icon-512.png", "icon-maskable-512.png"):
    shutil.copyfile(root / "assets" / f, root / "dist" / f)
# The ZIP table is its own file (about 860 KB packed); the page fetches it after it has painted. The artifact keeps it inline.
(root / "dist/zips.json").write_text(zips_packed, encoding="utf-8")
(root / "dist/fonts").mkdir(exist_ok=True)
for _, _, f in FONTS:
    shutil.copyfile(root / "assets/fonts" / (f + ".woff2"), root / "dist/fonts" / (f + ".woff2"))
out = root / "dist/index.html"
# the page's own <title> moves into the head above; the artifact keeps it where it is
out.write_text(staticize(PREFIX + re.sub(r"<title>.*?</title>\n?", "", t, count=1).replace("__EARTH__", web["jpeg"]).replace("__EARTHWEBP__", web["webp"]).replace("__ZIPTAG__", "").replace("__FONTLINKS__", FONT_LINKS).replace("__FONTFACE__", FONT_FACE) + "\n</body>\n</html>\n"), encoding="utf-8")
# the artifact has no files beside it, so it carries the JPEG inline
(root / "dist/artifact.html").write_text(staticize(t.replace("__EARTH__", data_uri(root / "assets" / web["jpeg"])).replace("__EARTHWEBP__", "")
                                         .replace("__ZIPTAG__", '<script type="application/json" id="zipdata">' + zips_packed + "</script>")
                                         .replace("__FONTLINKS__", ART_FONTS).replace("__FONTFACE__", "")), encoding="utf-8")
# A content security policy for the built page: scripts only from this site or the exact inline scripts the build wrote (their hashes, so
# a changed or injected script does not run); data only from this site, the National Weather Service and the live feed Worker. Inline
# styles stay allowed (the page and its script set style attributes). The artifact has none, since its host sets its own.
import hashlib as _hl
def csp_for(page, connect):
    hashes = ["'sha256-" + base64.b64encode(_hl.sha256(s.encode("utf-8")).digest()).decode() + "'"
              for s in re.findall(r"<script>(.*?)</script>", page, re.S)]
    return ("default-src 'self'; script-src 'self' " + " ".join(hashes) + "; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
            "font-src 'self'; connect-src 'self' " + " ".join(connect) + "; worker-src 'self'; manifest-src 'self'; media-src 'self'; "
            "object-src 'none'; base-uri 'self'; form-action 'self'")
CONNECT = ["https://api.weather.gov"] + ([re.match(r"https?://[^/]+", feed_url).group(0)] if feed_url else [])
_page = out.read_text(encoding="utf-8")
out.write_text(_page.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="' + csp_for(_page, CONNECT) + '">\n', 1), encoding="utf-8")
print(f"built {out} ({out.stat().st_size:,} bytes)")
# A page for every launch in the inlined feed (launch_pages.py), with the sitemap, robots.txt, the 404 page and the calendar feed.
# A plain local build has no feed: the shared files are still written, with no launch pages and an empty calendar.
import launch_pages
_feed = feed_obj if isinstance(feed_obj, dict) and feed_obj.get("generated") else {"launches": [], "recent": []}
_made, _big = launch_pages.build_pages(root / "dist", _feed, {p["key"]: p for p in json.loads((root / "data/providers.json").read_text(encoding="utf-8"))["providers"]},
                                       now, {"watch_opts": watch_opts, "is_live": is_live, "when_text": when_text},
                                       (root / "src/model.js").read_text(encoding="utf-8"), mark,
                                       {"manifest": '<link rel="manifest" href="/manifest.webmanifest">\n',
                                        "csp": '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\'; '
                                               'img-src \'self\'; font-src \'self\'; connect-src \'self\'; manifest-src \'self\'; object-src \'none\'; base-uri \'self\'">\n'})
print(f"launch pages: {len(_made)} (largest {_big:,} bytes)")

# The web app manifest (add to home screen on iPhone and Android) and the service worker (src/sw.js). The worker keeps the shell, the
# hero photo and the last good launches.json for offline use; its version is a hash of everything it keeps plus the page, so every
# deploy installs a new worker and drops the old shell.
import hashlib
(root / "dist/manifest.webmanifest").write_text(json.dumps({
    "name": "Astro Radar", "short_name": "Radar", "description": DESC, "id": "/", "start_url": "/", "scope": "/",
    "display": "standalone", "background_color": "#04050C", "theme_color": "#04050C", "lang": "en", "categories": ["news", "weather", "education"],
    "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
              {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}, indent=1) + "\n", encoding="utf-8")
SHELL = [web["webp"], web["jpeg"], "manifest.webmanifest", "favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png"] + [f"fonts/{f}.woff2" for _, _, f in FONTS]
_h = hashlib.sha256()
for f in ["index.html"] + SHELL:
    _h.update((root / "dist" / f).read_bytes())
_sw = (root / "src/sw.js").read_text(encoding="utf-8").replace("__VERSION__", _h.hexdigest()[:12]).replace("__SHELL__", json.dumps(SHELL))
(root / "dist/sw.js").write_text(_sw, encoding="utf-8")
print(f"service worker version {_h.hexdigest()[:12]}, {len(SHELL) + 1} files kept")
