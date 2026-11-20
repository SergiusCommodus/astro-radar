"""One navigation (docs/FLOW.md): python3 -m unittest tests.test_flow   (after python3 build.py with a feed)
The whole site is four jobs (Next, Launches, Go watch, Space now) and one More menu, with the same names in the same order in the main
page's top bar and bottom bar and on every other page; each page sits in its section with a way back, no page is an orphan, and a launch
page leads with its name, countdown and Watch, then Look Up, then Plan your trip, then the details."""
import pathlib
import re
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
sys.path.insert(0, str(ROOT))
import launch_pages  # noqa: E402

JOBS = ["Next", "Launches", "Go watch", "Space now"]
MORE = ["Your launches", "Watch with friends", "Providers", "Launch statistics", "What was that in the sky?", "About", "Privacy", "Data sources"]


def labels(fragment):
    return [re.sub(r"<[^>]+>", "", x).strip() for x in re.findall(r"<a [^>]*>(.*?)</a>", fragment, re.S)]


def pages():
    """every page but the moved one (/ksc/) and the sign in page"""
    out = []
    for p in sorted(DIST.rglob("index.html")):
        rel = p.parent.relative_to(DIST).as_posix()
        if rel in ("ksc", "signin") or rel.startswith(("calendar", "nasa", "providers", "fonts")):
            continue
        out.append((rel, p.read_text(encoding="utf-8")))
    return out


class Lists(unittest.TestCase):
    def test_the_lists(self):
        self.assertEqual([t for k, u, t in launch_pages.NAV], JOBS)
        self.assertEqual([t for k, u, t in launch_pages.MORE], MORE)
        self.assertLessEqual(len(launch_pages.NAV) + 1, 5, "a phone's bottom bar holds at most five")


@unittest.skipUnless((DIST / "launch").exists() and any((DIST / "launch").iterdir()), "build with a feed first")
class OneNavigation(unittest.TestCase):
    def test_same_header_bottom_bar_and_footer_everywhere(self):
        n = 0
        for rel, t in pages():
            if rel == ".":
                top = re.search(r'<nav class="nav-links"[^>]*>(.*?)</nav>', t, re.S).group(1)
                more = re.search(r'<div class="nmore-p">(.*?)</div>', t, re.S).group(1)
            else:
                nav = re.search(r'<nav class="tnav"[^>]*>(.*?)</nav>', t, re.S)
                self.assertTrue(nav, rel)
                top, more = nav.group(1).split('<details class="tmore">')
            self.assertEqual(labels(top), JOBS, rel)
            self.assertEqual(labels(more), MORE, rel)
            bar = re.search(r'<nav class="tabbar"[^>]*>(.*?)</nav>', t, re.S)
            self.assertTrue(bar, f"{rel}: no bottom bar")
            jobs, sheet = bar.group(1).split('<details class="ptab tb-more t-more">')
            self.assertEqual(labels(jobs), JOBS, rel)
            self.assertIn("<span>More</span>", sheet, rel)
            self.assertEqual(labels(sheet.split('<div class="tb-sheet">')[1]), MORE, rel)
            foot = t[t.rindex("<footer"):]
            for k in JOBS + MORE:
                self.assertIn(">" + k + "</a>", foot, f"{rel}: the footer has no {k}")
            n += 1
        self.assertGreater(n, 40)

    def test_a_page_marks_its_own_section(self):
        want = {"live": "Space now", "news": "Space now", "guide": "Go watch", "spacecoast": "Go watch", "vandenberg": "Go watch", "starbase": "Go watch"}
        for rel, t in pages():
            k = rel.split("/")[0]
            sec = want.get(k) or ("Go watch" if k == "pad" else "Launches" if k in ("launch", "provider") else None)
            cur = re.findall(r'<a [^>]*aria-current="page"[^>]*>(?:<i[^>]*></i><span>)?([^<]+)<', t)
            if sec:
                self.assertIn(sec, cur, rel)
            for m in ("about", "privacy", "data", "logbook", "astro", "tonight"):
                if k == m:
                    self.assertIn({"about": "About", "privacy": "Privacy", "data": "Data sources", "logbook": "Your launches",
                                   "astro": "Watch with friends", "tonight": "What was that in the sky?"}[m], cur, rel)

    def test_the_way_back(self):
        for rel, t in pages():
            k = rel.split("/")[0]
            up = re.findall(r'<a class="crumb" href="([^"]+)">([^<]+)</a>', t)
            if k in ("spacecoast", "vandenberg", "starbase", "pad"):
                self.assertEqual(up, [("/guide/", "Go watch")], rel)
            elif k == "provider" and rel != "provider":
                self.assertEqual(up, [("/provider/", "Providers")], rel)
            elif k == "launch":
                self.assertEqual(up, [("/#launches", "All launches")], rel)
            self.assertIn('<a class="brand" href="/">', t) if rel != "." else None

    def test_space_now_switch(self):
        for k in ("live", "news"):
            t = (DIST / k / "index.html").read_text(encoding="utf-8")
            sw = re.search(r'<nav class="sw2"[^>]*>(.*?)</nav>', t, re.S).group(1)
            self.assertEqual(labels(sw), ["Live", "News"])
            self.assertIn(f'href="/{k}/" aria-current="page"', sw)


