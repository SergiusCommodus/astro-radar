"""A static page for every launch in the inlined feed (dist/launch/<id>/index.html), with the sitemap, robots.txt and the 404 page.

build.py calls build_pages() after it writes dist/index.html. Everything on a page comes from the feed and data/providers.json; the
visibility note is worked out from the pad, the launch time and the ranges in src/model.js (RANGE), and says it is an estimate. Each page
is small (under 20 KB): the shared files (launch.css, launch.js, mark.svg, the fonts and the share image) sit next to the main page.
"""
import html, json, math, pathlib, re, zlib
from datetime import datetime, timedelta, timezone

SITE = "https://astroradar.io/"
ID_OK = re.compile(r"[A-Za-z0-9_-]{1,80}")
STATUS = {"go": "Go for launch", "tbd": "Time to be confirmed", "hold": "On hold", "flight": "Launched"}
RESULT = {"success": "Success", "partial": "Partial failure", "failure": "Failure"}
DIRS = ["north", "north northeast", "northeast", "east northeast", "east", "east southeast", "southeast", "south southeast",
        "south", "south southwest", "southwest", "west southwest", "west", "west northwest", "northwest", "north northwest"]
R_EARTH = 6371.0
D = math.pi / 180
e = lambda s: html.escape(str(s), quote=True)


# ---------------------------------------------------------------- the sun, ported from src/model.js (sunPos, elOf, shadowFromEl, dest)
# a payload the feed does not name (ports of payloadOf, undisclosed, rocketOf, title and fullName in src/model.js: change them together;
# tests/test_seo.py checks they agree): empty, or the whole name is Unknown, TBD, TBA, TBC, N/A, None, Undisclosed or Classified, with
# Payload(s) or Satellite(s) after it and a question mark allowed. A real name only partly unknown (SatNet LEO Group TBD?) is kept
UNK = re.compile(r"^(unknown|tb[dac]|n/a|none|undisclosed|classified)( (payloads?|satellites?))?\??$", re.I)


def payload_of(name):
    s = re.sub(r"\s+", " ", str(name or "")).strip()
    return s[s.index(" | ") + 3:].strip() if " | " in s else s


def undisclosed(name):
    s = payload_of(name)
    return not s or bool(UNK.match(s))


def rocket_of(name, vehicle=""):
    v, s = str(vehicle or "").strip(), str(name or "")
    if not v and " | " in s:
        v = s[:s.index(" | ")].strip()
    return re.sub(r"\s+Block\s+\d+.*$", "", v, flags=re.I)


def title_of(name, vehicle=""):
    """The headline: the launch's own name, or for a payload not disclosed the rocket and the word Launch (Long March 2D Launch)."""
    if not undisclosed(name):
        return re.sub(r"\s+", " ", str(name)).strip()
    v = rocket_of(name, vehicle)
    return v + " Launch" if v else "Launch"


def full_name(name, vehicle=""):
    """The rocket and the payload in one line, the rocket only once."""
    return title_of(name, vehicle) if undisclosed(name) else (str(vehicle or "").strip() + " " + title_of(name, vehicle)).strip()


def page_title(f):
    """The name · rocket title of a launch page, the calendar and Share to Astro: the headline alone for a payload not disclosed."""
    return title_of(f.get("mis"), f.get("veh")) if undisclosed(f.get("mis")) else f"{title_of(f.get('mis'))} · {f.get('veh')}"


def short_name(name, vehicle=""):
    """A port of ORB.shortName in src/model.js (change the two together; tests/test_seo.py checks they agree on every fixture name):
    the part after the vehicle and pipe, Group and Launch words dropped, parentheses dropped or folded in, the rocket for an unknown
    payload, at most 24 characters cut at a word."""
    s, v = str(name or "").strip(), str(vehicle or "").strip()
    if " | " in s:
        i = s.index(" | ")
        if not v:
            v = s[:i].strip()
        s = s[i + 3:].strip()
    s = re.sub(r"\s*\b(TB[DAC])\??\s*$", "", re.sub(r"\s+", " ", s), flags=re.I).strip()
    m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", s)
    if m:
        head, inner = m.group(1).strip(), m.group(2).strip()
        words = re.split(r"[\s-]+", head.lower())
        rep = any(w in words for w in re.split(r"[\s-]+", inner.lower()) if len(w) > 2)
        s = inner if not head else head if (rep or len(head) >= 12 or UNK.match(inner)) else head + " " + inner
    s = re.sub(r"\b(Group|Launch|Mission|Flight No\.?)\s+(?=[#\d])", "", s, flags=re.I)
    s = re.sub(r"\s+(Group|Launch|Mission)$", "", s, flags=re.I)
    s = re.sub(r"\s+", " ", s).strip()
    if not s or UNK.match(s):
        s = title_of("", v)
    if len(s) > 24:
        cut = s[:25]
        sp = cut.rfind(" ")
        s = re.sub(r"[\s,;:.]+$", "", cut[:sp] if sp > 10 else s[:23]) + "…"
    return s


HERE = pathlib.Path(__file__).resolve().parent


def share_image(f, when, path, provider_name, logo):
    """The launch's share card (og:image), 1200 by 630 JPEG: deep space with a few stars and the hero's NASA night photograph along the bottom, the
    provider's logo (assets/providers/png/, made by scripts/render_logo_pngs.cjs) or its name, the short name, the date and time in UTC,
    the vehicle and pad, and the Astro Radar mark. Needs Pillow; returns False without it (the page then keeps the site's image)."""
    try:
        from PIL import Image, ImageDraw, ImageFilter, ImageFont
    except ImportError:
        return False
    W, H = 1200, 630

    def font(n, size):
        try:
            return ImageFont.truetype(str(HERE / "assets" / "fonts" / n), size)
        except OSError:
            return ImageFont.load_default(size)

    im = Image.new("RGB", (W, H), (3, 5, 11))
    d = ImageDraw.Draw(im)
    for y in range(H):  # the page's gradient, darkest at the top
        k = y / H
        d.line([(0, y), (W, y)], fill=(round(3 + 3 * k), round(5 + 5 * k), round(11 + 13 * k)))
    rnd = __import__("random").Random(zlib.crc32(str(f.get("id")).encode()))
    for _ in range(90):
        x, y, a = rnd.randrange(W), rnd.randrange(int(H * .62)), rnd.randrange(70, 220)
        d.point((x, y), fill=(a, a, min(255, a + 25)))
    # the planet: the site's one scene, the hero's NASA night photograph (assets/earth/hero-wide-2560, ISS030E055569), its limb low on the
    # card under the text; its top rows are already faded into the page color
    ph = HERE / "assets" / "earth" / "hero-wide-2560.webp"
    if ph.exists():
        pim = Image.open(ph).convert("RGB")
        pim = pim.resize((W, round(pim.height * W / pim.width)), Image.LANCZOS)
        top = round(H * .74 - pim.height * .3)
        mask = Image.linear_gradient("L").resize((W, pim.height)).point(lambda v: min(255, v * 4))
        im.paste(pim, (0, top), mask)
    d = ImageDraw.Draw(im)
    # the provider: its logo, else its name
    x0, y0 = 72, 64
    lp = HERE / "assets" / "providers" / "png" / (pathlib.Path(logo).stem + ".png") if logo else None
    if lp and lp.exists():
        lg = Image.open(lp).convert("RGBA")
        s = min(56 / lg.height, 360 / lg.width)
        lg = lg.resize((max(1, round(lg.width * s)), max(1, round(lg.height * s))), Image.LANCZOS)
        im.paste(lg, (x0, y0 + (56 - lg.height) // 2), lg)
    else:
        d.text((x0, y0 + 6), str(provider_name or "").upper()[:28], font=font("barlow-600.woff2", 34), fill=(238, 240, 255))
    # the Astro Radar mark, top right
    mk = HERE / "assets" / "apple-touch-icon.png"
    tf = font("barlow-condensed-600.woff2", 34)
    label = "ASTRO RADAR"
    tw = d.textlength(label, font=tf)
    if mk.exists():
        m = Image.open(mk).convert("RGB").resize((52, 52), Image.LANCZOS)
        im.paste(m, (int(W - 72 - tw - 64), y0 + 2))
    d.text((W - 72 - tw, y0 + 10), label, font=tf, fill=(238, 240, 255))
    # the short name, as large as fits
    name = short_name(f.get("mis"), f.get("veh")).upper()
    size = 132
    while size > 56 and d.textlength(name, font=font("barlow-condensed-600.woff2", size)) > W - 144:
        size -= 4
    d.text((x0, 150), name, font=font("barlow-condensed-600.woff2", size), fill=(238, 240, 255))
    y = 150 + size + 14
    date = when.strftime("%a, %b ") + str(when.day) + " · " + f"{when.hour % 12 or 12}:{when.minute:02d} {'AM' if when.hour < 12 else 'PM'} UTC"
    d.text((x0, y), date.upper(), font=font("barlow-600.woff2", 36), fill=(196, 203, 227))
    pad = (f.get("pad") or {}).get("n") or ""
    d.text((x0, y + 52), " · ".join(x for x in ("Payload not disclosed" if undisclosed(f.get("mis")) else f.get("veh"), pad) if x)[:70], font=font("barlow-500.woff2", 30), fill=(167, 176, 206))
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "JPEG", quality=80, optimize=True, progressive=True)
    return True


def sun_el(lat, lon, when):
    n = when.timestamp() / 86400 + 2440587.5 - 2451545.0
    L = (280.46 + 0.9856474 * n) % 360
    g = ((357.528 + 0.9856003 * n) % 360) * D
    lam = (L + 1.915 * math.sin(g) + 0.02 * math.sin(2 * g)) * D
    eps = (23.439 - 0.0000004 * n) * D
    dec = math.asin(math.sin(eps) * math.sin(lam))
    ra = math.atan2(math.cos(eps) * math.sin(lam), math.cos(lam))
    gmst = (18.697374558 + 24.06570982441908 * n) % 24
    ha = (gmst * 15 + lon) * D - ra
    return math.asin(math.sin(lat * D) * math.sin(dec) + math.cos(lat * D) * math.cos(dec) * math.cos(ha)) / D


def shadow_km(s):
    return 0.0 if s >= 0 else R_EARTH * (1 / math.cos(-s * D) - 1)


def dest(lat, lon, brg, km):
    d = km / R_EARTH
    p1, l1, b = lat * D, lon * D, brg * D
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return p2 / D, ((l2 / D + 540) % 360) - 180


def ranges(model_js):
    """RANGE from src/model.js, so the page and the model never disagree."""
    m = re.search(r"var RANGE=\{([^}]*)\}", model_js)
    return {k: float(v) for k, v in re.findall(r"(\w+):([\d.]+)", m.group(1))} if m else {}


# the page's rule (distTxt in src/app.js): whole miles and whole kilometres, rounded half up like Math.round
def mi(km):
    return f"{int(km * 0.621371 + 0.5):,} mi ({int(km + 0.5):,} km)"


def sky_note(f, when, rng):
    """Plain sentences about what the light allows for this launch, from the pad's sun at liftoff and the sun on the rocket a few minutes up.
    None when the feed lacks what it needs."""
    r = sky_reach(f, when, rng)
    return r[0] if r else None


def sky_reach(f, when, rng):
    """sky_note's sentences and the distance in km they quote for this light (how far such a launch is usually seen), or None"""
    pad = f.get("pad") or {}
    lat, lon, az = pad.get("lat"), pad.get("lon"), f.get("az")
    if not all(isinstance(x, (int, float)) for x in (lat, lon)) or not rng:
        return None
    s0 = sun_el(lat, lon, when)
    out = []
    if s0 > 0:
        reach = rng.get("day", 200)
        out.append(f"Liftoff is in daylight at the pad. In daylight a rocket shows only as a white exhaust trail, which people usually see from within about {mi(rng.get('day', 200))}.")
    else:
        rising = sun_el(lat, lon, when + timedelta(minutes=20)) > s0
        when_word = "before sunrise" if rising else "after sunset"
        lit = False
        if isinstance(az, (int, float)) and f.get("v") not in ("NS", "SUB"):
            # about four minutes up a typical orbital rocket is near 150 km high and 400 km downrange
            rl, ro = dest(lat, lon, az, 400)
            lit = 150 > shadow_km(sun_el(rl, ro, when + timedelta(minutes=4))) + 3
        reach = rng.get("lit", 950) if lit else rng.get("glowTwilight", 150) if s0 > -6 else rng.get("nightFirst", 400)
        if lit:
            out.append(f"Liftoff is {when_word} at the pad, and the rocket should climb high enough to reach sunlight while the ground below is dark. "
                       f"Sunlit exhaust can glow against the darker sky, the view people have reported from as far as about {mi(rng.get('lit', 950))}.")
        elif s0 > -6:
            out.append(f"Liftoff is in twilight at the pad ({when_word}). The sky is still bright, so the engine flame shows only to people fairly close, within about {mi(rng.get('glowTwilight', 150))}.")
        else:
            out.append(f"Liftoff is in the dark at the pad. You would see the engine flame, which fades quickly with distance: people usually see it from within about {mi(rng.get('nightFirst', 400))}.")
    if isinstance(az, (int, float)):
        out.append(f"It should head {DIRS[round(az / 22.5) % 16]} from the pad. We guess the heading from the target orbit, so the real path can differ.")
    return out, reach


def ordinal(n):
    n = int(n)
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def cd_text(s, st=None):
    """the countdown's words, as launch.js writes them (written at build time so the first paint is close; the script corrects it)"""
    s = round(s)
    if s > 0:
        d, h, m = s // 86400, s % 86400 // 3600, s % 3600 // 60
        x = "Liftoff in " + (f"{d} {'days' if d > 1 else 'day'} {h} h" if d else f"{h} h {m:02d} min" if h else f"{m} min {s % 60:02d} s")
        return x + (", time to be confirmed" if st == "tbd" else "")
    a = round(-s / 60)
    return "Liftoff now" if a < 1 else f"Launched {a} {'minutes' if a > 1 else 'minute'} ago" if a < 90 else f"Liftoff was {round(a / 60)} hours ago"


def summary(f, kind, pname, utc_txt):
    """A plain mission summary built only from the feed's own fields (Launch Library's description is not in the feed)"""
    pad = f.get("pad") or {}
    padn, padfull = pad.get("n") or "", pad.get("full") or ""
    loc = padfull[len(padn):].lstrip(", ") if padn and padfull.startswith(padn) else ""
    where = f"from {padn}" + (f" in {loc}" if loc else "") if padn else "from a pad not announced yet"
    s = []
    pl = "an undisclosed payload" if undisclosed(f.get("mis")) else f["mis"]
    if kind == "past":
        s.append(f"{f['veh']} launched {pl} for {pname} {where}, {utc_txt}.")
    elif f.get("st") == "flight":
        s.append(f"{f['veh']} launched {pl} for {pname} {where}, {utc_txt}, and is in flight.")
    else:
        s.append(f"{f['veh']} is set to launch {pl} for {pname} {where}, {utc_txt}" + (", a time still to be confirmed." if f.get("st") == "tbd" else "."))
    orbit, mt = f.get("orbit"), f.get("mt")
    if f.get("v") in ("NS", "SUB"):
        s.append("It is a suborbital flight: up into space and back down, not into orbit.")
    elif orbit and orbit != "To be announced":
        s.append(f"Target orbit: {orbit}.")
    if isinstance(mt, str) and mt:
        s.append(f"Mission type: {mt}.")
    b = f.get("bst")
    if isinstance(b, dict) and b.get("sn"):
        fl = b.get("fl")
        s.append(f"The first stage is booster {b['sn']}" + (f", on its {ordinal(fl)} flight." if isinstance(fl, int) and fl > 0 else "."))
    if isinstance(f.get("n"), int) and f["n"] > 0:
        s.append(f"It is {pname}'s {ordinal(f['n'])} launch.")
    return " ".join(x.replace(" - ", " ") for x in s)


# ---------------------------------------------------------------- page parts
def when_lines(when, tzname, when_text):
    utc = when.strftime("%a, %b ") + str(when.day) + " · " + f"{when.hour % 12 or 12}:{when.minute:02d} {'AM' if when.hour < 12 else 'PM'} UTC"
    local = when_text(when, tzname) if tzname and tzname != "UTC" else None
    return utc, local


NASA_PHOTOS = {}  # set by build.py from data/nasa.json: launch id to a photo from NASA's Image and Video Library


def nasa_photo(f, e):
    """a NASA launch's mission photo (saved at build time), with its credit and a link to it; nothing for other launches"""
    ph = NASA_PHOTOS.get(f.get("id")) if f.get("prov") == "nasa" else None
    if not ph or not isinstance(ph.get("img"), list) or len(ph["img"]) != 3 or not str(ph["img"][0]).startswith("nasa/m-"):
        return ""
    src, w, h = ph["img"]
    return (f'<figure class="ph"><img src="/{e(src)}" width="{int(w)}" height="{int(h)}" alt="{e(ph.get("title") or "A NASA photo of the mission")}" loading="lazy" decoding="async">'
            f'<figcaption>{e(ph.get("title") or "")} Photo: {e(ph.get("credit") or "NASA")}, '
            f'<a href="{e(ph.get("page") or "https://images.nasa.gov/")}" target="_blank" rel="noopener">NASA Image and Video Library</a>.</figcaption></figure>\n')


def astro_link(f, when, ctx):
    """Share to Astro: the link format astroShare in app.js makes (astro-app's /app/share reads launch, title, utc and url, and keeps url only
    on https://astroradar.io/). Astro then sends it to a chat as a message, or opens a plan called Watch and the title, the time filled in."""
    pid, iso = f["id"], when.strftime("%Y-%m-%dT%H:%M:%SZ")
    return (f"{ctx['astro']}/app/share?launch={ctx['q'](pid)}&title={ctx['q'](page_title(f))}&utc={ctx['q'](iso)}"
            f"&url={ctx['q'](SITE + '?launch=' + pid)}")


IND = ("Astro Radar is independent and is not affiliated with, endorsed by or sponsored by any launch provider or space agency shown here. "
       "Logos and names are trademarks of their owners, shown only to identify the launch provider.")
FOOT_LINKS = (("sky", "/#sky", "Your sky"), ("home", "/#launches", "Launches"), ("live", "/live/", "Live"), ("news", "/news/", "News"), ("watch", "/#watch", "Watch"), ("astro", "/astro/", "Astro"),
              ("providers", "/provider/", "Providers"), ("ksc", "/ksc/", "Florida"), ("about", "/about/", "About"), ("privacy", "/privacy/", "Privacy"),
              ("data", "/data/", "Data sources"))


def site_footer(here="", ind=IND):
    """The footer of every page on launch.css: the same links as the main page's footer, the independence line, and the data credit."""
    links = "".join(f'<a href="{u}"' + (' aria-current="page"' if k == here else "") + f">{t}</a>" for k, u, t in FOOT_LINKS)
    return (f'<footer><nav class="fnav" aria-label="More from Astro Radar">{links}</nav><p>{ind}</p>'
            '<p><a href="/">Astro Radar</a> · Launch data from <a href="https://thespacedevs.com/llapi" target="_blank" rel="noopener">Launch Library 2</a></p></footer>\n')


CHEV = '<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
NAV = (("home", "/#launches", "Launches"), ("live", "/live/", "Live"), ("news", "/news/", "News"), ("watch", "/#watch", "Watch"), ("astro", "/astro/", "Astro"))
NAV_MORE = (("sky", "/#sky", "Your sky"), ("providers", "/provider/", "Providers"), ("ksc", "/ksc/", "Florida"), ("about", "/about/", "About"),
            ("data", "/data/", "Data sources"))


def top_nav(here=""):
    """The header of every page on launch.css, the same as the main page's: Launches, Live, News, Watch, Astro, and More (Your sky,
    Providers, Florida, About, Data sources; on a phone Watch and Astro move into More too). More is a plain details element: no script."""
    cur = lambda k: ' aria-current="page"' if k == here else ""
    return ('<header class="top"><a class="brand" href="/"><img src="/mark.svg" width="28" height="28" alt="">Astro Radar</a>'
            '<nav class="tnav" aria-label="Astro Radar">'
            + "".join(f'<a class="n-{k}" href="{u}"{cur(k)}>{t}</a>' for k, u, t in NAV)
            + '<details class="tmore"><summary>More' + CHEV + '</summary><div class="tmore-p">'
            + "".join(f'<a class="m-{k}" href="{u}"{cur(k)}>{t}</a>' for k, u, t in NAV[3:] + NAV_MORE)
            + "</div></details></nav></header>\n")


AREAS = []  # assets/earth/areas/areas.json, read by build_pages


def _km(a1, o1, a2, o2):
    p1, p2, dp, dl = math.radians(a1), math.radians(a2), math.radians(a2 - a1), math.radians(o2 - o1)
    return 2 * 6371 * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))


