"""Live from space (/live/) and Space news (/news/), written by launch_pages.build_pages on the shared stylesheet, header and footer.

Everything on them is real data with its source and its time: data/nasa.json and data/news.json (scripts/fetch_nasa.py) at build time,
the ISS from the feed's orbital elements (CelesTrak, worked out in the visitor's browser by live.js with satellite.js), and, while the
page is open, a fresh copy of the space weather, the Earth events and the news from their own keyless, open APIs (live.js, news.js). A
source that failed keeps its last good copy and says when it is from. Nothing is made up: a card with no data is left out.
No hyphens in our own copy; headlines are the publishers' own words."""
import html
import json
from datetime import datetime, timezone

SITE = "https://astroradar.io/"
e = html.escape
CONNECT = ["https://services.swpc.noaa.gov", "https://eonet.gsfc.nasa.gov", "https://api.spaceflightnewsapi.net", "https://epic.gsfc.nasa.gov", "https://celestrak.org"]
# the news groups (fetch_nasa.group_of decides; news.js reads the same words from the page, so the two cannot drift)
# the fonts the first screen uses, preloaded so they arrive before the first paint (a late swap moved the page)
PRELOAD = '<link rel="preload" as="font" type="font/woff2" href="/fonts/barlow-condensed-600.woff2" crossorigin>\n<link rel="preload" as="font" type="font/woff2" href="/fonts/barlow-400.woff2" crossorigin>\n<link rel="preload" as="font" type="font/woff2" href="/fonts/barlow-600.woff2" crossorigin>\n'
GROUPS = (("launches", "Launches"), ("missions", "Missions"), ("science", "Science and more"))


def csp():
    return ('<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; script-src \'self\'; style-src \'self\'; img-src \'self\' https://epic.gsfc.nasa.gov; '
            "font-src 'self'; connect-src 'self' " + " ".join(CONNECT) + "; manifest-src 'self'; object-src 'none'; base-uri 'self'\">\n")


def _dt(s):
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def when(s, day_only=False):
    """Nov 11, 12:47 PM UTC (or Nov 11, 2026), in a <time> the scripts turn into the visitor's own time"""
    d = _dt(s)
    if not d:
        return ""
    if day_only:
        return f'<time datetime="{d:%Y-%m-%d}">{d:%b} {d.day}, {d.year}</time>'
    return (f'<time datetime="{d:%Y-%m-%dT%H:%M:%SZ}" data-lt>{d:%b} {d.day}, {d.hour % 12 or 12}:{d.minute:02d} '
            f'{"AM" if d.hour < 12 else "PM"} UTC</time>')


def stamp(v, key=""):
    """the card's freshness line: when the data was fetched, or that it is the last good copy"""
    lab = "Last updated" if v.get("stale") else "Updated"
    return f'<p class="upd2"{f" id={chr(34)}{key}{chr(34)}" if key else ""}>{lab} {when(v.get("at"))}</p>'


def credit(v, name):
    return f'<p class="cred">{e(v.get("credit") or name)} · <a href="{e(v["src"])}" target="_blank" rel="noopener">Source</a></p>'


def card(cls, title, inner, v, name, key=""):
    return f'<section class="lv {cls}"><h2>{title}</h2>{inner}{credit(v, name)}{stamp(v, key)}</section>\n'


def foot(v, name, key="", lab=None):
    """a card's source and time, one readable line at the foot of the card: who it is from, a link, and when it was fetched (Last updated
    for a copy the last fetch could not refresh); live.js rewrites the time when the browser fetches a fresh copy"""
    stale = v.get("stale")
    t = when(v.get("at"))
    upd = (f'<span class="upd2{" stale" if stale else ""}"{f" id={chr(34)}{key}{chr(34)}" if key else ""}>'
           f'{lab or ("Last updated" if stale else "Updated")} {t}</span>')
    return (f'<div class="lvc-f"><span class="cred">{e(v.get("credit") or name)} · <a href="{e(v["src"])}" target="_blank" rel="noopener">Source</a></span>'
            f"{upd}</div>")


def more(inner):
    return f'<details class="lvc-more"><summary>More</summary><div class="lvc-mi">{inner}</div></details>'


def lcard(cls, hid, title, vis, big, line, extra, v, name, key="", lab=None):
    """one dashboard card: the title, one big visual or number, one short line, the rest behind More, then the source and time"""
    return (f'<section class="lvc {cls}" aria-labelledby="{hid}"><h2 id="{hid}">{title}</h2>'
            f'{vis}{f"<p class={chr(34)}lvc-big{chr(34)}>{big}</p>" if big else ""}<p class="lvc-line">{line}</p>{more(extra) if extra else ""}'
            f"{foot(v, name, key, lab)}</section>\n")