@unittest.skipUnless((DIST / "launch").exists() and any((DIST / "launch").iterdir()), "build with a feed first")
class NoOrphans(unittest.TestCase):
    def test_every_pad_page_is_on_go_watch_and_its_launch_pages(self):
        guide = (DIST / "guide" / "index.html").read_text(encoding="utf-8")
        pads = sorted(p.name for p in (DIST / "pad").iterdir())
        self.assertTrue(pads)
        for slug in pads:
            self.assertIn(f'href="/pad/{slug}/"', guide, slug)
        linked = set()
        for p in (DIST / "launch").glob("*/index.html"):
            linked |= set(re.findall(r'href="/pad/([^/"]+)/"', p.read_text(encoding="utf-8")))
        self.assertEqual(linked - set(pads), set(), "a launch page links a pad page that does not exist")
        self.assertGreaterEqual(len(linked), len(pads) * 0.8, "most pads are linked from their launches")

    def test_go_watch_links_the_places_and_what_was_that(self):
        guide = (DIST / "guide" / "index.html").read_text(encoding="utf-8")
        self.assertIn("<h1>Go watch</h1>", guide)
        for u in ("/spacecoast/", "/vandenberg/", "/starbase/", "/tonight/"):
            self.assertIn(f'href="{u}"', guide, u)
        self.assertIn('id="first"', guide, "the first launch guide is on Go watch")

    def test_the_florida_page_moved_to_the_space_coast(self):
        t = (DIST / "ksc" / "index.html").read_text(encoding="utf-8")
        self.assertIn('<meta http-equiv="refresh" content="0;url=/spacecoast/">', t)
        self.assertIn('<link rel="canonical" href="https://astroradar.io/spacecoast/">', t)
        self.assertNotRegex(t, r"<script")
        self.assertTrue((DIST / "ksc" / "qr.png").exists(), "the printed QR code's image")
        self.assertIn('<img src="/ksc/qr.png"', (DIST / "spacecoast" / "index.html").read_text(encoding="utf-8"))
        self.assertNotIn("astroradar.io/ksc/", (DIST / "sitemap.xml").read_text(encoding="utf-8"))

    def test_main_page_has_no_removed_tabs(self):
        main = (DIST / "index.html").read_text(encoding="utf-8")
        for gone in ('id="p-watch"', 'id="p-astro"', 'id="providers"', 'id="featWatch"'):
            self.assertNotIn(gone, main, gone)


@unittest.skipUnless((DIST / "launch").exists() and any((DIST / "launch").iterdir()), "build with a feed first")
class LaunchPageOrder(unittest.TestCase):
    def test_name_countdown_watch_then_look_up_then_trip_then_details(self):
        n = 0
        for p in sorted((DIST / "launch").glob("*/index.html")):
            t = p.read_text(encoding="utf-8")
            if 'id="luData"' not in t or 'class="trip"' not in t:
                continue  # flown launches have no Look Up and no trip
            at = lambda s: t.index(s)
            order = [at("<h1>"), at('class="cd"'), at('<div class="acts">'), at('id="luData"'), at('class="trip"'), at("<h2>The mission</h2>"), at('<dl class="facts">')]
            self.assertEqual(order, sorted(order), p.parent.name)
            n += 1
        self.assertGreater(n, 3)


if __name__ == "__main__":
    unittest.main()
