"""Go watch (gowatch.py, data/viewing_spots.json, data/history/odds.json): python3 -m unittest tests.test_gowatch   (after a build with a feed)
The places' data (every fact with a source and a date, nothing from a search summary), Plan your trip on every upcoming launch page (the
nearest places in distance order with distances worked out from the feed's pad, the arrive by time two hours before liftoff, the odds as the
odds file has them, with the sample size), the guide pages, a page per pad with valid Event markup pointing at real launch pages, What was
that in the sky?, and the sitemap."""
import html
import json
import pathlib
import re
import sys
import unittest
from datetime import datetime, timedelta

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
sys.path.insert(0, str(ROOT))
import gowatch  # noqa: E402
import launch_pages  # noqa: E402


def feed():
    return json.loads((DIST / "launches.json").read_text(encoding="utf-8"))


class Data(unittest.TestCase):
    def test_every_place_has_a_location_and_dated_sources(self):
        spots = json.loads((ROOT / "data/viewing_spots.json").read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(spots["places"]), 20)
        for p in spots["places"]:
            self.assertIn(p["region"], ("cape", "vandenberg", "starbase"), p["key"])
            self.assertTrue(-90 < p["lat"] < 90 and -180 < p["lon"] < 180, p["key"])
            self.assertTrue(p["sources"], p["key"])
            for s in p["sources"]:
                self.assertTrue(s["url"].startswith("https://"), s)
                self.assertRegex(s["checked"], r"^\d{4}-\d\d-\d\d$")
            blob = json.dumps(p)
            self.assertNotRegex(blob, r"(?i)snippet", f"{p['key']}: a fact only a search summary gave")
        self.assertEqual({p["region"] for p in spots["places"]}, {"cape", "vandenberg", "starbase"})

    def test_region_of(self):
        self.assertEqual(gowatch.region_of({"pad": {"st": "FL", "n": "Space Launch Complex 40"}}), "cape")
        self.assertEqual(gowatch.region_of({"pad": {"n": "Space Launch Complex 4E", "full": "Space Launch Complex 4E, Vandenberg SFB, CA, USA"}}), "vandenberg")
        self.assertEqual(gowatch.region_of({"pad": {"n": "Orbital Launch Mount A", "full": "Orbital Launch Mount A, Starbase, TX, USA"}}), "starbase")
        self.assertIsNone(gowatch.region_of({"pad": {"n": "Launch Complex 1", "full": "Rocket Lab Launch Complex 1, Mahia Peninsula, New Zealand"}}))

    def test_odds_words_carry_the_sample_size(self):
        a, b = gowatch.odds_line({"key": "rocket:Falcon 9", "n": 126, "scrubbed": 10, "late_move": 33, "retry_h": 25, "retry_n": 10,
                                  "from": "2025-12-10", "to": "2026-11-12", "enough": True}, "Falcon 9")
        self.assertIn("10 of 126 Falcon 9 flights from Dec 10, 2025 to Nov 12, 2026 had a scrub (8%)", a)
        self.assertIn("33 (26%) moved to another day", a)
        self.assertIn("a median 25 hours later (10 scrubs)", b)
        a, b = gowatch.odds_line({"key": "rocket:Starship", "n": 4, "scrubbed": 2, "late_move": 1, "retry_h": None, "retry_n": 2,
                                  "from": "2026-05-22", "to": "2026-11-13", "enough": False}, "Starship")
        self.assertIn("Too few to say for Starship", a)
        self.assertIn("only 4 flown", a)
        self.assertIsNone(b)


