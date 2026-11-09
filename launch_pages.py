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
UNK = re.compile(r"^(unknown( payload)?|tb[dac]|n/a|none)\??$", re.I)


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
        s = re.sub(r"\s+Block\s+\d+.*$", "", v, flags=re.I) or "Launch"
    if len(s) > 24:
        cut = s[:25]
        sp = cut.rfind(" ")
        s = re.sub(r"[\s,;:.]+$", "", cut[:sp] if sp > 10 else s[:23]) + "…"
    return s


HERE = pathlib.Path(__file__).resolve().parent


def share_image(f, when, path, provider_name, logo):
    """The launch's share card (og:image), 1200 by 630 JPEG: deep space with a few stars and the planet's lit rim along the bottom, the
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
    # the planet: a wide arc whose top is a third of the way up, with a soft blue glow and a bright rim
    cx, cy, R = W / 2, H + 1320, 1530
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([cx - R - 18, cy - R - 18, cx + R + 18, cy + R + 18], outline=170, width=36)
    glow = glow.filter(ImageFilter.GaussianBlur(22))
    im.paste(Image.new("RGB", (W, H), (110, 160, 255)), (0, 0), glow)
    d = ImageDraw.Draw(im)
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(9, 20, 44))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(150, 190, 255), width=3)
    shade = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shade).ellipse([cx - R + 30, cy - R + 30, cx + R - 30, cy + R - 30], fill=255)
    im.paste(Image.new("RGB", (W, H), (5, 11, 26)), (0, 0), shade.filter(ImageFilter.GaussianBlur(30)))
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
    d.text((x0, y + 52), " · ".join(x for x in (f.get("veh"), pad) if x)[:70], font=font("barlow-500.woff2", 30), fill=(167, 176, 206))
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
    pad = f.get("pad") or {}
    lat, lon, az = pad.get("lat"), pad.get("lon"), f.get("az")
    if not all(isinstance(x, (int, float)) for x in (lat, lon)) or not rng:
        return None
    s0 = sun_el(lat, lon, when)
    out = []
    if s0 > 0:
        out.append(f"Liftoff is in daylight at the pad. In daylight a rocket shows only as a white exhaust trail, which people usually see from within about {mi(rng.get('day', 200))}.")
    else:
        rising = sun_el(lat, lon, when + timedelta(minutes=20)) > s0
        when_word = "before sunrise" if rising else "after sunset"
        lit = False
        if isinstance(az, (int, float)) and f.get("v") not in ("NS", "SUB"):
            # about four minutes up a typical orbital rocket is near 150 km high and 400 km downrange
            rl, ro = dest(lat, lon, az, 400)
            lit = 150 > shadow_km(sun_el(rl, ro, when + timedelta(minutes=4))) + 3
        if lit:
            out.append(f"Liftoff is {when_word} at the pad, and the rocket should climb high enough to reach sunlight while the ground below is dark. "
                       f"Sunlit exhaust can glow against the darker sky, the view people have reported from as far as about {mi(rng.get('lit', 950))}.")
        elif s0 > -6:
            out.append(f"Liftoff is in twilight at the pad ({when_word}). The sky is still bright, so the engine flame shows only to people fairly close, within about {mi(rng.get('glowTwilight', 150))}.")
        else:
            out.append(f"Liftoff is in the dark at the pad. You would see the engine flame, which fades quickly with distance: people usually see it from within about {mi(rng.get('nightFirst', 400))}.")
    if isinstance(az, (int, float)):
        out.append(f"It should head {DIRS[round(az / 22.5) % 16]} from the pad. We guess the heading from the target orbit, so the real path can differ.")
    return out


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


def page(f, when, kind, ctx):
    """One launch page. kind is 'up' (upcoming or in flight) or 'past' (flown in the last 7 days)."""
    pid = f["id"]
    url = f"{SITE}launch/{pid}/"
    prov = ctx["providers"].get(f.get("prov")) or {}
    pname = prov.get("n") or "Launch provider"
    title = f"{f['mis']} · {f['veh']}"
    pad = f.get("pad") or {}
    padfull = pad.get("full") or pad.get("n") or "Pad not announced yet"
    utc_txt, local_txt = when_lines(when, f.get("tz"), ctx["when_text"])
    iso = when.strftime("%Y-%m-%dT%H:%M:%SZ")
    if kind == "up":
        status = STATUS.get(f.get("st"), "Scheduled")
        desc = f"{f['veh']} launches {f['mis']} for {pname} from {padfull}, {utc_txt}. Status, the official webcast, and where to look from your ZIP code."
    else:
        status = RESULT.get(f.get("res"), "Flown")
        desc = f"{f['veh']} launched {f['mis']} for {pname} from {padfull}, {utc_txt}. Result: {status}. Replay and launch details."
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
    share = (f"{ctx['astro']}/app/share?launch={ctx['q'](pid)}&title={ctx['q'](title)}&utc={ctx['q'](iso)}&url={ctx['q'](SITE + '?launch=' + pid)}")
    acts.append(f'<a class="btn" href="{e(share)}" target="_blank" rel="noopener">Share to Astro</a>')
    if kind == "up":
        acts.append(f'<a class="btn" href="launch.ics" download="{e(pid)}.ics">Add to calendar</a>')
    facts = [("Liftoff", f'<time datetime="{iso}" data-local>{e(utc_txt)}</time>' + (f'<span>{e(local_txt)} at the pad</span>' if local_txt else "")),
             ("Status" if kind == "up" else "Result", e(status)),
             ("Vehicle", e(f["veh"])), ("Launch site", e(padfull))]
    if f.get("orbit"):
        facts.append(("Orbit", e(f["orbit"])))
    if prov.get("site"):
        facts.append(("Provider", f'<a href="{e(prov["site"])}" target="_blank" rel="noopener">{e(pname)}</a>'))
    elif pname:
        facts.append(("Provider", e(pname)))
    if safe(f.get("info")):
        facts.append(("Mission page", f'<a href="{e(f["info"])}" target="_blank" rel="noopener">Official mission page</a>'))
    sky = ""
    if kind == "up":
        note = sky_note(f, when, ctx["ranges"])
        if note:
            sky = ('<section class="sky"><h2>Can I see it?</h2>' + "".join(f"<p>{e(x)}</p>" for x in note) +
                   f'<p>Whether you can see it depends on where you are, the weather and the exact time. <a href="/?launch={e(pid)}#sky">Open it on Astro Radar with your ZIP code</a> for a modeled estimate of where to look, worked out for every second of the flight. It is an estimate, not a promise.</p></section>')
    # the share card the build drew for this launch (share_image), else the site's own
    img = SITE + f"launch/{pid}/share.jpg" if ctx.get("share_id") == f.get("id") else SITE + "og-image.jpg"
    alt = f"{short_name(f.get('mis'), f.get('veh'))}: {f.get('veh')} launch on Astro Radar"
    ld = ""
    if kind == "up" and f.get("st") != "flight":
        ev = {"@context": "https://schema.org", "@type": "Event", "name": title, "description": desc, "startDate": iso, "url": url,
              "image": img, "eventStatus": "https://schema.org/EventScheduled",
              "eventAttendanceMode": "https://schema.org/MixedEventAttendanceMode" if opts else "https://schema.org/OfflineEventAttendanceMode"}
        place = {"@type": "Place", "name": pad.get("n") or padfull, "address": padfull}
        if isinstance(pad.get("lat"), (int, float)) and isinstance(pad.get("lon"), (int, float)):
            place["geo"] = {"@type": "GeoCoordinates", "latitude": pad["lat"], "longitude": pad["lon"]}
        ev["location"] = [place] + ([{"@type": "VirtualLocation", "url": opts[0]["url"]}] if opts else [])
        org = {"@type": "Organization", "name": pname}
        if prov.get("site"):
            org["url"] = prov["site"]
        ev["organizer"] = org
        ld = '<script type="application/ld+json">' + json.dumps(ev, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + "</script>\n"
    meta = "".join(f'<meta {k}="{n}" content="{e(v)}">\n' for k, n, v in (
        ("name", "description", desc), ("property", "og:type", "website"), ("property", "og:site_name", "Astro Radar"),
        ("property", "og:url", url), ("property", "og:title", title + " · Astro Radar"), ("property", "og:description", desc),
        ("property", "og:image", img), ("property", "og:image:width", "1200"), ("property", "og:image:height", "630"), ("property", "og:image:alt", alt),
        ("name", "twitter:card", "summary_large_image"), ("name", "twitter:title", title + " · Astro Radar"),
        ("name", "twitter:description", desc), ("name", "twitter:image", img), ("name", "twitter:image:alt", alt)))
    gen = ctx["generated"]
    return ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
            "<meta name=\"theme-color\" content=\"#04050C\">\n" + ctx["csp"] +
            f"<title>{e(title)} · Astro Radar</title>\n{meta}<link rel=\"canonical\" href=\"{url}\">\n"
            "<link rel=\"icon\" href=\"/favicon-32.png\" type=\"image/png\" sizes=\"32x32\">\n<link rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\">\n"
            + ctx["manifest"] +
            "<link rel=\"preload\" as=\"font\" type=\"font/woff2\" href=\"/fonts/barlow-condensed-600.woff2\" crossorigin>\n"
            "<link rel=\"stylesheet\" href=\"/launch.css\">\n" + ld + "</head>\n<body>\n"
            "<header class=\"top\"><a class=\"brand\" href=\"/\"><img src=\"/mark.svg\" width=\"28\" height=\"28\" alt=\"\">Astro Radar</a>"
            "<a class=\"all\" href=\"/#launches\">All launches</a></header>\n<main>\n"
            f"<p class=\"pv\">{logo_chip(logo_of(f, ctx['providers'], ctx['others']), ctx['ratios'], 'card', brand=False)}</p>\n"
            f"<p class=\"kick\"><span class=\"dot {'up' if kind == 'up' else 'past'}\"></span>{e(status)} · {e(pname)}</p>\n"
            f"<h1>{e(f['mis'])}</h1>\n<p class=\"sub\">{e(f['veh'])} · {e(padfull)}</p>\n"
            "<dl class=\"facts\">" + "".join(f"<div><dt>{k}</dt><dd>{v}</dd></div>" for k, v in facts) + "</dl>\n"
            "<div class=\"acts\">" + "".join(acts) + "</div>\n"
            + nasa_photo(f, e) +
            f"<p class=\"radar\"><a href=\"/?launch={e(pid)}\">See it on the radar</a>: the countdown, the flight path and where to look from your ZIP code.</p>\n"
            + sky +
            f"<p class=\"upd\">From Launch Library 2, as of {e(gen)}. Times and status can change; <a href=\"/?launch={e(pid)}\">the radar</a> has the latest.</p>\n"
            "</main>\n<footer><p>Astro Radar is independent and is not affiliated with, endorsed by or sponsored by any launch provider or space agency shown here. "
            "Logos and names are trademarks of their owners, shown only to identify the launch provider.</p>"
            "<p><a href=\"/\">Astro Radar</a> · Launch data from <a href=\"https://thespacedevs.com/llapi\" target=\"_blank\" rel=\"noopener\">Launch Library 2</a></p></footer>\n"
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


CSS = """@font-face{font-family:'Barlow';font-weight:400;font-display:swap;src:url(/fonts/barlow-400.woff2) format('woff2')}
@font-face{font-family:'Barlow';font-weight:600;font-display:swap;src:url(/fonts/barlow-600.woff2) format('woff2')}
@font-face{font-family:'Barlow Condensed';font-weight:600;font-display:swap;src:url(/fonts/barlow-condensed-600.woff2) format('woff2')}
:root{--bg:#04050C;--fg:#EEF0FF;--fg-2:#A3ABD1;--fg-3:#8089B5;--line:rgba(185,168,255,.16);--accent:#B9A8FF;--violet:#7C5CFF;--go:#45E0A0}
*{box-sizing:border-box}
html{background:var(--bg);color:var(--fg);font:400 16px/1.55 Barlow,system-ui,sans-serif;-webkit-text-size-adjust:100%}
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
h1{margin:0;font:600 clamp(44px,9vw,92px)/.95 'Barlow Condensed',system-ui,sans-serif;text-transform:uppercase;letter-spacing:.01em;overflow-wrap:anywhere}
.sub{margin:14px 0 0;color:var(--fg-2);letter-spacing:.06em}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0;margin:34px 0 0;border-top:1px solid var(--line)}
.facts div{padding:16px 16px 16px 0;border-bottom:1px solid var(--line)}
dt{font-size:11px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--fg-3)}
dd{margin:6px 0 0;font:600 20px/1.3 'Barlow Condensed',system-ui,sans-serif;letter-spacing:.02em}
dd span{display:block;font:400 14px/1.4 Barlow,system-ui,sans-serif;color:var(--fg-2);letter-spacing:0;margin-top:4px}
.acts{display:flex;flex-wrap:wrap;gap:12px;margin:30px 0 0}
.btn{display:inline-flex;flex-direction:column;justify-content:center;min-height:48px;padding:10px 20px;border:1px solid var(--line);font-size:13px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;text-decoration:none;color:var(--fg)}
.btn small{font-size:11px;font-weight:400;letter-spacing:.04em;text-transform:none;color:var(--fg-2)}
.btn.pri{background:#5E48D8;border-color:#5E48D8}.btn.pri small{color:#E4DEFF}
.btn:hover{border-color:var(--accent)}
.none{color:var(--fg-2);padding:12px 0}
.radar{margin:28px 0 0;color:var(--fg-2)}
.sky{margin:40px 0 0;padding:24px 0 0;border-top:1px solid var(--line)}
.sky h2{margin:0 0 12px;font:600 26px/1.2 'Barlow Condensed',system-ui,sans-serif;text-transform:uppercase;letter-spacing:.04em}
.sky p{margin:0 0 12px;color:var(--fg-2);max-width:68ch}
.upd{margin:28px 0 0;font-size:13px;color:var(--fg-3)}
footer{margin-top:56px;padding-bottom:40px;border-top:1px solid var(--line);font-size:13px;color:var(--fg-3)}
footer p{margin:16px 0 0}
@media (max-width:480px){.btn{flex:1 1 100%}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
"""

# the visitor's own time next to the UTC time (the page reads fine without it)
JS = """(function(){try{var t=document.querySelectorAll('time[data-local]');for(var i=0;i<t.length;i++){var d=new Date(t[i].getAttribute('datetime'));if(isNaN(d))continue;
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
    try:
        stamp = datetime.fromisoformat(gen.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        stamp = now
    events = []
    base = dist / "launch"
    if base.exists():
        shutil.rmtree(base)  # launches that left the feed lose their page (404.html sends those links to the radar)
    made, biggest, urls = [], 0, []
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
    (dist / "launch.css").write_text(CSS, encoding="utf-8")
    (dist / "launch.js").write_text(JS, encoding="utf-8")
    (dist / "mark.svg").write_text(mark_svg, encoding="utf-8")
    (dist / "404.html").write_text(NOT_FOUND, encoding="utf-8")
    # the Florida page and its QR code (assets/ksc-qr.png, made by scripts/make_qr.py)
    (dist / "ksc").mkdir(exist_ok=True)
    (dist / "ksc" / "index.html").write_text(ksc_page(feed, ctx, ctx["ranges"]), encoding="utf-8")
    if (HERE / "assets" / "ksc-qr.png").exists():
        shutil.copyfile(HERE / "assets" / "ksc-qr.png", dist / "ksc" / "qr.png")
    urls.append(f"{SITE}ksc/")
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
            "<header class=\"top\"><a class=\"brand\" href=\"/\"><img src=\"/mark.svg\" width=\"28\" height=\"28\" alt=\"\">Astro Radar</a>"
            "<a class=\"all\" href=\"/#launches\">All launches</a></header>\n<main>\n"
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
            "</main>\n<footer><p>Astro Radar is independent and is not affiliated with, endorsed by or sponsored by NASA, the Space Force, any launch "
            "provider, Brevard County, Port Canaveral or the Kennedy Space Center Visitor Complex. Places from their official pages; map locations "
            "© OpenStreetMap contributors (ODbL). Sources: <a href=\"https://github.com/SergiusCommodus/astro-radar/blob/main/docs/KSC_SOURCES.md\" target=\"_blank\" rel=\"noopener\">KSC_SOURCES.md</a>.</p>"
            "<p><a href=\"/\">Astro Radar</a> · Launch data from <a href=\"https://thespacedevs.com/llapi\" target=\"_blank\" rel=\"noopener\">Launch Library 2</a></p></footer>\n"
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


def ics_event(f, when, watch_url, stamp):
    """One VEVENT in UTC (the Z suffix), so every calendar shows it in its own time zone. Two alerts: a day before and 30 minutes before."""
    pad = (f.get("pad") or {}).get("full") or "Pad not announced yet"
    page = f"{SITE}launch/{f['id']}/"
    note = ("Time to be confirmed. " if f.get("st") == "tbd" else "") + f"Watch: {watch_url}\nLaunch times often move. Check {page} before you head out."
    lines = ["BEGIN:VEVENT", f"UID:{ics_text(f['id'])}@astroradar.io", f"DTSTAMP:{ics_stamp(stamp)}", f"DTSTART:{ics_stamp(when)}",
             f"DTEND:{ics_stamp(when + timedelta(minutes=30))}", f"SUMMARY:{ics_text(f['veh'] + ' launch · ' + f['mis'])}",
             f"LOCATION:{ics_text(pad)}", f"DESCRIPTION:{ics_text(note)}", f"URL:{page}",
             "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", f"DESCRIPTION:{ics_text(f['veh'] + ' launch tomorrow')}", "END:VALARM",
             "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", f"DESCRIPTION:{ics_text(f['veh'] + ' launch in 30 minutes')}", "END:VALARM",
             "END:VEVENT"]
    return lines


def ics_calendar(events, name=None):
    head = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Astro Radar//Launches//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"]
    if name:
        head += [f"X-WR-CALNAME:{ics_text(name)}", "X-WR-CALDESC:Upcoming rocket launches from Astro Radar. Times often move; the feed updates every 30 minutes.",
                 "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"]
    return "\r\n".join(ics_fold(x) for x in head + [l for ev in events for l in ev] + ["END:VCALENDAR"]) + "\r\n"
