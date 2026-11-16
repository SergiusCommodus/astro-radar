"""Live from space and Space news (space_pages.py, src/live.js, src/news.js): python3 -m unittest tests.test_space_pages
After a build. Checks that everything on the two pages is real data with its source and time (no placeholder, no made up count), that
a source that failed shows its last good data with "Last updated", that the pages' policy lets the browser reach only the open sources
they name, that the news is headlines only, that the By the numbers strip counts the feed, that the NASA key is nowhere in the built
site or the data, and that news.js cuts and groups the headlines exactly as the build does (the two are ports of each other)."""
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import unittest
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))


def text(p):
    return (DIST / p / "index.html").read_text(encoding="utf-8")


@unittest.skipUnless((DIST / "live" / "index.html").exists(), "build first")
class Pages(unittest.TestCase):
    def test_policy_and_scripts(self):
        for slug, js in (("live", "/live.js"), ("news", "/news.js")):
            t = text(slug)
            csp = re.search(r'Content-Security-Policy" content="([^"]+)"', t).group(1)
            self.assertIn("script-src 'self';", csp)
            self.assertRegex(csp, r"connect-src 'self' https://services\.swpc\.noaa\.gov https://eonet\.gsfc\.nasa\.gov https://api\.spaceflightnewsapi\.net https://epic\.gsfc\.nasa\.gov https://celestrak\.org;")
            self.assertIn("img-src 'self' https://epic.gsfc.nasa.gov;", csp)
            self.assertIn(f'<script src="{js}" defer></script>', t)
            body = t.split("<body>")[1]
            self.assertNotRegex(body, r"<script(?! src=)", "no inline script")
            self.assertNotIn("style=", body, "no inline style")
            self.assertIn(SITE_URL + slug + "/", (DIST / "sitemap.xml").read_text(encoding="utf-8"))
            self.assertTrue((DIST / js.strip("/")).exists())
        self.assertTrue((DIST / "model.js").exists() and (DIST / "vendor/satellite.min.js").exists())

    def test_every_card_is_real_and_dated(self):
        d = json.loads((ROOT / "data/nasa.json").read_text(encoding="utf-8"))
        t = text("live")
        cards = re.findall(r'<section class="(?:lvc [^"]+|lv-hero)" aria-labelledby="[^"]+">.*?<h2 id="[^"]+">(.*?)</h2>(.*?)</section>', t, re.S)
        self.assertGreaterEqual(len(cards), 4, "the Live page shows the Earth hero and at least three cards from the committed data")
        for title, inner in cards:
            # each card: one big number or line, one short line, and its source and time at the foot
            self.assertRegex(inner, r'<p class="lvc-big">', title)
            self.assertRegex(inner, r'<p class="lvc-line">', title)
            self.assertRegex(inner, r'<div class="lvc-f"><span class="cred">[^<]+ · <a href="https://[^"]+" target="_blank" rel="noopener">Source</a></span>', title)
            self.assertRegex(inner, r'<span class="upd2[^"]*"[^>]*>(Updated|Last updated|Elements from) <time datetime="\d{4}-\d\d-\d\dT', title)
        if d.get("neo"):
            self.assertIn(f'{d["neo"]["count"]} asteroids', t)
            self.assertIn(d["neo"]["closest"]["name"], t)
        if d.get("sun"):
            self.assertIn(d["sun"]["summary"].split(",")[0], t)
        for ev in (d.get("events") or {}).get("list") or []:
            self.assertIn(ev["link"], t)
        self.assertNotRegex(t, r"(?i)lorem|placeholder|sample|todo|xx+")

    def test_news_is_headlines_only(self):
        n = json.loads((ROOT / "data/news.json").read_text(encoding="utf-8"))
        t = text("news")
        items = re.findall(r'<li data-id="[^"]*"><a href="(https://[^"]+)" target="_blank" rel="noopener">([^<]+)</a><span class="nsrc">([^<]+) · <time', t)
        self.assertGreater(len(items), 10)
        urls = {a["url"] for a in n["list"]}
        for url, title, site in items:
            self.assertIn(url.replace("&amp;", "&"), urls)
        for p in re.findall(r'</span><p>([^<]*)</p></li>', t):
            self.assertLessEqual(len(p), 160, "one line, never the article")
        self.assertEqual(re.findall(r'<section class="ns" data-g="(\w+)">', t), [g for g in ("launches", "missions", "science") if any(a["g"] == g for a in n["list"])])
        self.assertIn("never copies an article", t)

    def test_numbers_come_from_the_feed(self):
        feed_p = DIST / "launches.json"
        t = text("data")
        if not feed_p.exists():
            self.assertNotIn('class="nums"', t)
            return
        feed = json.loads(feed_p.read_text(encoding="utf-8"))
        n = len(feed.get("launches") or []) + len(feed.get("recent") or [])
        self.assertIn(f"<b>{n:,}</b><span>Launches tracked</span>", t)
        provs = {f.get("prov") for f in (feed.get("launches") or []) + (feed.get("recent") or []) if f.get("prov")}
        self.assertIn(f"<b>{len(provs):,}</b><span>Launch providers</span>", t)

    def test_the_key_is_nowhere(self):
        key = os.environ.get("NASA_API_KEY")
        for base in (DIST, ROOT / "data"):
            for p in base.rglob("*"):
                if p.is_file() and p.suffix in (".html", ".js", ".json", ".txt", ".xml", ".ics", ".css", ".webmanifest"):
                    s = p.read_text(encoding="utf-8", errors="replace")
                    self.assertNotRegex(s, r"api_key=(?!\[key\])[A-Za-z0-9]{8,}", p)
                    if key and key != "DEMO_KEY":
                        self.assertNotIn(key, s, p)