def area_of(pad):
    """the launch area (assets/earth/areas/, NASA GIBS, one clear day) nearest the pad, if the pad is within 70 km of its centre"""
    if not (isinstance(pad.get("lat"), (int, float)) and isinstance(pad.get("lon"), (int, float))):
        return None
    best = min(AREAS, key=lambda a: _km(pad["lat"], pad["lon"], a["lat"], a["lon"]), default=None)
    return best if best and _km(pad["lat"], pad["lon"], best["lat"], best["lon"]) <= 70 else None


def area_map(f):
    """Where it launches: the pad's area seen from space (a still NASA satellite picture, 256 km across, north up) with the pad marked.
    An inline SVG, so the mark needs no inline style (the launch pages' policy allows none); nothing when no area covers the pad."""
    pad = f.get("pad") or {}
    a = area_of(pad)
    if not a:
        return ""
    s = a["s"]  # south, west, north, east
    x = (pad["lon"] - s[1]) / (s[3] - s[1]) * 1024
    y = (s[2] - pad["lat"]) / (s[2] - s[0]) * 1024
    day = datetime.strptime(a["d"], "%Y-%m-%d")
    name = e(pad.get("n") or "The pad")
    return ('<figure class="amap"><svg viewBox="0 0 1024 1024" role="img" aria-label="' + name + ' marked on a satellite picture of the area">'
            f'<image href="/earth/areas/{e(a["k"])}.webp" width="1024" height="1024"/>'
            f'<circle cx="{x:.0f}" cy="{y:.0f}" r="26" fill="none" stroke="#fff" stroke-width="4"/>'
            f'<circle cx="{x:.0f}" cy="{y:.0f}" r="6" fill="#fff"/></svg>'
            f'<figcaption><b>Where it launches.</b> {name}, ringed, seen from space: NASA {e(a["src"])}, '
            f'{day.strftime("%b")} {day.day}, {day.year}, about 256 km across, north up.</figcaption></figure>\n')


def pn_links(f, ctx):
    """the launches before and after this one (upcoming launches in time order; a flown one links the next launch), so a page never ends"""
    prev, nxt = (ctx.get("nbr") or {}).get(f["id"], (None, None))
    out = ""
    for cls, lab, g in (("prev", "Earlier", prev), ("next", "Next launch", nxt)):
        if g:
            out += (f'<a class="{cls}" href="/launch/{e(g["id"])}/"><span>{lab}</span>'
                    f'<b>{e(short_name(g.get("mis"), g.get("veh")))}</b><i>{e(g.get("veh") or "")}</i></a>')
    return f'<nav class="pn" aria-label="Other launches">{out}</nav>\n' if out else ""


def astro_block(f, when, kind, ctx, share):
    """Watch it with friends: what Share to Astro does for this launch, in Astro's own terms; only before liftoff (a plan needs a time to come)."""
    if kind != "up" or f.get("st") == "flight" or when <= ctx["now"]:
        return ""
    t = e(page_title(f))
    tbd = " The time is still to be confirmed, so check it again before the day." if f.get("st") == "tbd" else ""
    return ('<section class="astro-b"><h2>Watch it with friends</h2>'
            f"<p>Send {t} to a group chat on Astro, or make it a plan: Astro opens a new plan called Watch {t} with the day and time "
            f"filled in, for a group or a friend.{tbd}</p>"
            f'<div class="acts"><a class="btn pri" href="{e(share)}" target="_blank" rel="noopener">Make it a plan on Astro<small>Opens Astro in a new tab</small></a>'
            '<a class="btn" href="/astro/">How it works</a></div>'
            "<p class=\"muted\">Astro asks you to sign in first, then brings you back to this launch. It gets only the launch's name, time and "
            "link, and only when you press the button. Astro is for people 18 and older.</p></section>\n")


# ---------------------------------------------------------------- Look Up (docs/LOOKUP.md): the trust strip, the change log, the Look Up
# card, the sonic boom note and launch day mode. Every line comes from the feed, providers.json or our own change log (changes.json,
# scripts/changelog.py); a field the feed does not have is said plainly, never filled in.
NP = {"SEC": "to the second", "MIN": "to the minute", "HR": "to the hour", "DAY": "to the day", "M": "to the month",
      "Q1": "to the quarter", "Q2": "to the quarter", "Q3": "to the quarter", "Q4": "to the quarter", "H1": "to the half year",
      "H2": "to the half year", "Y": "to the year", "NEC": "to the decade"}


def confidence(f):
    """(word, detail) for how sure the launch time is: Launch Library's net_precision (the feed's np) and status"""
    np_ = f.get("np")
    exact = np_ in ("SEC", "MIN")
    if exact and f.get("st") in ("go", "hold", "flight"):
        return "Confirmed", f"Time set {NP[np_]}"
    if exact:
        return "Not yet confirmed", f"Time set {NP[np_]}, waiting for the provider to confirm"
    if np_ in NP:
        return "Estimated", f"Time known only {NP[np_]}"
    return "Not given", "The feed does not say how exact the time is"