def latlon(lat, lon):
    return f"{abs(lat):g}° {'N' if lat >= 0 else 'S'}, {abs(lon):g}° {'E' if lon >= 0 else 'W'}"


def epic_card(d):
    """the hero: today's whole Earth from EPIC, large (the build's copy first; live.js swaps in a newer one from EPIC's own API)"""
    v = d.get("epic") or {}
    if not v.get("utc"):
        return ""
    img = v.get("big") or v.get("img")
    pic = (f'<img id="epicImg" src="/{e(img[0])}" width="{img[1]}" height="{img[2]}" alt="The whole sunlit Earth from NASA\'s EPIC camera" '
           'fetchpriority="high" decoding="async">' if img else "")
    at = latlon(v["lat"], v["lon"]) if isinstance(v.get("lat"), (int, float)) else ""
    page = f' <a id="epicPage" href="{e(v["page"])}" target="_blank" rel="noopener">See that day on NASA EPIC</a>' if v.get("page") else ""
    return (f'<section class="lv-hero" aria-labelledby="h-epic"><figure class="lv-disk">{pic}</figure><div class="lv-ht">'
            '<h2 id="h-epic">Earth today</h2>'
            f'<p class="lvc-big">Taken <span id="epicWhen">{when(v["utc"])}</span></p>'
            f'<p class="lvc-line">The whole sunlit side of Earth from NASA\'s EPIC camera, about 1.5 million km away'
            f'{f", looking down on <span id={chr(34)}epicAt{chr(34)}>{at}</span>" if at else ""}.</p>'
            + more("<p>EPIC rides on the DSCOVR spacecraft at the point between Earth and the Sun where the two pulls balance, so it always sees the "
                   "day side. It takes a set of pictures through the day and NASA posts them a day or two later: this is the newest one, not a live "
                   f"camera.{page}</p>")
            + foot(v, "NASA EPIC team", "epicUpd") + "</div></section>\n")


def iss_card(feed):
    iss = (feed or {}).get("iss") or {}
    tle = iss.get("tle") or []
    if len(tle) != 2:
        return ""
    v = {"credit": "Orbital elements: CelesTrak", "src": "https://celestrak.org/", "at": iss.get("epoch"), "stale": iss.get("stale")}
    vis = ('<div class="iss-map" id="iss" data-l1="' + e(tle[0]) + '" data-l2="' + e(tle[1]) + '" data-epoch="' + e(iss.get("epoch") or "") + '">'
           '<img src="/live/world-960.webp" width="960" height="360" alt="" decoding="async">'
           '<svg viewBox="0 0 960 360" aria-hidden="true" preserveAspectRatio="none"><path class="iss-night" id="issNight" d=""/>'
           '<path class="iss-trk" id="issTrk" d=""/><g id="issDot" class="iss-dot" transform="translate(-20 -20)"><circle r="11" class="iss-ring"/><circle r="4.5"/></g></svg></div>')
    line = '<span id="issPass"><a href="/#sky">Set your ZIP code</a> to see when it next passes over you.</span>'
    extra = ("<p>The International Space Station circles Earth about every 92 minutes, some 400 km up. The line is its path for the next hour, "
             "the shaded half is night. You can see it with your own eyes when it passes over in sunlight while your sky is dark: a steady, bright, "
             "moving light, no blinking.</p><p>Its position and passes are worked out in your browser from its orbital elements; nothing is sent "
             "anywhere. The station's orbit is adjusted now and then, so a pass can move by a minute.</p>")
    return lcard("lv-iss", "h-iss", "The ISS right now", vis, '<span id="issNow">Over the map, worked out in your browser</span>', line, extra, v,
                 "CelesTrak", "issUpd", lab="Elements from")


# NOAA's own G scale (https://www.swpc.noaa.gov/noaa-scales-explanation): where aurora has been seen at each storm level
AURORA = ((9, "Extreme storm: aurora has been seen as far south as Florida and south Texas."),
          (8, "Severe storm: aurora has been seen as far south as Alabama and northern California."),
          (7, "Strong storm: aurora has been seen as far south as Illinois and Oregon."),
          (6, "Moderate storm: aurora has been seen as far south as New York and Idaho."),
          (5, "Minor storm: aurora is often seen at high latitudes, as far south as northern Michigan and Maine."),
          (0, "No storm: aurora stays near the Arctic (Alaska, northern Canada)."))


