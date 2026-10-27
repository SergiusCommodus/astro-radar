"""Builds dist/index.html, a single self contained page, from src/, data/ and assets/."""
import base64, json, pathlib, re, urllib.parse


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


root = pathlib.Path(__file__).parent
t = (root / "src/template.html").read_text(encoding="utf-8")
# The official mark is the single source for both the nav icon and the favicon. The C2PA provenance <metadata> block is dead weight on the page, so drop it.
mark = re.sub(r"<metadata>.*?</metadata>", "", (root / "assets/astro-mark.svg").read_text(encoding="utf-8"), flags=re.S)
inner = re.search(r"<svg[^>]*>(.*)</svg>", mark, re.S).group(1)
for k in ("lg", "lo", "lm"):  # prefix ids so the inline symbol cannot collide with other defs on the page
    inner = inner.replace(f'id="{k}"', f'id="am-{k}"').replace(f"url(#{k})", f"url(#am-{k})")
symbol = '<symbol id="i-astro" viewBox="0 0 64 64">' + inner + "</symbol>"
# the hero photo and its calibration (horizon, air glow, lat/lon fit) come from assets/earth.json, so a photo swap is a file swap
photo = json.loads((root / "assets/earth.json").read_text(encoding="utf-8"))
img = root / "assets" / photo["image"]
mime = {".png": "image/png", ".webp": "image/webp"}.get(img.suffix.lower(), "image/jpeg")
earth = "data:" + mime + ";base64," + base64.b64encode(img.read_bytes()).decode()
t = (t.replace("__MARK__", symbol)
      .replace("__EARTH__", earth)
      .replace("__PHOTO__", json.dumps(photo, separators=(",", ":")))
      .replace("__PROVIDERS__", json.dumps(json.loads((root / "data/providers.json").read_text(encoding="utf-8"))["providers"],
                                           separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/"))
      .replace("__ZIPDATA__", pack_zips((root / "data/zipdata.json").read_text(encoding="utf-8")))
      .replace("__MODEL__", (root / "src/model.js").read_text(encoding="utf-8"))
      .replace("__APP__", (root / "src/app.js").read_text(encoding="utf-8").replace("/*__GLOBE__*/", (root / "src/globe.js").read_text(encoding="utf-8"))))
# The page body has no document wrapper (it is also published as a hosted artifact), so add one for standalone hosting.
fav = "data:image/svg+xml," + urllib.parse.quote(mark)
PREFIX = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<meta name="theme-color" content="#04050C">\n<link rel="icon" href="' + fav + '">\n</head>\n<body>\n'
(root / "dist").mkdir(exist_ok=True)
out = root / "dist/index.html"
out.write_text(PREFIX + t + "\n</body>\n</html>\n", encoding="utf-8")
(root / "dist/artifact.html").write_text(t, encoding="utf-8")
print(f"built {out} ({out.stat().st_size:,} bytes)")
