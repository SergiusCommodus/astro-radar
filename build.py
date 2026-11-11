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
    early here: a launch that leaves the list in between is then the one case where the script changes the hero's text (hero_window
    hides main until boot for it)."""
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


DL_HEAD = '<script>if(/[?&]launch=/.test(location.search))document.documentElement.className="dl"</script>'
# The hero's planet is a NASA photograph on every device (assets/earth/): the class is set in the head so the photo (the largest paint
# on every screen) is asked for before the fonts and the rest of the page. Its AVIF is preloaded at high priority by plain link tags (a
# preload a script inserts is found later, and Lighthouse counts it as waiting on the script); a browser without AVIF ignores them and
# takes the WebP from the picture. The wide one is chosen by width (srcset), so the preload carries the same srcset and sizes.
VID_HEAD = ('<script>document.documentElement.classList.add("vid")</script>'
            '\n<link rel="preload" as="image" type="image/avif" href="earth/hero-phone.avif" media="(max-width:699px)" fetchpriority="high">'
            '\n<link rel="preload" as="image" type="image/avif" imagesrcset="earth/hero-wide.avif 1920w, earth/hero-wide-2560.avif 2560w, earth/hero-wide-3840.avif 3840w" imagesizes="100vw" media="(min-width:700px)" fetchpriority="high">')


def hero_window(feed, f, when, now):
    """The span (ms since 1970) in which the page, once open, picks the launch the build wrote and shows it in the same live state: from
    30 minutes after the last usable launch listed before it (until then the page still shows that one) to 30 minutes after its own
    liftoff, or to 15 minutes before liftoff when it is not live yet (the Watch button then turns live and moves first)."""
    lo = None
    for g in feed.get("launches", []):
        if g is f:
            break
        try:
            if isinstance(g["pad"]["lat"], (int, float)) and isinstance(g["pad"]["lon"], (int, float)):
                w = datetime.fromisoformat(g["utc"].replace("Z", "+00:00"))
                lo = w if lo is None or w > lo else lo
        except (KeyError, TypeError, ValueError, AttributeError):
            continue
    hi = when + timedelta(minutes=30)
    if f.get("st") not in ("flight", "tbd") and not is_live(f, when, now):
        hi = min(hi, when - timedelta(minutes=15))
    ms = lambda d: int(d.timestamp() * 1000)
    return (ms(lo + timedelta(minutes=30)) if lo else 0), ms(hi)


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
    # the headline: the launch's own name, or the rocket and the word Launch for a payload not disclosed (title_of, ORB.title in app.js)
    head = launch_pages.title_of(f["mis"], f["veh"])
    swap('<h1 id="heroTitle" style="--n:8">Starlink</h1>', f'<h1 id="heroTitle" style="--n:{len(head)}">{e(head)}</h1>')
    # the line under the title (the rocket and the pad; Payload not disclosed, muted, in place of the rocket when the headline is the
    # rocket) and the three facts: liftoff in the pad's time, the rocket, the visitor's view
    sub1 = '<span class="nd">Payload not disclosed</span>' if launch_pages.undisclosed(f["mis"]) else f'<span>{e(f["veh"])}</span>'
    swap('<div class="hero-sub" id="heroSub"></div>', f'<div class="hero-sub" id="heroSub">{sub1}<span>{e(f["pad"]["full"])}</span></div>')
    wt = when_text(when, f.get("tz") or "UTC")
    if wt:
        swap('<b id="hfWhen">Wed, Nov 5 · 12:00 PM</b>', f'<b id="hfWhen">{wt}</b>')
    swap('<b id="hfVeh">Falcon 9</b>', f'<b id="hfVeh">{e(f["veh"])}</b>')
    swap('<span id="ncName">Starlink</span>', f'<span id="ncName">{e(head)}</span>')
    # the provider's logo chip at the head of the hero (logoChip in app.js)
    swap('<span class="hlogo" id="heroLogo"><span class="lchip lchip-hero" style="--bc:#9FB4D6"><img class="plogo" src="providers/spacex.svg" width="184" height="23" alt="SpaceX"></span></span>',
         '<span class="hlogo" id="heroLogo">' + launch_pages.logo_chip(launch_pages.logo_of(f, providers, OTHERS), RATIOS, "hero", base="") + '</span>')
    # Share to Astro and Copy link show only for live data (shareOn in app.js): hidden in the markup for the sample manifest, shown here
    swap('id="heroShare" href="https://astrosocial.io/app/share" target="_blank" rel="noopener" hidden>', 'id="heroShare" href="https://astrosocial.io/app/share" target="_blank" rel="noopener">')
    swap('<button class="btn btn-ghost" id="heroCopy" type="button" hidden>', '<button class="btn btn-ghost" id="heroCopy" type="button">')
    # a live launch (applyLive in app.js): the LIVE badge, and the Watch button solid and first
    live = is_live(f, when, now)
    if live:
        m = max(1, round((now - when).total_seconds() / 60))
        swap('<span class="live-badge" id="heroLive" role="status" hidden><i aria-hidden="true"></i><span id="heroLiveT">Live now</span></span>',
             '<span class="live-badge" id="heroLive" role="status"><i aria-hidden="true"></i><span id="heroLiveT">'
             + ("Live now" if when >= now else f"Live now · launched {m} min ago") + '</span></span>')
        swap('<div class="hero-actions">', '<div class="hero-actions is-live">')
    # outside the span where that stays true (a launch left the list, or the Watch button turned live) main is hidden until the script has
    # filled the hero in, as for a shared link, instead of showing this hero and then changing it
    if DL_HEAD in page:
        lo, hi = hero_window(feed, f, when, now)
        page = page.replace(DL_HEAD, '<script>if(/[?&]launch=/.test(location.search)||Date.now()<' + str(lo) + '||Date.now()>=' + str(hi)
                            + ')document.documentElement.className="dl"</script>', 1)
    # the Watch button and the line under the hero buttons (heroWatch in app.js)
    opts = watch_opts(f, providers)
    q = lambda x: html.escape(str(x), quote=True)
    swap('id="heroWatch" href="https://www.youtube.com/@SpaceX/streams"', f'id="heroWatch" href="{q(opts[0]["url"])}"' if opts else 'id="heroWatch" href="#" hidden')
    if opts:
        main, alt = opts
        label = "Watch live" if live else "Watch page"
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
        # with no stream the reminder is the one main button (updateRemind in app.js)
        swap('<button class="btn btn-ghost" id="heroRemind" type="button">', '<button class="btn btn-solid" id="heroRemind" type="button">')
    # the Recent launches strip shows from the first paint when the feed has a flight from the last 7 days (renderRecent fills in the cards;
    # the list keeps their height), so it does not push the page down when the script runs
    if any(now - datetime.fromisoformat(r["utc"].replace("Z", "+00:00")) < timedelta(days=7) for r in feed.get("recent") or []):
        swap('<section class="recent wrap" id="recent" aria-labelledby="recentT" hidden>', '<section class="recent wrap" id="recent" aria-labelledby="recentT">')
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
    """The page with the first launch written in; unchanged (the script fills the hero in as before) with no usable feed or a feed shape this
    does not know. Then the hero's text is the template's sample, which the script replaces after the first paint (it runs after it now),
    so main stays hidden until boot (class dl, as for a shared link) instead of moving: a no feed build is never the live site."""
    out = page
    if isinstance(feed_obj, dict) and feed_obj.get("generated"):
        try:
            out = hero_static(page, feed_obj, now, {p["key"]: p for p in json.loads((root / "data/providers.json").read_text(encoding="utf-8"))["providers"]})
        except (KeyError, TypeError, ValueError, AttributeError) as err:
            print(f"hero text left to the script: {err!r}")
    return out.replace(DL_HEAD, '<script>document.documentElement.className="dl"</script>', 1)

data_uri = lambda p: "data:image/" + ("webp" if p.suffix == ".webp" else "jpeg") + ";base64," + base64.b64encode(p.read_bytes()).decode()
# Provider logos (assets/providers/, white SVGs, see launch_pages.logo_of): copied next to the page and kept by the service worker; each
# provider's logo carries its width over height ("ar") so the page sizes it before it loads
PROVJ = json.loads((root / "data/providers.json").read_text(encoding="utf-8"))
OTHERS = PROVJ.get("others", [])
LOGOS = sorted(p.name for p in (root / "assets/providers").glob("*.svg"))
import launch_pages
RATIOS = {"providers/" + n: launch_pages.svg_ratio(root / "assets/providers" / n) for n in LOGOS}
(root / "dist/providers").mkdir(parents=True, exist_ok=True)
for n in LOGOS:
    shutil.copyfile(root / "assets/providers" / n, root / "dist/providers" / n)
# (the globe card and its WebGL world are gone: one planet, the hero's photograph; an old dist/ keeps no copy of them)
for _old in ("world.js",):
    if (root / "dist" / _old).exists():
        (root / "dist" / _old).unlink()
if (root / "dist/world").exists():
    shutil.rmtree(root / "dist/world")
# satellite.js (MIT, assets/vendor/, its licence beside it) for the ISS pass card: loaded by the page only in Nerd mode
if (root / "dist/vendor").exists():
    shutil.rmtree(root / "dist/vendor")
shutil.copytree(root / "assets/vendor", root / "dist/vendor")
# The one planet: a NASA photograph from the ISS in the hero (assets/earth/, scripts/make_earth_stills.py, SOURCES.md there), and the
# launch areas the launch pages show (assets/earth/areas/)
if (root / "dist/earth").exists():
    shutil.rmtree(root / "dist/earth")
shutil.copytree(root / "assets/earth", root / "dist/earth", ignore=shutil.ignore_patterns("*.md"))
if (root / "dist/loop").exists():
    shutil.rmtree(root / "dist/loop")
for p in PROVJ["providers"] + OTHERS:
    if p.get("logo"):
        p["ar"] = round(RATIOS[p["logo"]], 3)
# Space today (scripts/fetch_nasa.py writes data/nasa.json and its images in data/nasa/): inlined for the page, the images copied
# next to it. A section whose last good fetch is more than two days old is marked stale; with no data the page leaves the section out
NASA = None
if (root / "data/nasa.json").exists():
    try:
        NASA = json.loads((root / "data/nasa.json").read_text(encoding="utf-8"))
    except ValueError:
        NASA = None
if NASA:
    _bt = datetime.now(timezone.utc)
    for _k in ("epic", "sun", "apod", "neo"):
        _v = NASA.get(_k)
        if isinstance(_v, dict):
            try:
                if _bt - datetime.fromisoformat(str(_v.get("at")).replace("Z", "+00:00")) > timedelta(days=2):
                    _v["stale"] = True
            except ValueError:
                _v["stale"] = True
    if (root / "dist/nasa").exists():
        shutil.rmtree(root / "dist/nasa")
    if (root / "data/nasa").exists():
        shutil.copytree(root / "data/nasa", root / "dist/nasa")
NASA_JSON = json.dumps({k: v for k, v in (NASA or {}).items() if k != "missions"} or None, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")
t = (t.replace("__MARK__", symbol)
      .replace("__PROVIDERS__", json.dumps(PROVJ["providers"], separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/"))
      .replace("__PROVOTHERS__", json.dumps(OTHERS, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/"))
      .replace("__MODEL__", (root / "src/model.js").read_text(encoding="utf-8"))
      .replace("__APP__", (root / "src/app.js").read_text(encoding="utf-8"))
      .replace("__ZIP0__", json.dumps(zip_entry(zips_raw, "33130"), separators=(",", ":")))
      .replace("__FEEDURL__", json.dumps(feed_url))
      .replace("__NASA__", NASA_JSON)
      .replace("__FEED__", feed))  # last, so text inside the feed is never taken for a marker
# The calendar subscription (launches.ics, written with the launch pages): offered only when the build has live launches to put in it
_has_feed = isinstance(feed_obj, dict) and bool(feed_obj.get("generated")) and bool(feed_obj.get("launches"))
t = (t.replace("<!--CALSUB-->", '    <p class="note cal-sub"><span>Every upcoming launch in your calendar, with alerts a day before and 30 minutes before. '
               'Times update as launches move.</span><a href="webcal://astroradar.io/launches.ics">Subscribe to calendar</a>'
               '<span>or add <a href="https://astroradar.io/launches.ics">astroradar.io/launches.ics</a> by URL</span></p>\n'
               # how to subscribe, closed until asked for (iPhone: the webcal link opens Calendar; Google: only from a computer, by URL)
               '    <details class="cal-help"><summary>How to subscribe</summary><p>On an iPhone or iPad, tap Subscribe to calendar, then Subscribe, '
               'then Add. In Google Calendar, on a computer, choose the plus beside Other calendars, then From URL, and paste '
               'https://astroradar.io/launches.ics. Google refreshes a subscribed calendar on its own schedule, so a moved launch can take several '
               'hours to show there; each launch\'s page here is always current.</p></details>' if _has_feed else "")
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
# The upcoming launches for search engines: an ItemList of Events (the next ten not yet flying), each pointing at its launch page and its
# share card (the site's image when the build cannot draw cards, without Pillow)
import importlib.util
_card = importlib.util.find_spec("PIL") is not None
LD_MAIN = ""
if isinstance(feed_obj, dict):
    _items = []
    for _L in feed_obj.get("launches") or []:
        if len(_items) >= 10:
            break
        if (not isinstance(_L, dict) or _L.get("st") == "flight" or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", str(_L.get("id") or ""))
                or not _L.get("mis") or not _L.get("utc")):
            continue
        _pad = _L.get("pad") or {}
        _items.append({"@type": "ListItem", "position": len(_items) + 1, "item": {
            "@type": "Event", "name": launch_pages.page_title(_L), "startDate": _L["utc"],
            "url": SITE + "launch/" + _L["id"] + "/", "eventStatus": "https://schema.org/EventScheduled",
            "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
            "image": SITE + ("launch/" + _L["id"] + "/share.jpg" if _card else "og-image.jpg"),
            "location": {"@type": "Place", "name": _pad.get("n") or "Launch site", "address": _pad.get("full") or _pad.get("n") or "Launch site"}}})
    if _items:
        LD_MAIN = ('<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@type": "ItemList", "name": "Upcoming rocket launches",
                   "itemListElement": _items}, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + "</script>\n")
PREFIX = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#04050C">\n'
          '<title>' + TITLE + '</title>\n' + META + '<link rel="canonical" href="' + SITE + '">\n'
          '<link rel="icon" href="' + fav + '" type="image/svg+xml">\n<link rel="icon" href="favicon-32.png" type="image/png" sizes="32x32">\n'
          '<link rel="apple-touch-icon" href="apple-touch-icon.png">\n<link rel="preconnect" href="https://api.weather.gov" crossorigin>\n' + APP_HEAD + DL_HEAD + VID_HEAD + '\n'
          + LD_MAIN + '</head>\n<body>\n')
(root / "dist").mkdir(exist_ok=True)
for f in ("og-image.jpg", "apple-touch-icon.png", "favicon-32.png",
          "icon-192.png", "icon-512.png", "icon-maskable-512.png"):
    shutil.copyfile(root / "assets" / f, root / "dist" / f)
# The ZIP table is its own file (about 860 KB packed); the page fetches it after it has painted. The artifact keeps it inline.
(root / "dist/zips.json").write_text(zips_packed, encoding="utf-8")
(root / "dist/fonts").mkdir(exist_ok=True)
for _, _, f in FONTS:
    shutil.copyfile(root / "assets/fonts" / (f + ".woff2"), root / "dist/fonts" / (f + ".woff2"))
out = root / "dist/index.html"
# the page's own <title> moves into the head above; the artifact keeps it where it is
out.write_text(staticize(PREFIX + re.sub(r"<title>.*?</title>\n?", "", t, count=1).replace("__ZIPTAG__", "").replace("__FONTLINKS__", FONT_LINKS).replace("__FONTFACE__", FONT_FACE) + "\n</body>\n</html>\n"), encoding="utf-8")
# the artifact has no files beside it, so it carries the hero photo (the phone's WebP) and the provider logos inline
_art = staticize(t
                 .replace("__ZIPTAG__", '<script type="application/json" id="zipdata">' + zips_packed + "</script>")
                 .replace("__FONTLINKS__", ART_FONTS).replace("__FONTFACE__", ""))
_art = re.sub(r'<picture class="hero-pst" id="heroPst">.*?</picture>',
              lambda m: '<picture class="hero-pst" id="heroPst"><img src="' + data_uri(root / "assets/earth/hero-phone.webp") + '" alt="" width="1200" height="1200"></picture>', _art, count=1, flags=re.S)
assert 'srcset="earth/' not in _art
for n in LOGOS:
    _art = _art.replace('"providers/' + n + '"', '"data:image/svg+xml;base64,' + base64.b64encode((root / "assets/providers" / n).read_bytes()).decode() + '"')
_art = re.sub(r'(<script type="application/json" id="nasadata">).*?(</script>)', r'\1null\2', _art, count=1, flags=re.S)
(root / "dist/artifact.html").write_text(_art, encoding="utf-8")
# The page's script (model.js and app.js) is a file of its own, not inline: the HTML was 114 KB gzipped with it, and on a slow phone
# line every byte of it came before the hero's poster. It is named by a hash of its content so a new deploy never meets an old copy in a
# cache, and kept by the service worker. The artifact keeps it inline, since it has no files beside it.
# The hero's photo is on every screen, so the script is asked for only once the photo has been painted (its largest contentful
# paint entry; where there is none, as in Safari, once it has decoded and a frame has passed), so the
# poster, the phone's largest paint, has the line to itself (on a slow line the script came first and delayed it by about a second);
# 3 s at most. Everywhere else it loads at once (the first paint there is text), and so it does when the page is hidden until boot
# (class dl: a shared link, or a hero the build wrote outside its time window). The countdown's digits are filled in before that from
# the inlined feed (COUNT_JS, the same rule as the hero's launch: the first one not gone more than 15 minutes), so they never show 00.
COUNT_JS = ('<script>(function(){try{var f=JSON.parse(document.getElementById("feeddata").textContent),n=Date.now(),L=((f&&f.launches)||[]).filter(function(l){return Date.parse(l.utc)>n-9e5})[0];'
            'if(!L)return;var s=Math.max(0,Math.round((Date.parse(L.utc)-n)/1e3)),p=function(v){return(v<10?"0":"")+v};'
            '[["cD",Math.min(99,Math.floor(s/86400))],["cH",Math.floor(s%86400/3600)],["cM",Math.floor(s%3600/60)],["cS",s%60]].forEach(function(x){var e=document.getElementById(x[0]);if(e)e.textContent=p(x[1])})}catch(e){}})()</script>')
LOADER_JS = ('<script>(function(){var d=0;function go(){if(d)return;d=1;var s=document.createElement("script");s.src="__APPJS__";document.body.appendChild(s)}'
             'var i=document.querySelector("#heroPst img"),c=document.documentElement.classList,P=window.PerformanceObserver;'
             'if(!c.contains("vid")||c.contains("dl")||!i||!i.getAttribute("src"))return go();setTimeout(go,3000);'
             'if(P&&(P.supportedEntryTypes||[]).indexOf("largest-contentful-paint")>=0)new P(function(l){l.getEntries().forEach(function(e){if(e.element===i)go()})}).observe({type:"largest-contentful-paint",buffered:true});'
             'else(i.decode?i.decode():Promise.resolve()).then(function(){requestAnimationFrame(function(){setTimeout(go,0)})},go)})()</script>')
_page = out.read_text(encoding="utf-8")
_m = list(re.finditer(r"<script>\n(.*?)\n</script>\n<script>\n(.*?)\n</script>", _page, re.S))
assert len(_m) == 1, "the model and app scripts were not found at the end of the page"
_js = _m[0].group(1) + "\n;\n" + _m[0].group(2) + "\n"
APPJS = "app-" + __import__("hashlib").sha256(_js.encode("utf-8")).hexdigest()[:10] + ".js"
for _old in (root / "dist").glob("app-*.js"):
    _old.unlink()
(root / "dist" / APPJS).write_text(_js, encoding="utf-8")
out.write_text(_page[:_m[0].start()] + (COUNT_JS if '"launches"' in _page else '') + LOADER_JS.replace("__APPJS__", APPJS) + _page[_m[0].end():], encoding="utf-8")
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
launch_pages.NASA_PHOTOS = (NASA or {}).get("missions") or {}
_made, _big = launch_pages.build_pages(root / "dist", _feed, {p["key"]: p for p in json.loads((root / "data/providers.json").read_text(encoding="utf-8"))["providers"]},
                                       now, {"watch_opts": watch_opts, "is_live": is_live, "when_text": when_text, "others": OTHERS, "ratios": RATIOS},
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
SHELL = (["manifest.webmanifest", "favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png"]
         + [f"fonts/{f}.woff2" for _, _, f in FONTS] + ["providers/" + n for n in LOGOS] + [APPJS, "about/", "privacy/", "data/"])
_lh = hashlib.sha256()
for f in sorted(x for x in (root / "assets/earth").rglob("*.*") if x.suffix != ".md"):
    _lh.update(f.read_bytes())
_h = hashlib.sha256()
for f in ["index.html"] + SHELL:
    _h.update((root / "dist" / (f + "index.html" if f.endswith("/") else f)).read_bytes())
_sw = (root / "src/sw.js").read_text(encoding="utf-8").replace("__VERSION__", _h.hexdigest()[:12]).replace("__SHELL__", json.dumps(SHELL)).replace("__LOOPV__", _lh.hexdigest()[:12])
(root / "dist/sw.js").write_text(_sw, encoding="utf-8")
print(f"service worker version {_h.hexdigest()[:12]}, {len(SHELL) + 1} files kept")