def aurora_of(kp):
    for k, t in AURORA:
        if kp >= k:
            return t
    return AURORA[-1][1]


def chance_of(kp):
    return "high" if kp >= 7 else "fair" if kp >= 5 else "low"


def kp_gauge(kp):
    """a half dial from 0 to 9: calm, unsettled and storm bands, and a needle at the Kp (live.js moves it)"""
    import math
    def pt(v, r):
        a = math.pi * (1 - v / 9)
        return f"{100 + r * math.cos(a):.1f} {100 - r * math.sin(a):.1f}"
    def arc(v0, v1, cls):
        return f'<path class="{cls}" d="M{pt(v0, 80)} A80 80 0 0 1 {pt(v1, 80)}"/>'
    ticks = "".join(f'<text x="{pt(v, 98).split()[0]}" y="{float(pt(v, 98).split()[1]) + 4:.1f}">{v}</text>' for v in (0, 3, 5, 7, 9))
    return (f'<div class="kp"><svg viewBox="0 0 200 112" role="img" aria-label="Kp index {kp:g} of 9">'
            + arc(0, 4, "kp-calm") + arc(4, 5, "kp-uns") + arc(5, 9, "kp-storm")
            + f'<g id="kpNeedle" transform="rotate({kp / 9 * 180 - 90:.1f} 100 100)"><path class="kp-n" d="M100 100 L100 30"/></g><circle cx="100" cy="100" r="5" class="kp-hub"/>'
            + f'<g class="kp-t">{ticks}</g></svg></div>')


def sun_card(d):
    v = d.get("sun") or {}
    if not v.get("summary") or "swpc" not in str(v.get("src")):
        return ""
    kp = float(v.get("kpNow", v.get("kp")) or 0)
    sc = v.get("scales") or {}
    lev = lambda k: "none" if str(sc.get(k, "0")) == "0" else k + str(sc.get(k))
    extra = (f'<p id="sunSum">{e(v["summary"])} The highest Kp of the last 3 days was {float(v.get("kp") or kp):g}.</p>'
             f'<ul class="scales" id="sunScales"><li><b>Radio blackouts</b> {lev("R")}</li><li><b>Radiation storms</b> {lev("S")}</li>'
             f'<li><b>Geomagnetic storms</b> {lev("G")}</li></ul>'
             "<p>Kp measures how much Earth's magnetic field is shaken by the Sun, from 0 (calm) to 9 (an extreme storm); 5 and up is a storm. "
             "The aurora words follow NOAA's own scale. Seeing it also needs a clear, dark sky away from city lights.</p>")
    return lcard("lv-sun", "h-sun", "Space weather", kp_gauge(kp),
                 f'<span id="kpLine">Kp {kp:g}</span> <span class="lvc-sub">aurora chance <b id="kpChance">{chance_of(kp)}</b></span>',
                 f'<span id="kpAur" data-aur="{e(json.dumps(AURORA))}">{aurora_of(kp)}</span>', extra, v, "NOAA SWPC", "sunUpd")


def neo_chart(lst):
    """distance in Moon distances on a line from Earth: each asteroid a dot, the Moon a ring, the closest named"""
    if not lst:
        return ""
    top = max(20, max(x["ld"] for x in lst))
    X = lambda ld: 16 + ld / top * 368
    dots = []
    for i, x in enumerate(sorted(lst, key=lambda r: r["ld"])):
        y = 50 + (i % 3 - 1) * 12
        dots.append(f'<circle cx="{X(x["ld"]):.1f}" cy="{y}" r="{7 if i == 0 else 5}" class="{"nd-1" if i == 0 else "nd"}"><title>{e(x["name"])}: {x["ld"]:g} Moon distances</title></circle>')
    ticks = "".join(f'<g class="nt"><path d="M{X(t):.1f} 74 v6"/><text x="{X(t) + (14 if t == 0 else 0):.1f}" y="100">{"Earth" if t == 0 else t}</text></g>' for t in range(0, int(top) + 1, 5))
    c = min(lst, key=lambda r: r["ld"])
    return (f'<div class="neo-ch"><svg viewBox="0 0 400 108" role="img" aria-label="{len(lst)} close approaches from {min(x["ld"] for x in lst):g} to '
            f'{max(x["ld"] for x in lst):g} Moon distances">'
            '<path class="nl" d="M16 74 H384"/><circle cx="16" cy="50" r="9" class="ne"/>'
            f'<circle cx="{X(1):.1f}" cy="50" r="5" class="nm"/><text class="nml" x="{X(1):.1f}" y="26">Moon</text>'
            + "".join(dots) + ticks + '</svg><p class="neo-ax">Distance in Moon distances (the Moon is 1)</p></div>')