def _hm(sec):
    sec = int(abs(sec))
    h, m = divmod(sec // 60, 60)
    d, h = divmod(h, 24)
    out = (f"{d} d " if d else "") + (f"{h} h " if h else "") + (f"{m} min" if m or not (d or h) else "")
    return out.strip()


def _iso(s):
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None


def window_text(f, when_text):
    ws, we = _iso(f.get("ws")), _iso(f.get("we"))
    if not ws or not we or we <= ws:
        return ""
    return f"Window {when_text(ws, "UTC").split(' · ')[-1]} to {when_text(we, "UTC").split(' · ')[-1]} ({_hm((we - ws).total_seconds())})"


def change_line(c, when_text):
    """one entry of the change log in words"""
    k = c.get("k")
    fr, to = _iso(c.get("from")), _iso(c.get("to"))
    if k in ("slip", "scrub") and fr and to:
        d = (to - fr).total_seconds()
        head = "Scrubbed, new time" if k == "scrub" else ("Moved later" if d > 0 else "Moved earlier")
        return f"{head} by {_hm(d)}: now {when_text(to, "UTC")}, was {when_text(fr, "UTC")}"
    if k == "scrub":
        return "Scrubbed, back to a time to be confirmed"
    if k == "status":
        return f"Status changed: {STATUS.get(c.get('from'), c.get('from') or 'none')} to {STATUS.get(c.get('to'), c.get('to') or 'none')}"
    if k == "np":
        return f"Time now known {NP.get(c.get('to'), 'less exactly')} (was {NP.get(c.get('from'), 'not given')})"
    if k == "gone":
        return "Left the launch list"
    return ""


def trust_strip(f, kind, ctx, changes):
    gen = ctx.get("gen_iso") or ""
    word, detail = confidence(f) if kind == "up" else ("Flown", "This launch has flown")
    win = window_text(f, ctx["when_text"]) if kind == "up" else ""
    n = len(changes or [])
    items = ['<li><span>Source</span><a href="https://thespacedevs.com/llapi" target="_blank" rel="noopener">Launch Library 2</a></li>',
             f'<li><span>Last checked</span><time datetime="{e(gen)}">{e(ctx["generated"])}</time></li>',
             f'<li><span>Time</span><b class="conf c-{word.split()[0].lower()}">{e(word)}</b><i>{e(detail)}{". " + e(win) if win else ""}</i></li>']
    if changes is not None:
        items.append(f'<li><span>Changes</span><a href="#changes">{n} seen</a></li>' if n else '<li><span>Changes</span><b>None seen</b></li>')
    return '<ul class="trust" aria-label="Where this comes from">' + "".join(items) + "</ul>\n"


def change_log(changes, ctx):
    if not changes:
        return ""
    rows = []
    for c in reversed(changes):
        line = change_line(c, ctx["when_text"])
        at = _iso(c.get("at"))
        if line and at:
            rows.append(f'<li><time datetime="{at.strftime("%Y-%m-%dT%H:%M:%SZ")}">{e(ctx["when_text"](at, "UTC"))}</time><span>{e(line)}</span></li>')
    if not rows:
        return ""
    return ('<section class="chg" id="changes"><h2>Change log</h2><ol>' + "".join(rows) + "</ol>"
            '<p class="src">Seen by Astro Radar, which checks Launch Library every 30 minutes and keeps 45 days of changes. Times in UTC.</p></section>\n')


# who may hear a booster land back on land, from the bases' and SpaceX's own past notices (docs/LOOKUP.md section 4)
BOOM_AREAS = {"FL": "Brevard, Orange, Osceola, Indian River, Seminole, Volusia, Polk, St. Lucie and Okeechobee counties",
              "CA": "Santa Barbara, Ventura and San Luis Obispo counties",
              "TX": "Cameron County, including Brownsville and South Padre Island"}


def boom_note(f):
    land = f.get("land")
    if not isinstance(land, dict) or not land.get("t"):
        return ""
    t, raw_at = str(land.get("t")), str(land.get("at") or "")
    at, name = raw_at.replace("-", " "), str(land.get("n") or "").replace("-", " ")
    where = e(name or at or "a landing site")
    if t in ("RTLS",) or raw_at.upper().startswith(("LZ", "OLM")):
        area = BOOM_AREAS.get(((f.get("pad") or {}).get("st") or "").upper())
        who = (f"Past notices for landings here named residents of {area}." if area else
               "Who may hear it depends on the site; the provider's own notice for this flight will say.")
        return ('<section class="boom"><h2>Sonic boom</h2>'
                f'<p>The first stage is planned to land back on land at {where}{" (" + e(at) + ")" if at and name else ""}. A landing like this can make '
                f'one or more sonic booms a few minutes after liftoff. {who} Whether and where they are heard depends on the weather; the '
                f'provider\'s notice for this flight is the one to trust.</p></section>\n')
    if t in ("ASDS", "OCEAN", "ATL"):
        what = f"on the drone ship {where}" if t == "ASDS" else "at sea"
        return (f'<section class="boom"><h2>Sonic boom</h2><p>The first stage is planned to land {what}, far offshore. A landing that far out is '
                'not usually heard on land.</p></section>\n')
    return ""


def t_rel(sec):
    s = int(sec)
    sign = "T−" if s < 0 else "T+"
    s = abs(s)
    h, r = divmod(s, 3600)
    m, x = divmod(r, 60)
    return sign + (f"{h}:{m:02d}:{x:02d}" if h else f"{m}:{x:02d}")


def launch_day(f, when, ctx, changes):
    """within 24 hours of liftoff (at build time) the page leads with the status and the provider's timeline"""
    left = (when - ctx["now"]).total_seconds()
    if not (0 < left <= 86400) or f.get("st") == "flight":
        return ""
    scrub = next((c for c in reversed(changes or []) if c.get("k") == "scrub"), None)
    st = f.get("st")
    word = "Scrubbed" if scrub and (_iso(scrub.get("at")) or ctx["now"]) > ctx["now"] - timedelta(hours=24) else {"go": "Go", "hold": "Hold"}.get(st, "Time to be confirmed")
    cls = {"Go": "go", "Hold": "hold", "Scrubbed": "scrub"}.get(word, "tbd")
    tl = f.get("tl") if isinstance(f.get("tl"), list) else []
    rows = []
    for item in tl[:40]:
        try:
            sec, what = int(item[0]), re.sub(r"(?<=\w)-(?=\w)", " ", str(item[1]))
        except (TypeError, ValueError, IndexError):
            continue
        at = when + timedelta(seconds=sec)
        rows.append(f'<li><b class="tnum">{t_rel(sec)}</b><span>{e(what)}</span><time datetime="{at.strftime("%Y-%m-%dT%H:%M:%SZ")}">{e(ctx["when_text"](at, "UTC").split(" · ")[-1])}</time></li>')
    body = ('<ol class="tl">' + "".join(rows) + "</ol><p class=\"src\">Timeline from Launch Library 2, as the provider published it; times move with the launch.</p>"
            if rows else '<p class="muted">No timeline from the provider yet.</p>')
    return (f'<section class="lday" aria-label="Launch day"><p class="lday-k">Launch day</p><p class="lday-s s-{cls}"><i aria-hidden="true"></i>{word}</p>'
            + (f'<p class="muted">{e(change_line(scrub, ctx["when_text"]))}</p>' if word == "Scrubbed" else "") + body + "</section>\n")


def lookup_card(f, when, ctx, note):
    pad = f.get("pad") or {}
    if not (isinstance(pad.get("lat"), (int, float)) and isinstance(pad.get("lon"), (int, float))):
        return ('<section class="lu" id="lookup"><div class="lu-h"><h2>Look up</h2><span class="est">Estimate</span></div>'
                '<p>The pad for this launch is not announced yet, so where to look cannot be worked out.</p></section>\n')
    data = {"id": f["id"], "v": f.get("v"), "az": f.get("az"), "utc": f.get("utc"), "lat": pad["lat"], "lon": pad["lon"], "n": pad.get("n") or ""}
    js = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")
    expl = "".join(f"<p>{e(x)}</p>" for x in (note or []))
    return ('<section class="lu" id="lookup" aria-labelledby="luT"><div class="lu-h"><h2 id="luT">Look up</h2><span class="est">Estimate</span></div>'
            '<form class="lu-zip" id="luForm" novalidate><label for="luZip">Your ZIP code</label><div class="lu-in">'
            '<input id="luZip" name="zip" inputmode="numeric" autocomplete="postal-code" maxlength="5" pattern="[0-9]{5}" placeholder="32801">'
            '<button class="btn" type="submit">Check</button></div></form>'
            f'<div class="lu-out" id="luOut" aria-live="polite"><p class="lu-v lu-none">Enter a US ZIP code to see whether you can see it from there.</p>{expl}</div>'
            f'<p class="zipv" id="zipv" data-lat="{pad["lat"]}" data-lon="{pad["lon"]}" data-reach="{int(ctx.get("reach") or 0)}" hidden></p>'
            f'<script type="application/json" id="luData">{js}</script>'
            '<p class="src">Worked out for every second of the flight from the pad, the rocket and the heading for its target orbit (estimated, '
            'Launch Library does not publish it), the sun, and the National Weather Service forecast for your ZIP. <a href="/about/#view">How it works</a>.</p></section>\n')


def page(f, when, kind, ctx):
    """One launch page. kind is 'up' (upcoming or in flight) or 'past' (flown in the last 7 days)."""
    pid = f["id"]
    url = f"{SITE}launch/{pid}/"
    prov = ctx["providers"].get(f.get("prov")) or {}
    pname = prov.get("n") or "Launch provider"
    title = page_title(f)
    pl = "an undisclosed payload" if undisclosed(f.get("mis")) else f["mis"]
    pad = f.get("pad") or {}
    padfull = pad.get("full") or pad.get("n") or "Pad not announced yet"
    utc_txt, local_txt = when_lines(when, f.get("tz"), ctx["when_text"])
    iso = when.strftime("%Y-%m-%dT%H:%M:%SZ")
    if kind == "up":
        status = STATUS.get(f.get("st"), "Scheduled")
        desc = f"{f['veh']} launches {pl} for {pname} from {padfull}, {utc_txt}. Status, the official webcast, and where to look from your ZIP code."
    else:
        status = RESULT.get(f.get("res"), "Flown")
        desc = f"{f['veh']} launched {pl} for {pname} from {padfull}, {utc_txt}. Result: {status}. Replay and launch details."
    desc = desc.replace(" - ", " ")
    # watch links: the launch's own webcast, else the provider's live page (watch_opts in build.py, a port of watchOpts)
    acts = []
    opts = ctx["watch_opts"](f, ctx["providers"])
    if opts:
        a, b = opts
        label = "Watch the replay" if kind == "past" else ("Watch live" if ctx["is_live"](f, when, ctx["now"]) else "Watch page")
        acts.append(f'<a class="btn pri" href="{e(a["url"])}" target="_blank" rel="noopener">{label}<small>{e(a["src"])}</small></a>')
        if b:
            acts.append(f'<a class="btn" href="{e(b["url"])}" target="_blank" rel="noopener">{e(b.get("name", pname))} live page<small>{e(b["src"])}</small></a>')
    else:
        acts.append('<span class="none">No official stream announced yet.</span>')
    share = astro_link(f, when, ctx)
    acts.append(f'<a class="btn" href="{e(share)}" target="_blank" rel="noopener">Share to Astro</a>')
    if kind == "up":
        acts.append(f'<a class="btn" href="launch.ics" download="{e(pid)}.ics">Add to calendar</a>')
    padn = pad.get("n") or ""
    loc = padfull[len(padn):].lstrip(", ") if padn and padfull.startswith(padn) else ""
    facts = [("Liftoff", f'<time datetime="{iso}" data-local>{e(utc_txt)}</time>' + (f'<span>{e(local_txt)} at the pad</span>' if local_txt else "")),
             ("Status" if kind == "up" else "Result", e(status)),
             ("Vehicle", e(f["veh"])), ("Pad", e(padn or padfull))]
    if loc:
        facts.append(("Location", e(loc)))
    if f.get("orbit"):
        facts.append(("Orbit", e(f["orbit"])))
    if f.get("mt"):
        facts.append(("Mission type", e(f["mt"])))
    if prov.get("key"):
        facts.append(("Provider", f'<a href="/provider/{e(prov["key"])}/">{e(pname)}</a>'))
    elif prov.get("site"):
        facts.append(("Provider", f'<a href="{e(prov["site"])}" target="_blank" rel="noopener">{e(pname)}</a>'))
    elif pname:
        facts.append(("Provider", e(pname)))
    if kind == "up" and f.get("st") != "flight":
        # subscribe links: this pad's and this provider's calendars (calendar_feeds.py), which follow slips like launches.ics
        cal = []
        pkey = f.get("site") or pad.get("full") or ""
        if pkey in (ctx.get("padcal") or {}):
            cal.append(f'<a href="/calendar/pad/{e(ctx["padcal"][pkey])}.ics">This pad</a>')
        if prov.get("key"):
            cal.append(f'<a href="/calendar/provider/{e(prov["key"])}.ics">{e(pname)}</a>')
        if cal:
            facts.append(("Calendars", " · ".join(cal)))
    if safe(f.get("info")):
        facts.append(("Mission page", f'<a href="{e(f["info"])}" target="_blank" rel="noopener">Official mission page</a>'))
    sky = ""
    changes = (ctx.get("changes") or {}).get(pid) if ctx.get("changes") is not None else None
    if ctx.get("changes") is not None and changes is None:
        changes = []
    if kind == "up" and f.get("st") != "flight":
        got = sky_reach(f, when, ctx["ranges"])
        note, reach = got if got else (None, None)
        ctx["reach"] = reach
        # the Look Up card (lookup.js fills it from a typed ZIP or the home ZIP saved on the radar, radar.zipinfo, this browser only)
        sky = lookup_card(f, when, ctx, note)
    # the share card the build drew for this launch (share_image), else the site's own
    img = SITE + f"launch/{pid}/share.jpg" if ctx.get("share_id") == f.get("id") else SITE + "og-image.jpg"
    alt = (f"{title}, payload not disclosed, on Astro Radar" if undisclosed(f.get("mis")) else
           f"{short_name(f.get('mis'), f.get('veh'))}: {f.get('veh')} launch on Astro Radar")
    ld = ""
    if kind == "up" and f.get("st") != "flight":
        # a launch our change log saw slip is rescheduled, with the time before its last move (Google's Event documentation)
        moved = next((c for c in reversed(changes or []) if c.get("k") in ("slip", "scrub") and c.get("from") and c.get("to")), None)
        ev = {"@context": "https://schema.org", "@type": "Event", "name": title, "description": desc, "startDate": iso, "url": url,
              "image": img, "eventStatus": "https://schema.org/EventRescheduled" if moved else "https://schema.org/EventScheduled",
              "eventAttendanceMode": "https://schema.org/MixedEventAttendanceMode" if opts else "https://schema.org/OfflineEventAttendanceMode"}
        place = {"@type": "Place", "name": pad.get("n") or padfull, "address": padfull}
        if isinstance(pad.get("lat"), (int, float)) and isinstance(pad.get("lon"), (int, float)):
            place["geo"] = {"@type": "GeoCoordinates", "latitude": pad["lat"], "longitude": pad["lon"]}
        ev["location"] = [place] + ([{"@type": "VirtualLocation", "url": opts[0]["url"]}] if opts else [])
        org = {"@type": "Organization", "name": pname}
        if prov.get("site"):
            org["url"] = prov["site"]
        ev["organizer"] = org
        if moved:
            ev["previousStartDate"] = moved["from"]
        ld ='<script type="application/ld+json">' + json.dumps(ev, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + "</script>\n"
    meta = "".join(f'<meta {k}="{n}" content="{e(v)}">\n' for k, n, v in (
        ("name", "description", desc), ("property", "og:type", "website"), ("property", "og:site_name", "Astro Radar"),
        ("property", "og:url", url), ("property", "og:title", title + " · Astro Radar"), ("property", "og:description", desc),
        ("property", "og:image", img), ("property", "og:image:width", "1200"), ("property", "og:image:height", "630"), ("property", "og:image:alt", alt),
        ("name", "twitter:card", "summary_large_image"), ("name", "twitter:title", title + " · Astro Radar"),
        ("name", "twitter:description", desc), ("name", "twitter:image", img), ("name", "twitter:image:alt", alt)))
    gen = ctx["generated"]
    short = short_name(f.get("mis"), f.get("veh"))
    official = ('<p class="full nd">Payload not disclosed</p>\n' if undisclosed(f.get("mis")) else
                f'<p class="full"><span class="sr">Official name: </span>{e(f["mis"])}</p>\n' if short.lower() != str(f["mis"]).lower() else "")
    cd = ""
    if kind == "up":
        left = (when - ctx["now"]).total_seconds()
        cd = (f'<p class="cd" data-cd="{iso}" data-st="{e(f.get("st") or "")}" aria-live="off">'
              + e(cd_text(left, f.get("st"))) + "</p>\n")
    about = summary(f, kind, pname, utc_txt)
    return ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
            "<meta name=\"theme-color\" content=\"#04050C\">\n" + ctx["csp"].replace("connect-src 'self'", "connect-src 'self' https://api.weather.gov") +
            f"<title>{e(title)} · Astro Radar</title>\n{meta}<link rel=\"canonical\" href=\"{url}\">\n"
            "<link rel=\"icon\" href=\"/favicon-32.png\" type=\"image/png\" sizes=\"32x32\">\n<link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\">\n"
            + ctx["manifest"] +
            "<link rel=\"preload\" as=\"font\" type=\"font/woff2\" href=\"/fonts/barlow-condensed-600.woff2\" crossorigin>\n"
            "<script src=\"/design.js\"></script>\n"
            "<link rel=\"stylesheet\" href=\"/launch.css\">\n" + ld + "</head>\n<body>\n"
            + top_nav() + f"<main class=\"lp{' is-day' if kind == 'up' and 0 < (when - ctx['now']).total_seconds() <= 86400 else ''}\">\n"
            "<header class=\"lp-head\">"
            f"<p class=\"pv\">{logo_chip(logo_of(f, ctx['providers'], ctx['others']), ctx['ratios'], 'card', brand=False)}</p>\n"
            f"<p class=\"kick\"><span class=\"dot {'up' if kind == 'up' else 'past'} st-{e(f.get('st') or f.get('res') or '')}\"></span>{e(status)} · {e(pname)}</p>\n"
            f"<h1>{e(short)}</h1>\n" + official + f"<p class=\"sub\">{e(f['veh'])} · {e(padfull)}</p>\n" + cd +
            "<div class=\"acts\">" + "".join(acts) + '<button class="btn" type="button" id="copyLink" hidden>Copy link</button>' + "</div>\n"
            + trust_strip(f, kind, ctx, changes) + "</header>\n"
            + (launch_day(f, when, ctx, changes) if kind == "up" else "") +
            "<div class=\"lp-cols\"><aside class=\"lp-side\">" + sky + (boom_note(f) if kind == "up" else "") +
            "<dl class=\"facts\">" + "".join(f"<div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in facts) + "</dl>\n"
            "</aside><div class=\"lp-main\">"
            f"<section class=\"about\"><h2>The mission</h2><p>{e(about)}</p>"
            # the mission's description from Launch Library (the feed's desc), credited; only when the feed has one
            + (f"<p>{e(f['desc'])}</p><p class=\"src\">Mission description from Launch Library 2.</p>" if isinstance(f.get("desc"), str) and f["desc"].strip() else "")
            + "</section>\n"
            + change_log(changes, ctx) + area_map(f) + nasa_photo(f, e) +
            f"<p class=\"radar\"><a href=\"/?launch={e(pid)}\">See it on the radar</a>: the countdown, the flight path and where to look from your ZIP code.</p>\n"
            + astro_block(f, when, kind, ctx, share) + pn_links(f, ctx) +
            f"<p class=\"upd\">From Launch Library 2, as of {e(gen)}. Times and status can change; <a href=\"/?launch={e(pid)}\">the radar</a> has the latest.</p>\n"
            "</div></div>\n</main>\n" + site_footer() +
            ("<script src=\"/model.js\" defer></script><script src=\"/lookup.js\" defer></script>\n" if sky and 'id="luData"' in sky else "") +
            "<script src=\"/launch.js\" defer></script>\n</body>\n</html>\n")


# Provider logos: data/providers.json gives a provider "logo" (a white SVG in assets/providers/, copied to dist/providers/) and "logoKind"
# ("word" when the logo spells the name, "mark" when it does not), or "mono" for a monogram badge; "others" does the same by Launch Library
# name for providers outside the list. Anything with neither gets a monogram from its name. logo_of and mono_of are ported to app.js
# (provLogo, monoOf): change them together.
MONO_SKIP = {"the", "of", "and", "co", "inc", "ltd", "llc", "corp", "corporation", "company", "group", "agency", "administration", "organisation",
             "organization", "space", "aerospace", "technology", "technologies", "science", "sciences"}


def mono_of(name):
    """Two or three letters for a provider with no logo: an acronym it starts with, else the initials of its main words."""
    words = [w for w in re.split(r"[^A-Za-z0-9]+", re.sub(r"\(.*?\)", " ", name or "")) if w]
    if not words:
        return "LP"
    if re.fullmatch(r"[A-Z0-9]{2,4}", words[0]):
        return words[0]
    keep = [w for w in words if w.lower() not in MONO_SKIP] or words
    if len(keep) == 1:
        caps = re.findall(r"[A-Z]", keep[0])
        return "".join(caps[:3]) if len(caps) > 1 else keep[0][:2].upper()
    return "".join(w[0] for w in keep[:3]).upper()


def _norm(n):
    return re.sub(r"[^a-z0-9]+", " ", (n or "").lower()).strip()


def logo_of(f, providers, others):
    """The provider of a launch as {n, logo, kind} or {n, mono}."""
    p = providers.get(f.get("prov"))
    if p:
        name, src = p["n"], p
    else:
        name = (f.get("pv") or {}).get("n") or "Launch provider"
        src = next((o for o in others if _norm(name) in [_norm(x) for x in o.get("names", [])]), {})
    if src.get("logo"):
        return {"n": name, "logo": src["logo"], "kind": src.get("logoKind", "mark"), "bc": src.get("brand", "")}
    return {"n": name, "mono": src.get("mono") or mono_of(name), "bc": src.get("brand", "")}


def svg_ratio(path):
    """Width over height from an SVG's viewBox."""
    m = re.search(r'viewBox="([-\d. ]+)"', path.read_text(encoding="utf-8"))
    v = [float(x) for x in m.group(1).split()]
    return round(v[2] / v[3], 3)


CHIP = {"row": (28, 112), "hero": (36, 210), "card": (30, 150)}


def chip_size(r, k):
    """Port of chipSize in app.js: the area rule at the slot's height, no wider than the slot, never under 10 px tall."""
    h, mw = CHIP[k]
    hh = min(h, (3.2 / r) ** .5 * h)
    w = hh * r
    if w > mw:
        hh = max(10, mw / r)
        w = hh * r
    return int(w + .5), int(hh + .5)


def logo_chip(g, ratios, k, base="/", brand=True):
    """Port of logoChip in app.js: the provider's logo on its chip (a mark or monogram with the short name beside it). brand=False leaves
    out the inline brand color (the launch pages' policy allows no inline style)."""
    bc = f' style="--bc:{e(g["bc"])}"' if brand and g.get("bc") else ""
    if g.get("logo"):
        w, hh = chip_size(ratios.get(g["logo"], 3), k)
        word = g["kind"] == "word"
        inner = f'<img class="plogo" src="{base}{e(g["logo"])}" width="{w}" height="{hh}" alt="{e(g["n"]) if word else ""}">' + ("" if word else f'<span class="lchip-n">{e(g["n"])}</span>')
        m = "" if word else " lchip-m"
    else:
        same = g["mono"].upper() == str(g["n"]).upper()  # a monogram that is the name already shows it once
        inner = f'<span class="pmono" aria-hidden="true">{e(g["mono"])}</span><span class="{"sr" if same else "lchip-n"}">{e(g["n"])}</span>'
        m = " lchip-m"
    return f'<span class="lchip lchip-{k}{m}"{bc}>{inner}</span>'


def safe(u):
    return isinstance(u, str) and re.fullmatch(r"https://[^\s\"'<>]+", u) is not None


CSS = """@font-face{font-family:'Barlow Condensed Fallback';src:local('Arial Narrow');font-weight:500;size-adjust:82.78%;ascent-override:120.8%;descent-override:24.16%;line-gap-override:0%;font-display:swap}
@font-face{font-family:'Barlow Condensed Fallback';src:local('Arial Narrow Bold'),local('ArialNarrow-Bold');font-weight:600;size-adjust:83.36%;ascent-override:119.96%;descent-override:23.99%;line-gap-override:0%;font-display:swap}
@font-face{font-family:'Barlow Fallback';src:local('Arial'),local('ArialMT');font-weight:400 500;size-adjust:91.4%;ascent-override:109.41%;descent-override:21.88%;line-gap-override:0%;font-display:swap}
@font-face{font-family:'Barlow Fallback';src:local('Arial Bold'),local('Arial-BoldMT');font-weight:600;size-adjust:88.6%;ascent-override:112.87%;descent-override:22.57%;line-gap-override:0%;font-display:swap}
@font-face{font-family:'Barlow';font-weight:400;font-display:swap;src:url(/fonts/barlow-400.woff2) format('woff2')}
@font-face{font-family:'Barlow';font-weight:600;font-display:swap;src:url(/fonts/barlow-600.woff2) format('woff2')}
@font-face{font-family:'Barlow Condensed';font-weight:600;font-display:swap;src:url(/fonts/barlow-condensed-600.woff2) format('woff2')}
:root{--bg:#04050C;--fg:#EEF0FF;--fg-2:#A3ABD1;--fg-3:#8089B5;--line:rgba(185,168,255,.16);--accent:#B9A8FF;--violet:#7C5CFF;--go:#45E0A0}
*{box-sizing:border-box}
html{background:var(--bg);color:var(--fg);font:400 16px/1.55 Barlow,'Barlow Fallback',system-ui,sans-serif;-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;background:radial-gradient(1200px 600px at 70% -10%,rgba(124,92,255,.16),transparent 70%)}
a{color:var(--fg);text-decoration-color:var(--accent);text-underline-offset:3px}
a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.top,main,footer{max-width:880px;margin:0 auto;padding:0 20px}
.top{display:flex;align-items:center;justify-content:space-between;min-height:76px}
.brand{display:flex;align-items:center;gap:10px;font-weight:600;font-size:13px;letter-spacing:.28em;text-transform:uppercase;text-decoration:none}
.all{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--fg-2);text-decoration:none;padding:12px 0}
.all:hover{color:var(--fg)}
.kick{margin:28px 0 12px;font-size:12px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--fg-2);display:flex;align-items:center;gap:10px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--go)}.dot.past{background:var(--fg-3)}
.pv{display:flex;align-items:center;gap:12px;margin:36px 0 -8px;min-height:48px;font-size:12px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--fg-2)}
.fl{list-style:none;margin:0;padding:0;display:grid;gap:10px}.fl li{display:grid;gap:2px}.fl a{font-weight:600;color:#EEF0FF}.fl span{color:#C4CBE3}.fl time{color:#A7B0CE}
.place{margin:18px 0}.place h3{margin:0 0 6px;font-size:20px}.place p{margin:6px 0}.dist{color:#C4CBE3}.src{font-size:15px;color:#A7B0CE}.guide{display:grid;gap:8px;padding-left:20px}
.qr{margin:26px 0 0;display:grid;gap:8px;justify-items:start}.qr img{background:#fff;padding:10px;border-radius:10px}.qr figcaption{font-size:15px;color:#C4CBE3}
.ph{margin:22px 0 0}.ph img{display:block;width:100%;height:auto;max-width:480px;border-radius:12px;background:#0B1228}.ph figcaption{margin-top:8px;font-size:14px;line-height:1.45;color:var(--fg2,#C4CBE3)}.ph a{color:#8DB4FF}
.plogo{display:block}
.lchip{display:inline-flex;align-items:center;gap:9px;min-height:48px;padding:8px 14px;border-radius:12px;background:rgba(255,255,255,.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);text-transform:none;letter-spacing:.04em}
.lchip-n{font-size:14px;font-weight:600;color:var(--fg)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.pmono{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;padding:0 6px;border-radius:8px;background:rgba(124,152,255,.12);color:#A8C2FF;font-size:11px;letter-spacing:.08em}
h1{margin:0;font:600 clamp(44px,9vw,92px)/.95 'Barlow Condensed','Barlow Condensed Fallback',system-ui,sans-serif;text-transform:uppercase;letter-spacing:.01em;overflow-wrap:anywhere}
.sub{margin:14px 0 0;color:var(--fg-2);letter-spacing:.06em}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0;margin:34px 0 0;border-top:1px solid var(--line)}
.facts div{padding:16px 16px 16px 0;border-bottom:1px solid var(--line)}
dt{font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--fg-3)}
dd{margin:6px 0 0;font:600 20px/1.3 'Barlow Condensed','Barlow Condensed Fallback',system-ui,sans-serif;letter-spacing:.02em}
dd span{display:block;font:400 14px/1.4 Barlow,system-ui,sans-serif;color:var(--fg-2);letter-spacing:0;margin-top:4px}
.acts{display:flex;flex-wrap:wrap;gap:12px;margin:30px 0 0}
.btn{display:inline-flex;flex-direction:column;justify-content:center;min-height:48px;padding:10px 20px;border:1px solid var(--line);font-size:13px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;color:var(--fg)}
.btn small{font-size:11px;font-weight:400;letter-spacing:.04em;text-transform:none;color:var(--fg-2)}
.btn.pri{background:#5E48D8;border-color:#5E48D8}.btn.pri small{color:#E4DEFF}
.btn:hover{border-color:var(--accent)}
.none{color:var(--fg-2);padding:12px 0}
.radar{margin:28px 0 0;color:var(--fg-2)}
.sky{margin:40px 0 0;padding:24px 0 0;border-top:1px solid var(--line)}
.sky h2{margin:0 0 12px;font:600 26px/1.2 'Barlow Condensed','Barlow Condensed Fallback',system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em}
.sky p{margin:0 0 12px;color:var(--fg-2);max-width:68ch}
.upd{margin:28px 0 0;font-size:13px;color:var(--fg-3)}
.full{margin:10px 0 0;font-size:17px;color:var(--fg)}.full.nd{color:var(--fg-2)}
.cd{margin:14px 0 0;min-height:1.4em;font:600 22px/1.4 'Barlow Condensed','Barlow Condensed Fallback',system-ui,sans-serif;letter-spacing:.04em;color:var(--fg);font-variant-numeric:tabular-nums}
.about{margin:30px 0 0}.about h2{margin:0 0 10px;font:600 26px/1.2 'Barlow Condensed','Barlow Condensed Fallback',system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em}
.about p{margin:0;color:var(--fg-2);max-width:68ch}.info p,.info li{max-width:68ch}.info h2{margin-top:30px}footer .pages span{color:var(--fg)}.about p+p{margin-top:12px}.about .src{font-size:13px;color:var(--fg-3)}
.zipv{color:var(--fg)!important}
footer{margin-top:56px;padding-bottom:40px;border-top:1px solid var(--line);font-size:13px;color:var(--fg-3)}
footer p{margin:16px 0 0}
@media (max-width:480px){.btn{flex:1 1 100%}.top{min-height:56px}.pv{margin:14px 0 -10px}.kick{margin:18px 0 8px}
h1{font-size:clamp(36px,11vw,48px)}.sub{margin-top:8px;font-size:15px}.full{font-size:16px;margin-top:6px}.cd{font-size:20px;margin-top:10px}
.acts{margin-top:16px;gap:10px}.acts .btn:not(.pri){flex:1 1 40%;padding:10px 12px}.facts{margin-top:24px}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
/* the space look of the radar itself: deep navy, cool blue, soft glass blocks with no outline, the solid blue button (violet only in the mark) */
:root{--bg:#03050B;--fg-2:#A9B2D0;--fg-3:#8892B6;--line:rgba(150,175,255,.14);--accent:#8DB4FF;--cool:#8DB4FF;--btn:#3B66DA;--btn-2:#2A4FBF;--go:#3FD99A;--amber:#F2C15A;--live:#FF5468;
--glass:linear-gradient(180deg,rgba(124,152,255,.075),rgba(124,152,255,.022) 70%);--inner:inset 0 1px 0 rgba(196,214,255,.085),inset 0 0 36px rgba(92,132,255,.05);--r:14px}
body{background:radial-gradient(1100px 520px at 72% -12%,rgba(76,120,240,.13),transparent 70%),linear-gradient(180deg,var(--bg),#060A18 60%,var(--bg))}
a{text-decoration-color:rgba(141,180,255,.6)}a:hover{text-decoration-color:var(--cool)}a:focus-visible{outline-color:var(--cool)}
.top{position:sticky;top:0;z-index:5;background:rgba(3,5,11,.92);max-width:none;padding:0 max(20px,calc((100% - 840px)/2))}
.tnav{display:flex;align-items:center;gap:6px}.tnav a{display:inline-flex;align-items:center;min-height:44px;padding:0 10px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--fg-2);text-decoration:none}
.tnav a:hover,.tnav a[aria-current]{color:var(--fg)}.tnav .n-astro{color:var(--cool)}.ul.prov li{align-items:center}.info h1+.pv{margin:18px 0 0}.info .pv+.sub{margin-top:14px}.ul.prov .lchip{min-height:40px;padding:6px 12px}
.btn{flex-direction:column;border:0;border-radius:12px;background:var(--glass),rgba(11,18,40,.72);box-shadow:var(--inner),inset 0 0 0 1px rgba(150,175,255,.12);transition:background .2s,box-shadow .2s}
.btn:hover{border-color:transparent;box-shadow:var(--inner),inset 0 0 0 1px rgba(141,180,255,.34)}
.btn.pri{background:linear-gradient(180deg,var(--btn),var(--btn-2));box-shadow:0 8px 24px rgba(59,102,218,.28),inset 0 1px 0 rgba(255,255,255,.18);color:#fff}.btn.pri small{color:#DCE6FF}
.facts{border:0;border-radius:var(--r);background:var(--glass),rgba(6,10,24,.6);box-shadow:var(--inner);padding:4px 20px}
.facts div{border-bottom:0;border-top:1px solid var(--line)}.facts div:nth-child(-n+4){border-top:0}
dt{color:var(--cool);opacity:.9}.lchip{border-radius:12px}
.sky,.astro-b{border-top:0;position:relative}.sky::before,.astro-b::before{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,rgba(150,175,255,0),rgba(150,175,255,.22) 22%,rgba(150,175,255,.22) 78%,rgba(150,175,255,0))}
footer{border-top:0;position:relative}footer::before{content:"";position:absolute;left:20px;right:20px;top:0;height:1px;background:linear-gradient(90deg,rgba(150,175,255,0),rgba(150,175,255,.2) 22%,rgba(150,175,255,.2) 78%,rgba(150,175,255,0))}
.card{margin:22px 0 0;padding:22px 22px 20px;border-radius:var(--r);background:var(--glass),rgba(6,10,24,.6);box-shadow:var(--inner)}
.card h2,.card h3{margin:0 0 8px}.card p{margin:0 0 10px;color:var(--fg-2)}.card .acts{margin-top:16px}
.astro-b{margin:40px 0 0;padding:24px 0 0}.astro-b h2{margin:0 0 12px;font:600 26px/1.2 'Barlow Condensed','Barlow Condensed Fallback',system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em}
.astro-b p{margin:0 0 12px;color:var(--fg-2);max-width:68ch}.muted{font-size:15px;color:var(--fg-3)}
.steps{list-style:none;margin:18px 0 0;padding:0;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.steps li{display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:start;padding:16px;border-radius:12px;background:var(--glass),rgba(6,10,24,.5);box-shadow:var(--inner);color:var(--fg-2)}
.steps b{font:600 20px/1.2 'Barlow Condensed','Barlow Condensed Fallback',system-ui,sans-serif;color:#FFB57A}.steps strong{display:block;color:var(--fg);font-weight:600}
.ul{display:grid;gap:10px;list-style:none;margin:16px 0 0;padding:0}.ul li{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;padding:14px 16px;border-radius:12px;background:var(--glass),rgba(6,10,24,.5);box-shadow:var(--inner)}
.ul .t{display:grid;gap:2px;min-width:0}.ul .t a{font-weight:600}.ul .t span{font-size:14px;color:var(--fg-3)}.ul .btn{min-height:44px;padding:8px 16px;font-size:12px}
.steps{grid-template-columns:repeat(2,minmax(0,1fr))}.ul time+span::before{content:" · "}.info h1{font-size:clamp(40px,7vw,68px)}.info>.sub{margin-bottom:24px}
@media (max-width:640px){.steps{grid-template-columns:minmax(0,1fr)}.muted,.ul .t span{font-size:16px}.ul.prov .lchip{display:none}.facts{padding:2px 16px}.facts div:nth-child(-n+4){border-top:1px solid var(--line)}.facts div:first-child{border-top:0}}
/* redesign (docs/REDESIGN.md): one type scale with the main page. Display headings (h1, h2) in Barlow Condensed capitals, everything
   else in sentence case: labels, buttons and the nav. Spacing on the 8 px grid; every list of launches is a row of glass */
:root{--t-xs:13px;--t-s:15px;--t-m:17px}
html{font-size:17px}
.brand{font-size:13px;min-height:44px}
.tnav{gap:2px}.tnav a{font-size:var(--t-s);font-weight:500;letter-spacing:.01em;text-transform:none;padding:0 12px}
.tnav a[aria-current]{color:var(--fg);box-shadow:inset 0 -2px 0 var(--cool)}
.kick,.pv,dt,.btn,.all{letter-spacing:.01em;text-transform:none}
.kick,.pv{font-size:var(--t-s);font-weight:500}
dt{font-size:var(--t-xs);font-weight:600}
.btn{font-size:var(--t-s)}.btn small{font-size:var(--t-xs)}.ul .btn{font-size:var(--t-s)}
h1{font-size:clamp(40px,6vw,72px)}.info h1{font-size:clamp(40px,6vw,68px)}
h2,.sky h2,.about h2,.astro-b h2,.info h2{font:600 clamp(24px,2.6vw,30px)/1.15 'Barlow Condensed','Barlow Condensed Fallback',system-ui,sans-serif;text-transform:uppercase;letter-spacing:.02em;margin:40px 0 12px}
.card h2,.card h3{margin:0 0 8px}.card h2{font-size:24px}
h3{font:600 19px/1.3 Barlow,system-ui,sans-serif}
.sub{letter-spacing:0;font-size:var(--t-m)}
.cd{font-size:24px}
.fl{gap:10px;margin:16px 0 0}.fl li{padding:14px 16px;border-radius:12px;background:var(--glass),rgba(6,10,24,.5);box-shadow:var(--inner);gap:4px}
.fl span,.fl time{font-size:var(--t-s)}
.place{padding:18px 20px;border-radius:var(--r);background:var(--glass),rgba(6,10,24,.5);box-shadow:var(--inner)}
.place h3{font-size:20px}
.fnav{display:flex;flex-wrap:wrap;gap:0 4px;margin:20px 0 0}.fnav a{display:inline-flex;align-items:center;min-height:44px;padding:0 10px 0 0;margin-right:10px;color:var(--fg-2);text-decoration:none;font-size:var(--t-s)}
.fnav a:hover,.fnav a[aria-current]{color:var(--fg)}
footer{font-size:var(--t-s)}
.tnav a{white-space:nowrap}
@media (max-width:640px){.tnav a{padding:0 8px}h2,.sky h2,.about h2,.astro-b h2,.info h2{margin-top:32px}}
@media (max-width:520px){.brand{font-size:0;gap:0}}

.amap{margin:24px 0 0;max-width:440px}.amap svg{display:block;width:100%;height:auto;border-radius:var(--r);background:#0B1228}
.amap figcaption{margin-top:8px;font-size:var(--t-s);color:var(--fg-2)}.amap figcaption b{color:var(--fg);font-weight:600}
.pn{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:40px 0 0}
.pn a{display:grid;gap:2px;padding:14px 18px;border-radius:12px;background:var(--glass),rgba(6,10,24,.5);box-shadow:var(--inner);text-decoration:none;min-height:44px}
.pn a:hover{box-shadow:var(--inner),inset 0 0 0 1px rgba(141,180,255,.34)}
.pn span{font-size:var(--t-xs);color:var(--cool)}.pn b{font-weight:600;color:var(--fg)}.pn i{font-style:normal;font-size:var(--t-s);color:var(--fg-2)}
.pn .next{text-align:right}.pn .next:only-child{grid-column:1/-1}
/* Live from space and Space news (space_pages.py): one column of glass cards on a phone, two from 900 px; every card ends with its source
   and its time. News: three groups of headlines, each a plain row with the publisher and date */
.lvg{display:grid;gap:16px;margin:24px 0 0}@media (min-width:900px){.lvg{grid-template-columns:repeat(2,minmax(0,1fr));align-items:start}}
.lv{margin:0;padding:20px 22px;border-radius:var(--r);background:var(--glass),rgba(6,10,24,.6);box-shadow:var(--inner);min-width:0}
.lv h2{margin:0 0 10px}.lv p{margin:0 0 10px;color:var(--fg-2)}.lv p a{color:var(--fg)}
.lv .big{font:600 30px/1.1 'Barlow Condensed','Barlow Condensed Fallback',system-ui,sans-serif;color:var(--fg);margin-bottom:6px}
.lv-pic{margin:0 0 12px}.lv-pic img{display:block;width:100%;max-width:360px;height:auto;margin:0 auto;border-radius:50%;background:#000}
.iss p{color:var(--fg)}.iss-now{font-variant-numeric:tabular-nums;min-height:3.2em}.iss-pass{min-height:6.4em}@media (min-width:900px){.iss-pass{min-height:4.8em}}\n.nfresh{display:grid;justify-items:start;gap:8px;margin:16px 0 0}.nfresh .upd2{margin:0!important}.nfresh .btn{min-height:44px;padding:0 16px;visibility:hidden}.nfresh .btn.on{visibility:visible}
.scales{list-style:none;margin:6px 0 10px;padding:0;display:flex;flex-wrap:wrap;gap:8px 18px;color:var(--fg)}.scales b{font-weight:500;color:var(--fg-2)}
.evl{list-style:none;margin:6px 0 10px;padding:0;display:grid;gap:2px}.evl li{display:grid;gap:0}.evl a{display:flex;align-items:center;min-height:44px;color:var(--fg);font-weight:600}.evl span{margin-top:-8px}.evl span{font-size:var(--t-s);color:var(--fg-3)}
.cred{font-size:var(--t-s)}.cred a{color:var(--cool)!important}
.upd2{font-size:var(--t-s);color:var(--fg-3)!important;margin:0!important}
.lv-src,.ns{margin:32px 0 0}
.nl{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:10px}
.nl li{display:grid;gap:4px;padding:14px 16px;border-radius:12px;background:var(--glass),rgba(6,10,24,.5);box-shadow:var(--inner)}
.nl a{font-weight:600;color:var(--fg);text-decoration:none}.nl a:hover{text-decoration:underline}.nsrc{font-size:var(--t-s);color:var(--fg-3)}.nl p{margin:0;color:var(--fg-2)}
#newsUpd{margin-top:20px!important}
.nums ul{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.nums li{display:grid;gap:2px;padding:16px 18px;border-radius:12px;background:var(--glass),rgba(6,10,24,.5);box-shadow:var(--inner)}
.nums b{font:600 34px/1 'Barlow Condensed','Barlow Condensed Fallback',system-ui,sans-serif;color:var(--fg);font-variant-numeric:tabular-nums}.nums span{color:var(--fg)}.nums i{font-style:normal;font-size:var(--t-s);color:var(--fg-3)}
@media (max-width:640px){.lv{padding:18px 16px}.evl span,.nsrc,.cred,.upd2,.nums i{font-size:16px}}
.tmore{position:relative}.tmore summary{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 10px;cursor:pointer;list-style:none;color:var(--fg-2);font-size:var(--t-s);font-weight:500}
.tmore summary::-webkit-details-marker{display:none}.tmore[open] summary,.tmore summary:hover{color:var(--fg)}
.tmore-p{position:absolute;right:0;top:100%;z-index:10;min-width:190px;display:grid;padding:6px;border-radius:12px;background:#0B1228;box-shadow:0 12px 32px rgba(0,0,0,.5),inset 0 0 0 1px rgba(150,175,255,.14)}
.tmore-p a{display:flex;align-items:center;min-height:44px;padding:0 12px;border-radius:8px;color:var(--fg-2);text-decoration:none;font-size:var(--t-s)}
.tmore-p a:hover,.tmore-p a[aria-current]{color:var(--fg);background:rgba(124,152,255,.08)}
.tmore-p .m-watch,.tmore-p .m-astro{display:none}
@media (max-width:640px){.tnav .n-watch,.tnav .n-astro{display:none}.tmore-p .m-watch,.tmore-p .m-astro{display:flex}}
@media (max-width:360px){.tnav a{padding:0 6px}}
/* ds: the Look Up design system (docs/LOOKUP.md section 2), last so it wins. One type scale (13, 16 or 17, 20, 28 and the display size),
   one spacing scale (4 to 96), one accent (the blue, for the action and links), one card (the surface, 16 px radius, no border), one
   width for the header, the page and the footer (1200). Directions: html.d-a (mission control, no photo) and html.d-b (cinematic, the
   night photo behind the launch header), set by design.js before the first paint */
:root{--t-xs:13px;--t-s:16px;--t-m:17px;--t-l:20px;--t-xl:28px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;--s7:48px;--s8:64px;--card:rgba(10,16,36,.78);--rc:16px;--maxw:1240px}
.top,main,footer{max-width:var(--maxw);padding:0 max(24px,env(safe-area-inset-left,0px))}
@media (max-width:640px){.top,main,footer{padding:0 max(16px,env(safe-area-inset-left,0px))}}
html{font-size:var(--t-m)}body{line-height:1.55}
.kick,.sub,.full{font-size:var(--t-s)}.muted,.src,.upd,footer{font-size:var(--t-xs)}dd span{font-size:var(--t-xs)}
dt{font-size:var(--t-xs);font-weight:500;color:var(--fg-3);letter-spacing:0}
dd{font:500 var(--t-s)/1.4 Barlow,system-ui,sans-serif;letter-spacing:0}
h2,.sky h2,.about h2,.astro-b h2,.info h2{font-size:var(--t-xl);margin:var(--s7) 0 var(--s3)}
:focus-visible{outline:2px solid var(--cool);outline-offset:3px;border-radius:6px}
a,button,summary,input{scroll-margin:96px}
/* the launch page: the header across the page, then two columns on a desktop (the story, and an aside with Look up and the facts);
   one column on a phone with Look up straight after the header */
.lp-head{padding:var(--s5) 0 0;position:relative}
.lp-head h1{font-size:clamp(40px,5.6vw,80px);line-height:.95}
.lp-head .cd{font-size:var(--t-l);margin-top:var(--s3)}
.lp-head .acts{margin-top:var(--s5)}
.lp-cols{display:grid;gap:var(--s7);margin-top:var(--s7)}
.lp-side,.lp-main{min-width:0}
@media (min-width:1000px){.lp-cols{grid-template-columns:minmax(0,1fr) 400px;align-items:start}.lp-side{grid-column:2;grid-row:1;position:sticky;top:var(--s5)}.lp-main{grid-column:1;grid-row:1}
  .lp-main>:first-child h2,.lp-main>:first-child{margin-top:0}}
.lp-side{display:grid;gap:var(--s5)}
.lp-side h2{margin:0;font-size:var(--t-l)}
.lp .facts{margin:0;padding:var(--s2) var(--s5);border:0;border-radius:var(--rc);background:var(--card);box-shadow:none;grid-template-columns:minmax(0,1fr)}
.lp .facts div,.lp .facts div:nth-child(-n+4){padding:var(--s3) 0;border:0;border-top:1px solid var(--line);display:grid;grid-template-columns:120px minmax(0,1fr);gap:var(--s3);align-items:baseline}
.lp .facts div:first-child{border-top:0}
.lp .facts dd{margin:0}
/* the trust strip: four quiet lines under the actions */
.trust{list-style:none;margin:var(--s5) 0 0;padding:0;display:flex;flex-wrap:wrap;gap:var(--s2) var(--s6);font-size:var(--t-xs);color:var(--fg-3)}
.trust li{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;min-height:24px}
.trust span{color:var(--fg-3)}.trust b,.trust a,.trust time{color:var(--fg);font-weight:500}.trust i{font-style:normal;color:var(--fg-3)}
.trust a{display:inline-flex;align-items:center;min-height:24px}
.conf::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:6px;background:var(--fg-3);vertical-align:1px}
.c-confirmed::before{background:var(--go)}.c-not::before,.c-estimated::before{background:var(--amber)}
/* cards: Look up, the sonic boom, the change log */
.lu,.boom{padding:var(--s5);border-radius:var(--rc);background:var(--card)}
@media (max-width:640px){.lu,.boom,.lp .facts{padding:var(--s4)}.lp .facts{padding:var(--s2) var(--s4)}.lp .facts div,.lp .facts div:nth-child(-n+4){grid-template-columns:104px minmax(0,1fr)}}
.lu-h{display:flex;align-items:center;justify-content:space-between;gap:var(--s3)}
.est{font-size:var(--t-xs);color:var(--fg-3)}
.lu-zip{margin:var(--s4) 0 0}.lu-zip label{display:block;font-size:var(--t-xs);color:var(--fg-3);margin-bottom:6px}
.lu-in{display:flex;gap:var(--s2)}
.lu-in input{flex:1 1 auto;min-width:0;min-height:48px;padding:0 var(--s4);border:0;border-radius:12px;background:rgba(150,175,255,.08);color:var(--fg);font:500 var(--t-l)/1 Barlow,system-ui,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.06em;box-shadow:inset 0 0 0 1px rgba(150,175,255,.18)}
.lu-in input:focus-visible{outline:2px solid var(--cool);outline-offset:2px}
.lu-in .btn{flex:0 0 auto;min-height:48px}
.lu-out{margin-top:var(--s4)}.lu-out p{margin:0 0 var(--s2);color:var(--fg-2)}
.lu-v{font-size:var(--t-s);color:var(--fg)!important}.lu-v b{font:600 var(--t-xl)/1 'Barlow Condensed','Barlow Condensed Fallback',system-ui,sans-serif;margin-right:4px}
.lu-yes b{color:var(--go)}.lu-maybe b{color:var(--amber)}.lu-no b{color:var(--fg-2)}
.lu-r{color:var(--fg)!important}
.lu-f{list-style:none;margin:var(--s3) 0 0;padding:0;display:grid;gap:0}
.lu-f li{display:grid;grid-template-columns:88px minmax(0,1fr);gap:var(--s3);padding:10px 0;border-top:1px solid var(--line);font-size:var(--t-s)}
.lu-f span{color:var(--fg-3);font-size:var(--t-xs);padding-top:3px}.lu-f b{font-weight:500;color:var(--fg)}
.lu .src{margin:var(--s4) 0 0;color:var(--fg-3)}.lu .zipv{margin:var(--s3) 0 0;font-size:var(--t-xs);color:var(--fg-2)!important}
.boom p{margin:var(--s2) 0 0;color:var(--fg-2)}
.chg ol{list-style:none;margin:0;padding:0;display:grid}
.chg li{display:grid;grid-template-columns:200px minmax(0,1fr);gap:var(--s4);padding:var(--s3) 0;border-top:1px solid var(--line)}
.chg time{color:var(--fg-3);font-size:var(--t-xs);padding-top:2px}
@media (max-width:640px){.chg li{grid-template-columns:minmax(0,1fr);gap:2px}}
/* launch day: the status first, then the provider's timeline */
.lday{margin:var(--s6) 0 0;padding:var(--s5);border-radius:var(--rc);background:var(--card)}
.lday-k{margin:0;font-size:var(--t-xs);color:var(--fg-3)}
.lday-s{margin:4px 0 var(--s3);font:600 clamp(34px,4vw,48px)/1 'Barlow Condensed','Barlow Condensed Fallback',system-ui,sans-serif;display:flex;align-items:center;gap:12px}
.lday-s i{width:12px;height:12px;border-radius:50%;background:var(--fg-3)}.s-go i{background:var(--go)}.s-hold i,.s-tbd i{background:var(--amber)}.s-scrub i{background:var(--live)}
.tl{list-style:none;margin:0;padding:0;display:grid;max-height:420px;overflow:auto}
.tl li{display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:var(--s3);padding:10px 0;border-top:1px solid var(--line);font-size:var(--t-s)}
.tl b{font-weight:600;color:var(--fg)}.tl time{color:var(--fg-3);font-size:var(--t-xs);padding-top:2px}
@media (max-width:640px){.tl li{grid-template-columns:84px minmax(0,1fr)}.tl time{display:none}}
/* direction A, mission control: black, data forward, the countdown large */
.d-a body{background:#000}
.d-a .lp-head .cd{font:600 clamp(28px,3.4vw,44px)/1.1 'Barlow Condensed','Barlow Condensed Fallback',system-ui,sans-serif;font-variant-numeric:tabular-nums;letter-spacing:.01em}
.d-a .lu,.d-a .boom,.d-a .lp .facts,.d-a .lday{background:transparent;box-shadow:inset 0 0 0 1px var(--line)}
/* direction B, cinematic: the night photo under the launch header, the type larger */
.d-b .lp-head::before{content:"";position:absolute;z-index:-1;inset:-120px calc(50% - 50vw) -40px;background:linear-gradient(180deg,rgba(3,5,11,.55),rgba(3,5,11,.86) 55%,var(--bg)),url(/earth/hero-wide.webp) 50% 70%/cover no-repeat;pointer-events:none}
.d-b .lp-head{padding-top:var(--s7)}
@media (max-width:699px){.d-b .lp-head::before{background:linear-gradient(180deg,rgba(3,5,11,.5),rgba(3,5,11,.9) 60%,var(--bg)),url(/earth/hero-phone.webp) 50% 60%/cover no-repeat}}
main{position:relative;z-index:0}
body{overflow-x:clip}
.top{max-width:none;padding:0 max(24px,calc((100% - 1192px)/2))}
@media (max-width:640px){.top{padding:0 16px}}
"""

# design.js: the design direction before the first paint (docs/LOOKUP.md section 2). ?design=a or ?design=b picks it and keeps it in this
# browser (radar.design); otherwise the kept one, else B. The main page's head script does the same
DESIGN_JS = """(function(){var d='b';try{var m=/[?&]design=([ab])(?:&|$)/.exec(location.search);if(m){d=m[1];localStorage.setItem('radar.design',d)}else{var k=localStorage.getItem('radar.design');if(k==='a'||k==='b')d=k}}catch(e){}document.documentElement.classList.add('d-'+d)})();
"""

# the visitor's own time next to the UTC time (the page reads fine without it)
JS = """(function(){var b=document.getElementById('copyLink');if(!b)return;var sh=!!navigator.share&&matchMedia('(pointer:coarse)').matches;b.hidden=false;b.textContent=sh?'Share link':'Copy link';
b.addEventListener('click',function(){var u=location.origin+location.pathname;if(sh){navigator.share({title:document.title,url:u}).catch(function(){});return}
var done=function(){b.textContent='Link copied';setTimeout(function(){b.textContent='Copy link'},2000)};if(navigator.clipboard)navigator.clipboard.writeText(u).then(done,function(){prompt('Copy this link',u)});else prompt('Copy this link',u)})})();
(function(){try{var t=document.querySelectorAll('time[data-local]');for(var i=0;i<t.length;i++){var d=new Date(t[i].getAttribute('datetime'));if(isNaN(d))continue;
var s=d.toLocaleString(undefined,{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'});
var p=document.createElement('span');p.textContent=s+' your time';t[i].parentNode.insertBefore(p,t[i].nextSibling)}}catch(e){}})();
"""

NOT_FOUND = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Page not found · Astro Radar</title>
<link rel="stylesheet" href="/launch.css">
<script src="/launch.js" defer></script>
</head>
<body>
<header class="top"><a class="brand" href="/"><img src="/mark.svg" width="28" height="28" alt="">Astro Radar</a></header>
<main>
<h1>Not here</h1>
<p class="sub" id="nf">That page is not on Astro Radar. A launch page is kept only while the launch is in the feed (the next 30 days and the last 7).</p>
<div class="acts"><a class="btn pri" id="nfGo" href="/">Go to Astro Radar</a></div>
</main>
</body>
</html>
"""
# The countdown (each second within a day, each minute before) and the distance and direction from the home ZIP the radar saved in this browser,
# against the distance this kind of launch is usually seen in its light (data-reach, from sky_reach). Distances follow the page's one rule (mi).
JS += """(function(){var c=document.querySelector('[data-cd]');function two(n){return(n<10?'0':'')+n}
function tick(){var t=Date.parse(c.getAttribute('data-cd')),s=Math.round((t-Date.now())/1000),st=c.getAttribute('data-st'),x;
if(isNaN(t))return;if(s>0){var d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);
x='Liftoff in '+(d?d+(d>1?' days ':' day ')+h+' h':h?h+' h '+two(m)+' min':m+' min '+two(s%60)+' s')+(st==='tbd'?', time to be confirmed':'')}
else{var a=Math.round(-s/60);x=a<1?'Liftoff now':a<90?'Launched '+a+(a>1?' minutes':' minute')+' ago':'Liftoff was '+Math.round(a/60)+' hours ago'}
if(c.textContent!==x)c.textContent=x;setTimeout(tick,s>0&&s<86400?1000-Date.now()%1000:30000)}if(c)tick()})();
(function(){var p=document.getElementById('zipv');if(!p)return;var z;try{z=JSON.parse(localStorage.getItem('radar.zipinfo'))}catch(e){}
if(!z||typeof z.lat!=='number'||typeof z.lon!=='number'||!/^\\d{5}$/.test(z.zip||''))return;
var r=Math.PI/180,a=z.lat*r,b=+p.getAttribute('data-lat')*r,dl=(+p.getAttribute('data-lon')-z.lon)*r,R=+p.getAttribute('data-reach');
var km=2*6371*Math.asin(Math.sqrt(Math.pow(Math.sin((b-a)/2),2)+Math.cos(a)*Math.cos(b)*Math.pow(Math.sin(dl/2),2)));
var br=(Math.atan2(Math.sin(dl)*Math.cos(b),Math.cos(a)*Math.sin(b)-Math.sin(a)*Math.cos(b)*Math.cos(dl))/r+360)%360;
var D=['north','north northeast','northeast','east northeast','east','east southeast','southeast','south southeast','south','south southwest','southwest','west southwest','west','west northwest','northwest','north northwest'];
function mi(k){return Math.round(k*0.621371).toLocaleString('en-US')+' mi ('+Math.round(k).toLocaleString('en-US')+' km)'}
var t='From ZIP '+z.zip+(z.city?' ('+z.city+')':'')+', the pad is '+mi(km)+' to the '+D[Math.round(br/22.5)%16]+'. ';
t+=km<=R?'That is inside the about '+mi(R)+' at which a launch in this light is usually seen, so you may see it in clear weather.':'That is farther than the about '+mi(R)+' at which a launch in this light is usually seen, so it is unlikely to be visible from there; the stream is the way to watch.';
p.textContent=t+' ';var l=document.createElement('a');l.href='/?launch='+encodeURIComponent(location.pathname.split('/')[2]||'')+'#sky';l.textContent='The radar has the modeled estimate for your ZIP.';p.appendChild(l)})();
"""
# A link to a launch page that is gone (the launch left the feed) still opens that launch on the radar if it is there.
JS += """(function(){var m=location.pathname.match(/^\\/launch\\/([A-Za-z0-9_-]{1,80})\\/?$/),g=document.getElementById('nfGo');if(!m||!g)return;
g.href='/?launch='+m[1];g.textContent='Find this launch on Astro Radar';location.replace(g.href)})();
"""


def build_pages(dist, feed, providers, now, helpers, model_js, mark_svg, extra_head=None):
    """Writes the launch pages and the shared files; returns (count, largest page in bytes)."""
    import shutil, urllib.parse
    extra_head = extra_head or {}
    ctx = dict(helpers, providers=providers, now=now, ranges=ranges(model_js), astro="https://astrosocial.io",
               q=lambda s: urllib.parse.quote(str(s), safe=""), csp=extra_head.get("csp", ""), manifest=extra_head.get("manifest", ""))
    gen = feed.get("generated") or ""
    try:
        g = datetime.fromisoformat(gen.replace("Z", "+00:00")).astimezone(timezone.utc)
        ctx["generated"] = g.strftime("%b ") + str(g.day) + f", {g.hour % 12 or 12}:{g.minute:02d} {'AM' if g.hour < 12 else 'PM'} UTC"
    except (ValueError, AttributeError):
        ctx["generated"] = "the last update"
    ctx["gen_iso"] = gen
    # the change log scripts/changelog.py writes next to launches.json (None when this build has none: the pages then leave it out)
    try:
        ctx["changes"] = (json.loads((dist / "changes.json").read_text(encoding="utf-8")).get("launches") or {})
    except (OSError, ValueError, AttributeError):
        ctx["changes"] = None
    try:
        stamp = datetime.fromisoformat(gen.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        stamp = now
    events = []
    base = dist / "launch"
    if base.exists():
        shutil.rmtree(base)  # launches that left the feed lose their page (404.html sends those links to the radar)
    made, biggest, urls = [], 0, []
    global AREAS
    try:
        AREAS = json.loads((pathlib.Path(__file__).resolve().parent / "assets/earth/areas/areas.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        AREAS = []
    import calendar_feeds
    ctx["padcal"] = calendar_feeds.pad_files(calendar_feeds.calendar_launches(feed))
    ok = lambda f: isinstance(f, dict) and ID_OK.fullmatch(str(f.get("id") or "")) and f.get("mis") and f.get("veh") and f.get("utc")
    up = sorted((f for f in feed.get("launches") or [] if ok(f)), key=lambda f: f["utc"])
    ctx["nbr"] = {f["id"]: (up[i - 1] if i else None, up[i + 1] if i + 1 < len(up) else None) for i, f in enumerate(up)}
    nxt0 = next((f for f in up if f.get("st") != "flight"), None)
    for f in feed.get("recent") or []:
        if ok(f) and f["id"] not in ctx["nbr"]:
            ctx["nbr"][f["id"]] = (None, nxt0)
    for kind, items in (("up", feed.get("launches") or []), ("past", feed.get("recent") or [])):
        for f in items:
            try:
                if not (isinstance(f, dict) and ID_OK.fullmatch(str(f.get("id") or "")) and f.get("mis") and f.get("veh")):
                    continue
                when = datetime.fromisoformat(f["utc"].replace("Z", "+00:00"))
            except (KeyError, TypeError, ValueError, AttributeError):
                continue
            if f["id"] in made:
                continue
            d = base / f["id"]
            d.mkdir(parents=True, exist_ok=True)
            g = logo_of(f, providers, ctx.get("others") or [])
            ctx["share_id"] = f["id"] if share_image(f, when, d / "share.jpg", g.get("n"), g.get("logo")) else None
            out = page(f, when, kind, ctx)
            (d / "index.html").write_text(out, encoding="utf-8")
            if kind == "up":
                opts = helpers["watch_opts"](f, providers)
                w = opts[0]["url"] if opts else ((providers.get(f.get("prov")) or {}).get("site") or SITE)
                ev = ics_event(f, when, w, stamp)
                (d / "launch.ics").write_bytes(ics_calendar([ev]).encode("utf-8"))
                if f.get("st") != "flight":
                    events.append(ev)
            biggest = max(biggest, len(out.encode("utf-8")))
            made.append(f["id"])
            urls.append(f"{SITE}launch/{f['id']}/")
    # the calendar subscription: every upcoming launch, two alerts each; a calendar app polls it (webcal://astroradar.io/launches.ics)
    (dist / "launches.ics").write_bytes(ics_calendar(events, "Astro Radar launches").encode("utf-8"))
    # a calendar per pad and per provider (calendar_feeds.py), the same events as launches.ics, so they update on slips the same way
    import calendar_feeds
    urls += [SITE + u for u in calendar_feeds.write(dist, feed, providers, events, now)]
    (dist / "launch.css").write_text(CSS, encoding="utf-8")
    (dist / "launch.js").write_text(JS, encoding="utf-8")
    (dist / "design.js").write_text(DESIGN_JS, encoding="utf-8")
    shutil.copyfile(HERE / "src" / "lookup.js", dist / "lookup.js")
    (dist / "mark.svg").write_text(mark_svg, encoding="utf-8")
    (dist / "404.html").write_text(NOT_FOUND, encoding="utf-8")
    # the Florida page and its QR code (assets/ksc-qr.png, made by scripts/make_qr.py)
    (dist / "ksc").mkdir(exist_ok=True)
    (dist / "ksc" / "index.html").write_text(ksc_page(feed, ctx, ctx["ranges"]), encoding="utf-8")
    if (HERE / "assets" / "ksc-qr.png").exists():
        shutil.copyfile(HERE / "assets" / "ksc-qr.png", dist / "ksc" / "qr.png")
    urls.append(f"{SITE}ksc/")
    # About, Privacy and Data sources (info_pages.py), quiet pages on the same stylesheet
    import info_pages
    ctx.update(top_nav=top_nav, site_footer=site_footer, astro_link=astro_link, page_title=page_title, short_name=short_name, when_lines=when_lines, logo=lambda f: logo_chip(
        logo_of(f, providers, ctx.get("others") or []), ctx["ratios"], "card", brand=False))
    urls += info_pages.write_all(dist, ctx, mi, ctx["ranges"], feed)
    # the provider pages (provider_pages.py): /provider/ and /provider/<key>/ for each provider in providers.json
    import provider_pages
    ctx.update(STATUS=STATUS, RESULT=RESULT)
    urls += provider_pages.write_all(dist, [p for p in providers.values() if isinstance(p, dict)], feed, ctx, info_pages.page)
    # Live from space and Space news (space_pages.py): real NASA, NOAA, CelesTrak and Spaceflight News data with its source and time; their
    # scripts (live.js, news.js) and the model for the ISS pass (model.js, the same ORB as the main page's) sit next to them
    import space_pages
    ctx.update(mi=mi, root=HERE)
    urls += space_pages.write_all(dist, feed, ctx, info_pages.page)
    for f in ("live.js", "news.js", "model.js"):
        shutil.copyfile(HERE / "src" / f, dist / f)
    day = now.strftime("%Y-%m-%d")
    (dist / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                                      + "".join(f"<url><loc>{u}</loc><lastmod>{day}</lastmod></url>\n" for u in [SITE] + urls) + "</urlset>\n", encoding="utf-8")
    (dist / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}sitemap.xml\n", encoding="utf-8")
    return made, biggest


# ---------------------------------------------------------------- the Florida page (astroradar.io/ksc/): the next launches from Cape
# Canaveral and Kennedy, where people watch from, and a short guide. Only facts in docs/KSC_SOURCES.md are shown; hours, fees and access
# rules are never stated, the official page is linked instead. Places: name, what the source says, the OpenStreetMap location (ODbL)
KSC_PLACES = [
    {"n": "Kennedy Space Center Visitor Complex", "lat": 28.5242796, "lon": -80.6818558, "src": "https://kennedyspacecenter.com/launches-and-events/see-a-launch/launch-viewing-locations",
     "srcn": "Kennedy Space Center Visitor Complex",
     "d": "Three ticketed launch viewing areas, offered for some launches: the Main Visitor Complex, beside Space Shuttle Atlantis; the Banana Creek "
          "viewing area at the Apollo/Saturn V Center; and the Gantry at LC 39, the closest, sold in addition to daily admission and not used for "
          "launches from LC 39A or LC 39B.",
     "official": [("Main Visitor Complex", [("SLC 41", 11.4), ("SLC 40", 10.8), ("LC 39A", 12)]),
                  ("Banana Creek", [("SLC 41", 8.7), ("SLC 40", 10), ("LC 39A", 6.27)]),
                  ("The Gantry at LC 39", [("SLC 41", 3.7), ("SLC 40", 5.5)])]},
    {"n": "Playalinda Beach, Canaveral National Seashore", "lat": 28.6773237, "lon": -80.6472179, "src": "https://www.nps.gov/cana/learn/news/launch-closure.htm",
     "srcn": "National Park Service",
     "d": "A National Park Service beach north of the Kennedy pads. The Park Service closes parts of it for some launches at the request of NASA "
          "Launch Security; for one LC 39A launch everything from parking area 13 south to the Playalinda Road Gate closed until the launch or a scrub. "
          "Check the park's notices before you go."},
    {"n": "Space View Park, Titusville", "lat": 28.6143484, "lon": -80.8066059, "src": "https://www.brevardfl.gov/ParksAndRecreation/ParksByCity/ParksInTitusville/SpaceView",
     "srcn": "Brevard County", "d": "A Brevard County park on the Indian River in Titusville, across the water from Kennedy Space Center."},
    {"n": "Jetty Park, Port Canaveral", "lat": 28.4065705, "lon": -80.5940147, "src": "https://www.portcanaveral.com/", "srcn": "Port Canaveral",
     "d": "A Port Canaveral park at the mouth of the port, south of the Cape Canaveral pads."},
]


def km_between(a_lat, a_lon, b_lat, b_lon):
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def florida(feed):
    """the upcoming launches from Florida pads (the feed's state field), in time order"""
    out = []
    for f in feed.get("launches") or []:
        pad = f.get("pad") or {} if isinstance(f, dict) else {}
        if isinstance(f, dict) and pad.get("st") == "FL" and ID_OK.fullmatch(str(f.get("id") or "")) and f.get("mis"):
            out.append(f)
    return out


def ksc_page(feed, ctx, rng):
    e = html.escape
    url = SITE + "ksc/"
    fl = florida(feed)
    nxt = next((f for f in fl if isinstance((f.get("pad") or {}).get("lat"), (int, float))), None)
    rows = []
    for f in fl[:8]:
        try:
            when = datetime.fromisoformat(f["utc"].replace("Z", "+00:00")).astimezone(timezone.utc)
        except (KeyError, ValueError):
            continue
        utc = when.strftime("%a, %b ") + str(when.day) + f" · {when.hour % 12 or 12}:{when.minute:02d} {'AM' if when.hour < 12 else 'PM'} UTC"
        rows.append(f'<li><a href="/launch/{e(f["id"])}/">{e(short_name(f.get("mis"), f.get("veh")))}</a> <span>{e(f.get("veh") or "")} · {e((f.get("pad") or {}).get("n") or "")}</span>'
                    f'<time datetime="{e(f["utc"])}" data-local>{e(utc)}</time></li>')
    launches = ("<ul class=\"fl\">" + "".join(rows) + "</ul>") if rows else "<p>No launches from Florida are listed in the next 30 days right now. <a href=\"/#launches\">All launches</a>.</p>"
    day = int(rng.get("day", 200))
    places = []
    for p in KSC_PLACES:
        bits = [f"<h3>{e(p['n'])}</h3><p>{e(p['d'])}</p>"]
        if p.get("official"):
            bits.append("<p class=\"dist\">Distances given by the Visitor Complex: " + "; ".join(
                e(a) + ": " + ", ".join(f"{e(pad)} {mi(km)}" for pad, km in pads) for a, pads in p["official"]) + ".</p>")
        if nxt:
            pad = nxt["pad"]
            km = km_between(p["lat"], p["lon"], pad["lat"], pad["lon"])
            bits.append(f"<p class=\"dist\">Can I see the next launch from here? It is {mi(km)} from {e(pad.get('n') or 'the pad')}, well inside the "
                        f"{mi(day)} at which a daylight launch is usually seen, so in clear weather the climb is in plain view; trees, buildings "
                        "and the horizon can hide the pad itself.</p>")
        bits.append(f"<p class=\"src\">Source: <a href=\"{e(p['src'])}\" target=\"_blank\" rel=\"noopener\">{e(p['srcn'])}</a>. Check it for hours, fees and launch day closures.</p>")
        places.append("<section class=\"place\">" + "".join(bits) + "</section>")
    title = "Watch a rocket launch from Florida"
    desc = "The next launches from Cape Canaveral and Kennedy Space Center, where people watch from, and a short guide for a first launch."
    meta = "".join(f'<meta {k}="{n}" content="{e(v)}">\n' for k, n, v in (
        ("name", "description", desc), ("property", "og:type", "website"), ("property", "og:site_name", "Astro Radar"), ("property", "og:url", url),
        ("property", "og:title", title + " · Astro Radar"), ("property", "og:description", desc), ("property", "og:image", SITE + "og-image.jpg"),
        ("property", "og:image:width", "1200"), ("property", "og:image:height", "630"), ("name", "twitter:card", "summary_large_image"),
        ("name", "twitter:title", title + " · Astro Radar"), ("name", "twitter:description", desc), ("name", "twitter:image", SITE + "og-image.jpg")))
    return ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
            "<meta name=\"theme-color\" content=\"#04050C\">\n" + ctx["csp"] +
            f"<title>{e(title)} · Astro Radar</title>\n{meta}<link rel=\"canonical\" href=\"{url}\">\n"
            "<link rel=\"icon\" href=\"/favicon-32.png\" type=\"image/png\" sizes=\"32x32\">\n<link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\">\n"
            + ctx["manifest"] + "<link rel=\"stylesheet\" href=\"/launch.css\">\n</head>\n<body>\n"
            + top_nav("ksc") + "<main>\n"
            f"<h1>{e(title)}</h1>\n<p class=\"sub\">Cape Canaveral Space Force Station and Kennedy Space Center, on Florida's Space Coast.</p>\n"
            "<h2>Next launches from Florida</h2>\n" + launches + "\n"
            "<h2>Where people watch</h2>\n" + "".join(places) + "\n"
            "<h2>First launch?</h2>\n<ul class=\"guide\">"
            "<li>Launch times move and launches scrub, often on the day. Check the launch's page here, or the provider's, before you set off.</li>"
            "<li>Public areas near the pads can close for a launch. Check the place's own page on the day.</li>"
            f"<li>The rocket is seen much farther than the pad: a daylight launch out to about {mi(day)}, a night launch's flame out to about "
            f"{mi(int(rng.get('nightFirst', 400)))}. <a href=\"/#sky\">Astro Radar</a> works out where to look from your ZIP code (a modeled estimate).</li>"
            "<li>The Kennedy Space Center Visitor Complex sells launch viewing for some launches; it lists only officially announced dates.</li></ul>\n"
            "<figure class=\"qr\"><img src=\"/ksc/qr.png\" width=\"164\" height=\"164\" alt=\"QR code for astroradar.io/ksc\"><figcaption>Scan to open this page: astroradar.io/ksc</figcaption></figure>\n"
            "</main>\n" + site_footer("ksc", "Astro Radar is independent and is not affiliated with, endorsed by or sponsored by NASA, the Space Force, any launch "
            "provider, Brevard County, Port Canaveral or the Kennedy Space Center Visitor Complex. Places from their official pages; map locations "
            "© OpenStreetMap contributors (ODbL). Sources: <a href=\"https://github.com/SergiusCommodus/astro-radar/blob/main/docs/KSC_SOURCES.md\" target=\"_blank\" rel=\"noopener\">KSC_SOURCES.md</a>.") +
            "<script src=\"/launch.js\" defer></script>\n</body>\n</html>\n")


# ---------------------------------------------------------------- calendar files (RFC 5545), the per launch file and the subscription feed
def ics_text(v):
    return str(v).replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def ics_fold(line):
    """Lines longer than 75 octets continue on the next line after a space (RFC 5545 3.1), never splitting a UTF-8 character."""
    out, cur, n = [], "", 0
    for ch in line:
        b = len(ch.encode("utf-8"))
        if n + b > (75 if not out else 74):
            out.append(cur)
            cur, n = "", 0
        cur += ch
        n += b
    out.append(cur)
    return "\r\n ".join(out)


def ics_stamp(d):
    return d.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


ICS_EPOCH = datetime(2020, 1, 1, tzinfo=timezone.utc)


def ics_revision(f):
    """SEQUENCE and LAST-MODIFIED from the feed's lu (when Launch Library last changed the record): whole minutes since 2020, so a calendar
    that already has the event takes a changed time or status as an update of it (RFC 5545 3.8.7.4). 0 and none without lu.
    Ported as icsRev in app.js: change the two together."""
    try:
        lu = datetime.fromisoformat(str(f.get("lu")).replace("Z", "+00:00"))
    except ValueError:
        return 0, None
    return max(0, int((lu - ICS_EPOCH).total_seconds() // 60)), lu


def ics_event(f, when, watch_url, stamp):
    """One VEVENT in UTC (the Z suffix), so every calendar shows it in its own time zone. Two alerts: a day before and 30 minutes before.
    STATUS is TENTATIVE while the time is to be confirmed or on hold, else CONFIRMED; SEQUENCE and LAST-MODIFIED come from ics_revision."""
    pad = (f.get("pad") or {}).get("full") or "Pad not announced yet"
    page = f"{SITE}launch/{f['id']}/"
    note = ("Time to be confirmed. " if f.get("st") == "tbd" else "") + f"Watch: {watch_url}\nLaunch times often move. Check {page} before you head out."
    lines = ["BEGIN:VEVENT", f"UID:{ics_text(f['id'])}@astroradar.io", f"DTSTAMP:{ics_stamp(stamp)}", f"DTSTART:{ics_stamp(when)}",
             f"DTEND:{ics_stamp(when + timedelta(minutes=30))}", f"SUMMARY:{ics_text(title_of(f.get('mis'), f.get('veh')) if undisclosed(f.get('mis')) else f['veh'] + ' launch · ' + f['mis'])}",
             f"LOCATION:{ics_text(pad)}", f"DESCRIPTION:{ics_text(note)}", f"URL:{page}",
             "STATUS:" + ("TENTATIVE" if f.get("st") in ("tbd", "hold") else "CONFIRMED"), f"SEQUENCE:{ics_revision(f)[0]}"]
    if ics_revision(f)[1]:
        lines.append(f"LAST-MODIFIED:{ics_stamp(ics_revision(f)[1])}")
    lines += [
             "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", f"DESCRIPTION:{ics_text(f['veh'] + ' launch tomorrow')}", "END:VALARM",
             "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", f"DESCRIPTION:{ics_text(f['veh'] + ' launch in 30 minutes')}", "END:VALARM",
             "END:VEVENT"]
    return lines


def ics_calendar(events, name=None):
    head = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Astro Radar//Launches//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]
    if name:
        head += [f"X-WR-CALNAME:{ics_text(name)}", "X-WR-CALDESC:" + ics_text("Upcoming rocket launches from Astro Radar. Times often move; the feed updates every 30 minutes."),
                 "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"]
    return "\r\n".join(ics_fold(x) for x in head + [l for ev in events for l in ev] + ["END:VCALENDAR"]) + "\r\n"
