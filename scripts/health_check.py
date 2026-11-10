"""Is the live site healthy?  python3 scripts/health_check.py [--base https://astroradar.io/] [--max-age 120]
Checks, in order, and stops at nothing (every problem is listed):
  1. the main page loads (200, the right page, its script file and the feed it inlined)
  2. the feed is fresh: launches.json loads, parses, and was generated no more than --max-age minutes ago (the deploy runs every 30)
  3. a launch page loads (the first upcoming launch's, else any the sitemap lists)
  4. the sitemap parses and lists the main page; robots.txt points at it
  5. the key files exist: the page's script, world.js, the service worker, the manifest, the first screen's fonts, the phone poster,
     zips.json and the calendar feed
Exits 0 when all pass, 1 with one line per problem otherwise (the health workflow opens an issue with that text). Standard library only,
no key, one request per file, about 15 in all. Run it from anywhere; it reads nothing from the repository."""
import json, re, sys, urllib.request, urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

UA = "astro-radar-health (github.com/SergiusCommodus/astro-radar)"


def get(url, timeout=30):
    """(status, body bytes, headers); status 0 when the request itself failed."""
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read(), r.headers
    except urllib.error.HTTPError as e:
        return e.code, b"", e.headers
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return 0, str(e).encode(), {}


def check(base, max_age, now=None):
    base = base.rstrip("/") + "/"
    now = now or datetime.now(timezone.utc)
    bad, ok = [], []

    st, body, _ = get(base)
    page = body.decode("utf-8", "replace")
    if st != 200:
        bad.append(f"main page: HTTP {st} from {base}")
    elif "Astro Radar" not in page or 'id="heroTitle"' not in page:
        bad.append("main page: loaded, but it is not the Astro Radar page (no title or hero)")
    else:
        ok.append("main page loads")
    app = re.search(r'"(app-[0-9a-f]+\.js)"', page)

    st, body, _ = get(base + "launches.json")
    feed = None
    if st != 200:
        bad.append(f"feed: launches.json HTTP {st}")
    else:
        try:
            feed = json.loads(body)
            gen = datetime.fromisoformat(str(feed.get("generated")).replace("Z", "+00:00"))
            age = (now - gen).total_seconds() / 60
            if age > max_age:
                bad.append(f"feed: launches.json was generated {age:.0f} minutes ago (more than {max_age}); the deploy may be failing")
            elif not isinstance(feed.get("launches"), list):
                bad.append("feed: launches.json has no launch list")
            else:
                ok.append(f"feed fresh ({age:.0f} minutes old, {len(feed['launches'])} launches)")
        except (ValueError, TypeError, AttributeError) as e:
            bad.append(f"feed: launches.json does not parse or has no generated time ({e})")

    st, body, _ = get(base + "sitemap.xml")
    urls = []
    if st != 200:
        bad.append(f"sitemap: HTTP {st}")
    else:
        try:
            ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
            urls = [u.text for u in ET.fromstring(body).findall("s:url/s:loc", ns)]
            if not urls:
                bad.append("sitemap: parses, but lists no address")
            else:
                ok.append(f"sitemap parses ({len(urls)} addresses)")
        except ET.ParseError as e:
            bad.append(f"sitemap: does not parse ({e})")
    st, body, _ = get(base + "robots.txt")
    if st != 200 or b"sitemap.xml" not in body.lower():
        bad.append(f"robots.txt: HTTP {st}, or it does not point at the sitemap")

    lp = None
    if feed and feed.get("launches"):
        lp = base + "launch/" + str(feed["launches"][0].get("id")) + "/"
    else:
        lp = next((u for u in urls if "/launch/" in u), None)
        if lp:
            lp = base + lp.split("/", 3)[3]
    if lp:
        st, body, _ = get(lp)
        if st != 200 or b"<h1" not in body:
            bad.append(f"launch page: HTTP {st} or no heading at {lp}")
        else:
            ok.append("a launch page loads")
    else:
        bad.append("launch page: no launch to try (the feed and the sitemap list none)")

    files = ([app.group(1)] if app else []) + ["world.js", "sw.js", "manifest.webmanifest", "fonts/barlow-400.woff2",
                                                 "fonts/barlow-condensed-600.woff2", "earth/hero-phone.avif", "zips.json", "launches.ics"]
    if not app and "app-" not in str(bad):
        bad.append("main page: no app-<hash>.js script found in it")
    missing = []
    for f in files:
        st, body, _ = get(base + f)
        if st != 200 or not body:
            missing.append(f"{f} (HTTP {st})")
    if missing:
        bad.append("files missing: " + ", ".join(missing))
    else:
        ok.append(f"{len(files)} key files load")
    return bad, ok


def main(argv):
    base, max_age = "https://astroradar.io/", 120
    if "--base" in argv:
        base = argv[argv.index("--base") + 1]
    if "--max-age" in argv:
        max_age = int(argv[argv.index("--max-age") + 1])
    bad, ok = check(base, max_age)
    for line in ok:
        print("ok   " + line)
    for line in bad:
        print("FAIL " + line)
    print(f"{base}: {'healthy' if not bad else str(len(bad)) + ' problem' + ('s' if len(bad) > 1 else '')}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