def neo_card(d, mi):
    v = d.get("neo") or {}
    c = v.get("closest") or {}
    if not v.get("count") or not c.get("km"):
        return ""
    lst = [x for x in (v.get("list") or []) if isinstance(x.get("ld"), (int, float))]
    moon = (f"{c['ld']:g} times the Moon's distance" if c.get("ld", 9) >= 1 else f"closer than the Moon ({c['ld']:g} of its distance)")
    size = f" It is about {c['m'][0]} to {c['m'][1]} meters across, estimated from its brightness." if c.get("m") else ""
    rows = "".join(f'<li><b>{e(x["name"])}</b><span>{when(x.get("utc"))}, {mi(x["km"])}, {x["ld"]:g} Moon distances</span></li>'
                   for x in sorted(lst, key=lambda r: r["utc"])[:8])
    extra = (f"<p>{v['count']} asteroids pass within 7.5 million km (19 Moon distances) of Earth in the 7 days from the update. The closest, "
             f"{e(c['name'])}, passes on {when(c.get('date'), True)} at {mi(c['km'])}.{size} Close passes are normal: none of these is a threat.</p>"
             + (f'<ul class="neol">{rows}</ul>' if rows else ""))
    return lcard("lv-neo", "h-neo", "Asteroids this week", neo_chart(lst), f"{v['count']} close passes",
                 f"Closest: {e(c['name'])}, {moon}.", extra, v, "NASA JPL CNEOS", "neoUpd")


def events_card(d):
    v = d.get("events") or {}
    lst = v.get("list") or []
    if not lst:
        return ""
    cats = sorted((v.get("cats") or {}).items(), key=lambda kv: -kv[1])
    total = v.get("count", len(lst))
    mx = max([n for _, n in cats] or [1])
    bars = "".join(f'<li><span>{e(k)}</span><svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect width="{max(2, n / mx * 100):.0f}" height="8" rx="2"/></svg><b>{n}</b></li>' for k, n in cats[:5])
    items = "".join(f'<li><a href="{e(x["link"])}" target="_blank" rel="noopener">{e(x["title"])}</a><span>{e(x["cat"])} · {when(x["date"], True)}</span></li>'
                    for x in lst[:8])
    return lcard("lv-ev", "h-ev", "Earth events", f'<ul class="evbars" id="evBars">{bars}</ul>' if bars else "",
                 f'<span id="evCount">{total}</span> open now', f'<span id="evLast">Latest: {e(lst[0]["title"])}</span>',
                 f'<p>Natural events NASA and its partners are tracking, opened in the last 30 days.</p><ul class="evl" id="evList">{items}</ul>',
                 v, "NASA EONET", "evUpd")


def sources(rows):
    return ('<section class="lv-src"><h2>Data sources</h2><ul class="guide">'
            + "".join(f"<li><b>{n}</b>: {t}</li>" for n, t in rows) + "</ul></section>\n")


def live_page(d, feed, ctx, page):
    cards = [iss_card(feed), sun_card(d), neo_card(d, ctx["mi"]), events_card(d)]
    n = sum(1 for c in cards if c)
    # four cards fill a grid with no holes (the ISS and Earth events take two columns); with fewer, equal columns
    grid = '<div class="lvgrid' + (" lvg4" if n == 4 else "") + '">' + "".join(c for c in cards if c) + "</div>\n"
    body = ('<p class="sub">Real data from NASA, NOAA and CelesTrak, each with its source and its time. Your browser checks for newer data while '
            "the page is open; a source that is down keeps its last good data and says when it is from.</p>\n"
            + epic_card(d) + grid
            + sources([
                ("Earth today", "NASA EPIC (the Earth Polychromatic Imaging Camera on DSCOVR): saved with the site and checked again by your browser."),
                ("The ISS right now", "CelesTrak's orbital elements for the station, saved with the site and checked again by your browser, which works "
                 "out where it is and its next pass over your saved ZIP code (nothing is sent anywhere)."),
                ("Space weather", "NOAA Space Weather Prediction Center: the Kp index, X ray flares and NOAA's scales; checked again by your browser. "
                 "The aurora words are NOAA's G scale."),
                ("Asteroids this week", "NASA JPL's close approach data (CNEOS), saved with the site (JPL does not allow browsers to ask it directly)."),
                ("Earth events", "NASA EONET: wildfires, storms, volcanoes and ice tracked by NASA and its partners; checked again by your browser."),
            ])
            + '<p class="muted">Astro Radar is not affiliated with NASA, NOAA or CelesTrak. NASA and NOAA data are public domain; the world map is '
            "NASA's Blue Marble (GIBS).</p>")
    return page("live", "Live from space", "Today's whole Earth from a million miles out, the ISS on a live map with its next pass over you, the aurora "
                "chance, this week's asteroids and Earth events: real NASA and NOAA data with its source and time.", body, ctx, here="live",
                head=PRELOAD + '<link rel="preload" as="image" href="/' + e(((d.get("epic") or {}).get("big") or ["nasa/epic-640.jpg"])[0]) + '" fetchpriority="high">\n'
                + '<script src="/live.js" defer></script>\n', csp=csp())


