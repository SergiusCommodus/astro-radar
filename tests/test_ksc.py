"""The Florida page (astroradar.io/ksc/): python3 -m unittest tests.test_ksc   (after python3 build.py)
It exists with its QR code and is in the sitemap; it lists only Florida launches from the feed; every place on it is one docs/KSC_SOURCES.md
records, with its source linked; and it states no hours, fees, parking or access rules (those are left to the official pages)."""
import json
import pathlib
import re
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
sys.path.insert(0, str(ROOT))
import launch_pages  # noqa: E402


@unittest.skipUnless((DIST / "ksc" / "index.html").exists(), "build first")
class FloridaPage(unittest.TestCase):
    def setUp(self):
        self.html = (DIST / "ksc" / "index.html").read_text(encoding="utf-8")

    def test_page_qr_and_sitemap(self):
        self.assertTrue((DIST / "ksc" / "qr.png").exists())
        self.assertIn('<img src="/ksc/qr.png"', self.html)
        self.assertIn("<loc>https://astroradar.io/ksc/</loc>", (DIST / "sitemap.xml").read_text(encoding="utf-8"))
        self.assertIn('<link rel="canonical" href="https://astroradar.io/ksc/">', self.html)
        self.assertLess(len(self.html.encode("utf-8")), 20 * 1024)
        self.assertNotRegex(self.html, r"<script>")  # the launch pages' policy: no inline script

    def test_every_place_is_sourced(self):
        doc = (ROOT / "docs" / "KSC_SOURCES.md").read_text(encoding="utf-8")
        for p in launch_pages.KSC_PLACES:
            self.assertIn(p["n"].split(",")[0], self.html)
            self.assertIn(f'href="{p["src"]}"', self.html)
            self.assertIn(p["src"].split("/")[2], doc, p["n"])
        osm = re.findall(r"way (\d+)", doc)
        self.assertGreaterEqual(len(osm), len(launch_pages.KSC_PLACES))

    def test_no_unverified_claims(self):
        text = re.sub(r"<[^>]+>", " ", self.html).lower()
        for w in ("open daily", "opens at", "free entry", "free of charge", "free parking", "parking is", "parking costs", "parking fee", "$", "hours:", "bring a", "arrive at"):
            self.assertNotIn(w, text, w)

    def test_only_florida_launches(self):
        feed_p = DIST / "launches.json"
        if not feed_p.exists():
            self.skipTest("no feed")
        feed = json.loads(feed_p.read_text(encoding="utf-8"))
        listed = set(re.findall(r'<a href="/launch/([A-Za-z0-9_-]+)/">', self.html))
        fl = {f["id"] for f in launch_pages.florida(feed)}
        self.assertTrue(listed <= fl, listed - fl)
        self.assertEqual(len(listed), min(8, len(fl)))


if __name__ == "__main__":
    unittest.main()
