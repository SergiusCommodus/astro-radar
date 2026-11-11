"""The Astro page (/astro/) and every Share to Astro link the build writes: python3 -m unittest tests.test_astro_page   (after python3 build.py with a feed)
astro-app's /app/share (src/lib/share.ts there) needs a title (it cuts it to 100 characters), takes a launch id of up to 64 letters, digits,
_ or -, a full ISO time with a zone, and keeps url only when it starts with https://astroradar.io/. A link that breaks any of these reaches
Astro with the launch missing, so every link is checked here, and the copy is held to what Astro's own site says (no counts, no invented users)."""
import json, pathlib, re, unittest
from datetime import datetime, timezone
from urllib.parse import urlsplit, parse_qs

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
PAGE = DIST / "astro" / "index.html"
SHARE = re.compile(r'href="(https://astrosocial\.io/app/share\?[^"]+)"')


def links(text):
    return [h.replace("&amp;", "&") for h in SHARE.findall(text)]


def feed():
    p = DIST / "launches.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


@unittest.skipUnless(PAGE.exists(), "build first: python3 build.py")
class AstroPage(unittest.TestCase):
    def setUp(self):
        self.html = PAGE.read_text(encoding="utf-8")

    def test_page_basics(self):
        self.assertIn('<link rel="canonical" href="https://astroradar.io/astro/">', self.html)
        self.assertIn("<title>Watch launches with friends on Astro · Astro Radar</title>", self.html)
        self.assertIn("https://astroradar.io/astro/", (DIST / "sitemap.xml").read_text(encoding="utf-8"))
        self.assertNotIn("<script>", self.html, "the launch pages' policy allows no inline script")
        self.assertIn("18 and older", self.html)

    def test_list_is_the_next_upcoming_launches(self):
        now = datetime.now(timezone.utc)
        up = [f for f in feed().get("launches") or [] if f.get("st") != "flight"
              and datetime.fromisoformat(f["utc"].replace("Z", "+00:00")) > now]
        got = re.findall(r'<li><span class="t"><a href="/launch/([^/]+)/">', self.html)
        if not up:
            self.assertEqual(got, [])
            self.assertIn("The list fills in when the site has live launch data", self.html)
            return
        # the build ran a little before now, so a launch may have left the window since; the rest are in order
        ids = [f["id"] for f in up]
        self.assertTrue(got and len(got) <= 8)
        self.assertEqual(got, [i for i in ids if i in got][:len(got)])
        for i in got:
            self.assertTrue((DIST / "launch" / i / "index.html").exists(), i)

    def test_no_invented_social_proof(self):
        text = re.sub(r"<[^>]+>", " ", self.html)
        for bad in (r"\b\d+ (friends|people|users|members) (are )?(watching|going|in)\b", r"\bjoin \d", r"\bwatch party\b"):
            self.assertIsNone(re.search(bad, text, re.I), bad)
        self.assertNotIn("Unknown Payload", text)


@unittest.skipUnless(PAGE.exists(), "build first: python3 build.py")
class ShareLinks(unittest.TestCase):
    def all_pages(self):
        yield PAGE
        yield from sorted((DIST / "launch").glob("*/index.html"))

    def test_every_link_is_one_astro_reads_in_full(self):
        n = 0
        for p in self.all_pages():
            for h in links(p.read_text(encoding="utf-8")):
                n += 1
                q = {k: v[0] for k, v in parse_qs(urlsplit(h).query).items()}
                self.assertRegex(q.get("launch", ""), r"^[A-Za-z0-9_-]{1,64}$", (p, h))
                self.assertTrue(0 < len(q.get("title", "")) <= 100, (p, h))
                self.assertNotRegex(q["title"], r"Unknown Payload", (p, h))
                t = datetime.fromisoformat(q.get("utc", "").replace("Z", "+00:00"))
                self.assertIsNotNone(t.tzinfo)
                self.assertTrue(q.get("url", "").startswith("https://astroradar.io/"), (p, h))
                self.assertEqual(q["url"], "https://astroradar.io/?launch=" + q["launch"])
        if (DIST / "launch").exists() and any((DIST / "launch").iterdir()):
            self.assertGreater(n, 0)

    def test_plan_block_only_before_liftoff(self):
        f = feed()
        flown = {x["id"] for x in f.get("recent") or []} | {x["id"] for x in f.get("launches") or [] if x.get("st") == "flight"}
        for i in flown:
            p = DIST / "launch" / i / "index.html"
            if p.exists():
                self.assertNotIn("Watch it with friends", p.read_text(encoding="utf-8"), i)

    def test_app_and_build_make_the_same_link(self):
        # astroShare in app.js and astro_link in launch_pages.py: the same four parameters in the same order
        app = (ROOT / "src/app.js").read_text(encoding="utf-8")
        py = (ROOT / "launch_pages.py").read_text(encoding="utf-8")
        self.assertRegex(app, r"/app/share\?launch='.*&title='.*&utc='.*&url='")
        self.assertRegex(py, r"/app/share\?launch=.*&title=.*&utc=.*\n?.*&url=")


if __name__ == "__main__":
    unittest.main()