SITE_URL = "https://astroradar.io/"


class Fallback(unittest.TestCase):
    def test_a_stale_source_says_when_it_is_from(self):
        import space_pages
        v = {"summary": "A quiet Sun: no X ray flares recorded in the last 3 days.", "aurora": "x", "kp": 1, "kpNow": 1, "scales": {"R": "0", "S": "0", "G": "0"},
             "src": "https://www.swpc.noaa.gov/", "credit": "NOAA Space Weather Prediction Center", "at": "2026-11-09T12:00:00Z", "stale": True}
        h = space_pages.sun_card({"sun": v})
        self.assertIn("Last updated <time datetime=\"2026-11-09T12:00:00Z\"", h)
        self.assertEqual(space_pages.sun_card({}), "", "no data, no card")
        self.assertEqual(space_pages.events_card({"events": {"list": []}}), "")
        self.assertEqual(space_pages.neo_card({"neo": {"count": 0}}, str), "")
        self.assertEqual(space_pages.iss_card({"iss": {}}), "")


@unittest.skipUnless(shutil.which("node"), "needs node")
class NewsParity(unittest.TestCase):
    def test_news_js_matches_the_build(self):
        import fetch_nasa
        import news_words
        raw = json.loads((ROOT / "tests/nasa/news.json").read_text(encoding="utf-8"))

        class Src:
            def json(self, name, url):
                return raw
        py = fetch_nasa.news(Src(), datetime(2026, 11, 11, tzinfo=timezone.utc))["list"]
        for a in py:
            a.pop("ll", None)
        js = subprocess.run(["node", "-e", (
            "const N=require(process.argv[1]),fs=require('fs');const raw=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));"
            "process.stdout.write(JSON.stringify(N.list(raw,new RegExp(process.argv[3],'i'),new RegExp(process.argv[4],'i'))))"),
            str(ROOT / "src/news.js"), str(ROOT / "tests/nasa/news.json"), news_words.LAUNCH, news_words.MISSION],
            capture_output=True, text=True, encoding="utf-8", check=True).stdout
        js = json.loads(js)
        self.assertEqual(len(js), len(py))
        for a, b in zip(py, js):
            self.assertEqual(a, b)


class LiveCards(unittest.TestCase):
    """the Live dashboard's cards, from space_pages alone (no build needed)"""

    def setUp(self):
        import space_pages
        self.sp = space_pages

    def test_aurora_words_follow_noaa_g_scale(self):
        a = self.sp.aurora_of
        self.assertIn("near the Arctic", a(0.3))
        self.assertIn("near the Arctic", a(4.9))
        self.assertIn("northern Michigan and Maine", a(5))      # G1
        self.assertIn("New York and Idaho", a(6.3))              # G2
        self.assertIn("Illinois and Oregon", a(7))               # G3
        self.assertIn("Alabama and northern California", a(8))   # G4
        self.assertIn("Florida and south Texas", a(9))           # G5
        self.assertEqual([self.sp.chance_of(k) for k in (2, 5, 6.9, 7, 9)], ["low", "fair", "fair", "high", "high"])

    def test_kp_dial_needle(self):
        for kp, deg in ((0, -90), (4.5, 0), (9, 90)):
            self.assertIn(f'rotate({deg:.1f} 100 100)', self.sp.kp_gauge(kp))
        self.assertNotIn("style=", self.sp.kp_gauge(3), "no inline style: the page's policy blocks it")

    def test_asteroid_chart(self):
        lst = [{"name": "A", "ld": 3.5, "utc": "2026-11-17T05:36Z", "km": 1347343}, {"name": "B", "ld": 0.8, "utc": "2026-11-16T00:00Z", "km": 307500},
               {"name": "C", "ld": 12, "utc": "2026-11-18T00:00Z", "km": 4612800}]
        h = self.sp.neo_chart(lst)
        self.assertEqual(h.count("<circle"), 2 + 3, "Earth, the Moon and one dot each")
        self.assertEqual(h.count('class="nd-1"'), 1, "only the closest is marked")
        self.assertIn("<title>B: 0.8 Moon distances</title>", h.split('class="nd-1"')[1][:60])
        self.assertIn("Moon distances", h)
        self.assertEqual(self.sp.neo_chart([]), "")

    def test_grid_has_no_holes(self):
        ctx = {"mi": lambda km: f"{km} km"}
        cap = {}
        def page(slug, title, desc, body, ctx, **kw):
            cap["body"] = body
            return body
        d = json.loads((ROOT / "data/nasa.json").read_text(encoding="utf-8"))
        feed = {"iss": {"tle": ["1 25544U", "2 25544"], "epoch": "2026-11-15T08:02:34Z"}}
        self.sp.live_page(d, feed, ctx, page)
        self.assertIn('<div class="lvgrid lvg4">', cap["body"], "four cards: the spanning layout that fills every row")
        self.sp.live_page(dict(d, neo={}), feed, ctx, page)
        self.assertIn('<div class="lvgrid">', cap["body"], "three cards: equal columns, so no row has a hole")
        self.assertNotIn("lvg4", cap["body"])

    def test_old_data_says_last_updated(self):
        h = self.sp.foot({"credit": "X", "src": "https://x.example/", "at": "2026-11-01T00:00:00Z", "stale": True}, "X", "k")
        self.assertIn('class="upd2 stale"', h)
        self.assertIn("Last updated <time", h)


if __name__ == "__main__":
    unittest.main()
