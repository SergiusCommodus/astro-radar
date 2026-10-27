"""Builds dist/index.html from src/, data/ and assets/: one page plus the hero photo files next to it (dist/artifact.html inlines the photo)."""
import base64, json, pathlib, re, shutil, urllib.parse


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
# The deploy fetches the feed into dist/launches.json before building, and the page inlines it so it opens on live launches.
# Without that file (a plain local build) the page loads launches.json after it opens, or shows its sample data.
feed = "null"
try:
    feed = json.dumps(json.loads((root / "dist/launches.json").read_text(encoding="utf-8")), separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")
except (OSError, ValueError):
    pass
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
      .replace("__APP__", (root / "src/app.js").read_text(encoding="utf-8").replace("/*__GLOBE__*/", (root / "src/globe.js").read_text(encoding="utf-8")))
      .replace("__ZIP0__", json.dumps(zip_entry(zips_raw, "33130"), separators=(",", ":")))
      .replace("__FEED__", feed))  # last, so text inside the feed is never taken for a marker
# The page body has no document wrapper (it is also published as a hosted artifact), so add one for standalone hosting.
fav = "data:image/svg+xml," + urllib.parse.quote(mark)
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
PREFIX = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="theme-color" content="#04050C">\n'
          '<title>' + TITLE + '</title>\n' + META + '<link rel="canonical" href="' + SITE + '">\n'
          '<link rel="icon" href="' + fav + '" type="image/svg+xml">\n<link rel="icon" href="favicon-32.png" type="image/png" sizes="32x32">\n'
          '<link rel="apple-touch-icon" href="apple-touch-icon.png">\n'
          '<link rel="preload" as="image" href="' + web["webp"] + '" type="image/webp" fetchpriority="high">\n</head>\n<body>\n')
(root / "dist").mkdir(exist_ok=True)
for f in (web["webp"], web["jpeg"], "og-image.jpg", "apple-touch-icon.png", "favicon-32.png"):
    shutil.copyfile(root / "assets" / f, root / "dist" / f)
# The ZIP table is its own file (about 860 KB packed); the page fetches it after it has painted. The artifact keeps it inline.
(root / "dist/zips.json").write_text(zips_packed, encoding="utf-8")
(root / "dist/fonts").mkdir(exist_ok=True)
for _, _, f in FONTS:
    shutil.copyfile(root / "assets/fonts" / (f + ".woff2"), root / "dist/fonts" / (f + ".woff2"))
out = root / "dist/index.html"
# the page's own <title> moves into the head above; the artifact keeps it where it is
out.write_text(PREFIX + re.sub(r"<title>.*?</title>\n?", "", t, count=1).replace("__EARTH__", web["jpeg"]).replace("__EARTHWEBP__", web["webp"]).replace("__ZIPTAG__", "").replace("__FONTLINKS__", FONT_LINKS).replace("__FONTFACE__", FONT_FACE) + "\n</body>\n</html>\n", encoding="utf-8")
# the artifact has no files beside it, so it carries the JPEG inline
(root / "dist/artifact.html").write_text(t.replace("__EARTH__", data_uri(root / "assets" / web["jpeg"])).replace("__EARTHWEBP__", "")
                                         .replace("__ZIPTAG__", '<script type="application/json" id="zipdata">' + zips_packed + "</script>")
                                         .replace("__FONTLINKS__", ART_FONTS).replace("__FONTFACE__", ""), encoding="utf-8")
print(f"built {out} ({out.stat().st_size:,} bytes)")
