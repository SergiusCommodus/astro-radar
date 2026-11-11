"""The provider pages (provider_pages.py): python3 -m unittest tests.test_provider_pages   (after python3 build.py with a feed)
Every provider in data/providers.json has a page; its outside links are exactly the ones providers.json gives (checked by
scripts/check_providers.sh), never a guess; its launches are the feed's launches for that provider, each linking its launch page."""
import json, pathlib, re, unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
BASE = DIST / "provider"
PROVIDERS = json.loads((ROOT / "data/providers.json").read_text(encoding="utf-8"))["providers"]


def feed():
    p = DIST / "launches.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


@unittest.skipUnless((BASE / "index.html").exists(), "build first: python3 build.py")
class ProviderPages(unittest.TestCase):
    def test_every_provider_has_a_page_in_the_sitemap(self):
        sm = (DIST / "sitemap.xml").read_text(encoding="utf-8")
        self.assertIn("https://astroradar.io/provider/</loc>", sm)
        for p in PROVIDERS:
            self.assertTrue((BASE / p["key"] / "index.html").exists(), p["key"])
            self.assertIn(f"https://astroradar.io/provider/{p['key']}/</loc>", sm)
        idx = (BASE / "index.html").read_text(encoding="utf-8")
        self.assertEqual(sorted(re.findall(r'<a href="/provider/([a-z0-9]+)/">', idx)), sorted(p["key"] for p in PROVIDERS))

    def test_outside_links_are_only_the_verified_ones(self):
        for p in PROVIDERS:
            html = (BASE / p["key"] / "index.html").read_text(encoding="utf-8")
            body = html.split("<main", 1)[1].split("</main>", 1)[0]
            out = set(re.findall(r'href="(https?://[^"]+)"', body))
            want = {u for u in (p.get("live"), p.get("site"), p.get("social")) if u}
            self.assertEqual(out, want, p["key"])
            if not want:
                self.assertIn("No official links could be verified", body)
            self.assertNotIn("<script>", html, "the launch pages' policy allows no inline script")

    def test_launches_are_the_feeds(self):
        f = feed()
        for p in PROVIDERS:
            body = (BASE / p["key"] / "index.html").read_text(encoding="utf-8")
            got = re.findall(r'<a href="/launch/([^/]+)/">', body)
            want = [x["id"] for k in ("launches", "recent") for x in f.get(k) or [] if x.get("prov") == p["key"] and x.get("mis") and x.get("veh")]
            self.assertEqual(sorted(got), sorted(want), p["key"])
            for i in got:
                self.assertTrue((DIST / "launch" / i / "index.html").exists(), i)

    def test_launch_pages_link_their_provider_page(self):
        f = feed()
        keys = {p["key"] for p in PROVIDERS}
        for x in f.get("launches") or []:
            page = DIST / "launch" / x["id"] / "index.html"
            if page.exists() and x.get("prov") in keys:
                self.assertIn(f'href="/provider/{x["prov"]}/"', page.read_text(encoding="utf-8"), x["id"])


if __name__ == "__main__":
    unittest.main()