def news_item(a):
    snip = f'<p>{e(a["snip"])}</p>' if a.get("snip") else ""
    return (f'<li data-id="{e(str(a.get("id")))}"><a href="{e(a["url"])}" target="_blank" rel="noopener">{e(a["title"])}</a>'
            f'<span class="nsrc">{e(a["site"])} · {when(a["date"])}</span>{snip}</li>')


def news_page(n, ctx, page):
    lst = (n or {}).get("list") or []
    secs = ""
    for g, name in GROUPS:
        items = [a for a in lst if a.get("g") == g][:8]
        if items:
            secs += f'<section class="ns" data-g="{g}"><h2>{name}</h2><ul class="nl">' + "".join(news_item(a) for a in items) + "</ul></section>\n"
    if not secs:
        secs = '<p>The headlines could not be loaded. Try again later.</p>'
    import news_words
    body = ('<p class="sub">The latest space headlines from publishers around the world, through the Spaceflight News API. Each links to the '
            "full story on the publisher's own site.</p>\n"
            + '<div class="nfresh">' + (stamp(n, "newsUpd") if n else "") + '<button class="btn" type="button" id="newsShow" disabled>Show newer headlines</button></div>\n'
            + f'<div class="news" id="news" data-lw="{e(news_words.LAUNCH)}" data-mw="{e(news_words.MISSION)}">' + secs + "</div>\n"
            + sources([
                ("Where the stories come from", "the Spaceflight News API by The Space Devs, which gathers headlines from space news sites, agencies and "
                 "companies. Astro Radar shows only each headline, the publisher, the date and the first line of its summary, and links to the publisher; "
                 "it never copies an article."),
                ("How they are grouped", "by Astro Radar, from the words in each headline: launches and rockets, then missions and spacecraft, then the rest."),
                ("How fresh", "fetched with the site and checked again by your browser while the page is open."),
            ])
            + '<p class="muted">Headlines are their publishers\' own words. Astro Radar is not affiliated with the Spaceflight News API or any publisher.</p>')
    return page("news", "Space news", "The latest space headlines, grouped as launches, missions and science, each linking to its publisher.",
                body, ctx, here="news", head=PRELOAD + '<script src="/news.js" defer></script>\n', csp=csp())


def numbers(feed, providers, now):
    """By the numbers, from our own feed only: launches tracked, providers tracked, launches in the next 30 days, the last update"""
    if not isinstance(feed, dict) or not feed.get("generated"):
        return ""
    up = [f for f in feed.get("launches") or [] if isinstance(f, dict) and f.get("utc")]
    rec = [f for f in feed.get("recent") or [] if isinstance(f, dict)]
    soon = [f for f in up if (_dt(f["utc"]) or now) >= now and ((_dt(f["utc"]) or now) - now).days < 30]
    provs = {f.get("prov") for f in up + rec if f.get("prov")}
    cells = (("Launches tracked", len(up) + len(rec), "upcoming and flown in the last 7 days"),
             ("Launch providers", len(provs), f"with launches now, of {len(providers)} listed"),
             ("In the next 30 days", len(soon), "launches still to come"))
    return ('<section class="nums"><h2>By the numbers</h2><ul>' + "".join(f"<li><b>{n:,}</b><span>{k}</span><i>{t}</i></li>" for k, n, t in cells)
            + f'</ul><p class="muted">From the launch feed (Launch Library 2) as of {when(feed["generated"])}.</p></section>\n')


def write_all(dist, feed, ctx, page):
    root = ctx["root"]
    try:
        d = json.loads((root / "data/nasa.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        d = {}
    try:
        n = json.loads((root / "data/news.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        n = {}
    out = []
    for slug, text in (("live", live_page(d, feed, ctx, page)), ("news", news_page(n, ctx, page))):
        (dist / slug).mkdir(exist_ok=True)
        (dist / slug / "index.html").write_text(text, encoding="utf-8")
        out.append(SITE + slug + "/")
    return out
