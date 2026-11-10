"""About, Privacy and Data sources (info_pages.py): python3 -m unittest tests.test_info_pages   (after python3 build.py)
The pages must stay true to the code: the Privacy page lists what the page keeps (the radar.* keys app.js writes) and who it sends
anything to (the fetch calls app.js makes), so a new key or a new outside host fails here until the page says so."""
import pathlib, re, unittest
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
PAGES = ("about", "privacy", "data")


class Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip -= 1

    def handle_data(self, d):
        if not self.skip:
            self.out.append(d)


class TrueToTheCode(unittest.TestCase):
    def test_kept_keys_are_the_ones_the_privacy_page_lists(self):
        app = (ROOT / "src/app.js").read_text(encoding="utf-8")
        written = set(re.findall(r"store\.set\('(radar\.[a-zA-Z]+)'", app))
        # the home ZIP and its place name, the reminders, Nerd mode: what the Privacy page says is kept
        self.assertEqual(written, {"radar.zip", "radar.zipinfo", "radar.rem", "radar.nerd"},
                         "app.js keeps something new in local storage: say so on the Privacy page (info_pages.privacy) and here")

    def test_outside_hosts_are_the_ones_the_privacy_page_names(self):
        app = (ROOT / "src/app.js").read_text(encoding="utf-8")
        hosts = set(re.findall(r"fetch\('https://([^/']+)", app))
        self.assertEqual(hosts, {"api.weather.gov"}, "app.js fetches from a new outside host: say so on the Privacy page and here")

    def test_no_cookies(self):
        self.assertNotIn("document.cookie", (ROOT / "src/app.js").read_text(encoding="utf-8"))


@unittest.skipUnless((DIST / "about/index.html").exists(), "build first")
class Built(unittest.TestCase):
    def test_pages(self):
        sitemap = (DIST / "sitemap.xml").read_text(encoding="utf-8")
        sw = (DIST / "sw.js").read_text(encoding="utf-8")
        for slug in PAGES:
            h = (DIST / slug / "index.html").read_text(encoding="utf-8")
            self.assertLess(len(h.encode("utf-8")), 20 * 1024, slug)
            self.assertIn(f'<link rel="canonical" href="https://astroradar.io/{slug}/">', h)
            self.assertRegex(h, r'<meta name="description" content="[^"]{40,}">')
            self.assertIn('property="og:title"', h)
            self.assertNotRegex(h, r"<script>", f"{slug}: inline script (the policy allows none)")
            self.assertIn(f"https://astroradar.io/{slug}/", sitemap)
            self.assertIn(f'"{slug}/"', sw, f"{slug}: not kept by the service worker")
            t = Text()
            t.feed(h)
            words = " ".join(t.out)
            self.assertNotRegex(words, r"\w-\w", f"{slug}: a hyphen in the copy")
            self.assertIn("not affiliated", words)
        main = (DIST / "index.html").read_text(encoding="utf-8")
        for slug in PAGES:
            self.assertIn(f'href="{slug}/"', main, f"the footer has no link to {slug}")


if __name__ == "__main__":
    unittest.main()