@unittest.skipUnless((DIST / "launches.json").exists() and (DIST / "guide/index.html").exists(), "build with a feed first")
class Pages(unittest.TestCase):
    def test_plan_your_trip_on_every_upcoming_launch_page(self):
        spots, odds = gowatch.load()
        fd, now = feed(), datetime.fromisoformat(feed()["generated"].replace("Z", "+00:00"))
        seen = 0
        for f in fd["launches"]:
            p = DIST / "launch" / f["id"] / "index.html"
            if not p.exists():
                continue
            t = p.read_text(encoding="utf-8")
            when = datetime.fromisoformat(f["utc"].replace("Z", "+00:00"))
            if when < now - timedelta(minutes=15):
                continue
            self.assertIn('<section class="trip" id="trip"><h2>Plan your trip</h2>', t, f["id"])
            r = gowatch.region_of(f)
            if not r:
                self.assertIn("no viewing guide for this launch site yet", t, f["id"])
                continue
            seen += 1
            names = re.findall(r'<li class="spot"><h3>([^<]+)</h3><p class="sp-d"><b>([^<]+)</b>', t)
            want = gowatch.near(f, spots, 3)
            self.assertEqual([html.unescape(n) for n, _ in names], [gowatch.dehy(p["name"]) for _, p in want], f["id"])
            self.assertEqual([d for _, d in names], [launch_pages.mi(km) for km, _ in want], f"{f['id']}: distances from the feed's pad")
            arrive = (when - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%SZ")
            self.assertIn(f'<span>Arrive by</span><b><time datetime="{arrive}" data-local="t">', t, f["id"])
            o = gowatch.odds_of(f, odds, launch_pages_providers())
            if o and o["enough"]:
                self.assertIn(f"{o['scrubbed']} of {o['n']} ", t, f["id"])
            self.assertIn("Facts checked Nov 15, 2026", t)
        self.assertGreater(seen, 2, "the mock feed has launches from Florida, California and Texas")

    def test_guides_pads_and_tonight(self):
        for slug in ("guide", "vandenberg", "starbase", "tonight"):
            t = (DIST / slug / "index.html").read_text(encoding="utf-8")
            self.assertIn(f'<link rel="canonical" href="https://astroradar.io/{slug}/">', t)
            self.assertNotRegex(t, r"(?i)lorem|todo|undefined|snippet")
            self.assertIn(f"https://astroradar.io/{slug}/", (DIST / "sitemap.xml").read_text(encoding="utf-8"))
        v = (DIST / "vandenberg/index.html").read_text(encoding="utf-8")
        self.assertIn("closed to public launch viewing", v)
        s = (DIST / "starbase/index.html").read_text(encoding="utf-8")
        self.assertIn("Boca Chica Beach and State Highway 4", s)
        ids = {f["id"] for f in feed()["launches"]}
        pads = list((DIST / "pad").iterdir())
        self.assertGreater(len(pads), 5)
        for d in pads:
            t = (d / "index.html").read_text(encoding="utf-8")
            for m in re.finditer(r'<script type="application/ld\+json">(.*?)</script>', t, re.S):
                ld = json.loads(m.group(1))
                self.assertEqual(ld["@type"], "ItemList")
                for it in ld["itemListElement"]:
                    ev = it["item"]
                    self.assertEqual(ev["@type"], "Event")
                    for k in ("name", "startDate", "location", "url", "eventStatus"):
                        self.assertIn(k, ev, d.name)
                    lid = ev["url"].rstrip("/").rsplit("/", 1)[1]
                    self.assertIn(lid, ids, f"{d.name}: an Event must point at a real launch page")
                    self.assertTrue((DIST / "launch" / lid / "index.html").exists())
            self.assertIn("https://astroradar.io/pad/" + d.name + "/", (DIST / "sitemap.xml").read_text(encoding="utf-8"))
        n = (DIST / "tonight/index.html").read_text(encoding="utf-8")
        self.assertRegex(n, r'<p class="big">(Most likely|The last launch was) <a href="/launch/|No launch we track flew in the last 12 hours')


def launch_pages_providers():
    raw = json.loads((ROOT / "data/providers.json").read_text(encoding="utf-8"))
    return {p["key"]: p for p in raw["providers"]}


if __name__ == "__main__":
    unittest.main()
