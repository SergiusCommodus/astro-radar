"""Checks for launch_pages.py and what the build wrote with it.

    python3 tests/make_mock_ll2.py mock.json && python3 scripts/fetch_launches.py dist/launches.json --from-file mock.json && python3 build.py
    python3 -m unittest discover -s tests -p "test_*.py"

The parts that need a built site are skipped when dist/launches.json is missing.
"""
import json, pathlib, re, sys, unittest
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import launch_pages as lp  # noqa: E402

DIST = ROOT / "dist"


def unfold(text):
    return text.replace("\r\n ", "")


class Calendar(unittest.TestCase):
    def test_fold_keeps_lines_short_and_characters_whole(self):
        line = "DESCRIPTION:" + "Starlink · Falcon 9 · " * 12
        folded = lp.ics_fold(line)
        for part in folded.split("\r\n"):
            self.assertLessEqual(len(part.encode("utf-8")), 75)
        self.assertEqual(unfold(folded), line)

    def test_text_is_escaped(self):
        self.assertEqual(lp.ics_text("a;b,c\\d\ne"), "a\\;b\\,c\\\\d\\ne")

    def test_event_is_in_utc_with_two_alerts(self):
        when = datetime(2026, 10, 30, 23, 16, tzinfo=timezone.utc)
        f = {"id": "x1", "veh": "Falcon 9", "mis": "Test", "pad": {"full": "Pad, Place"}, "st": "tbd"}
        ev = "\r\n".join(lp.ics_event(f, when, "https://example.org/w", when))
        self.assertIn("DTSTART:20261030T231600Z", ev)
        self.assertIn("DTEND:20261030T234600Z", ev)
        self.assertIn("UID:x1@astroradar.io", ev)
        self.assertEqual(ev.count("BEGIN:VALARM"), 2)
        self.assertIn("TRIGGER:-P1D", ev)
        self.assertIn("TRIGGER:-PT30M", ev)
        self.assertIn("Time to be confirmed", ev)


class SkyNote(unittest.TestCase):
    RNG = {"day": 200, "lit": 950, "nightFirst": 400, "nightUpper": 250, "glowTwilight": 150}

    def note(self, utc, az=45):
        f = {"pad": {"lat": 28.56, "lon": -80.58}, "az": az, "v": "F9"}
        return " ".join(lp.sky_note(f, datetime.fromisoformat(utc), self.RNG))

    def test_daylight(self):
        self.assertIn("daylight", self.note("2026-06-16T17:00:00+00:00"))

    def test_night(self):
        self.assertIn("in the dark", self.note("2026-06-16T05:00:00+00:00"))

    def test_crew2_dawn_reaches_sunlight(self):
        # Crew 2, Apr 23 2021, 5:49 am EDT: the well known pre dawn "jellyfish"
        self.assertIn("reach sunlight", self.note("2021-04-23T09:49:02+00:00", az=40))

    def test_distances_use_the_page_rule(self):
        # the page's distTxt: whole miles from km x 0.621371 and whole km, both rounded half up (Math.round), with thousands separators
        for km, want in [(200, "124 mi (200 km)"), (400, "249 mi (400 km)"), (950, "590 mi (950 km)"), (12763.4, "7,931 mi (12,763 km)"), (0.5, "0 mi (1 km)")]:
            self.assertEqual(lp.mi(km), want)
        self.assertIn("590 mi (950 km)", self.note("2021-04-23T09:49:02+00:00", az=40))

    def test_ranges_come_from_the_model(self):
        rng = lp.ranges((ROOT / "src/model.js").read_text(encoding="utf-8"))
        self.assertEqual(set(rng), {"day", "lit", "nightFirst", "nightUpper", "glowTwilight"})


@unittest.skipUnless((DIST / "launches.json").exists() and (DIST / "launch").exists(), "needs a build with a feed")
class Built(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.feed = json.loads((DIST / "launches.json").read_text(encoding="utf-8"))
        cls.ups = [f for f in cls.feed["launches"] if re.fullmatch(r"[A-Za-z0-9_-]{1,80}", f.get("id", ""))]

    def test_every_launch_has_a_small_page(self):
        for f in self.ups + self.feed.get("recent", []):
            page = DIST / "launch" / f["id"] / "index.html"
            self.assertTrue(page.exists(), f["id"])
            html = page.read_text(encoding="utf-8")
            self.assertLess(len(html.encode("utf-8")), 20 * 1024, f["id"])
            self.assertIn(f'<link rel="canonical" href="https://astroradar.io/launch/{f["id"]}/">', html)
            self.assertIn(lp.e(f["mis"]), html)

    def test_feed_times_are_the_feed_times(self):
        cal = unfold((DIST / "launches.ics").read_bytes().decode("utf-8"))
        for f in self.ups:
            if f.get("st") == "flight":
                continue
            stamp = datetime.fromisoformat(f["utc"].replace("Z", "+00:00")).strftime("%Y%m%dT%H%M%SZ")
            block = re.search(r"UID:" + re.escape(f["id"]) + r"@astroradar.io\r\n(.*?)END:VEVENT", cal, re.S)
            self.assertIsNotNone(block, f["id"])
            self.assertIn("DTSTART:" + stamp, block.group(1))

    def test_calendar_lines_are_folded_with_crlf(self):
        raw = (DIST / "launches.ics").read_bytes()
        self.assertTrue(raw.endswith(b"\r\n"))
        self.assertNotIn(b"\n", raw.replace(b"\r\n", b""))
        for line in raw.split(b"\r\n"):
            self.assertLessEqual(len(line), 75)

    def test_structured_data_only_for_launches_not_flown(self):
        for f in self.ups + self.feed.get("recent", []):
            html = (DIST / "launch" / f["id"] / "index.html").read_text(encoding="utf-8")
            lds = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
            flown = f in self.feed.get("recent", []) or f.get("st") == "flight"
            self.assertEqual(len(lds), 0 if flown else 1, f["id"])
            for ld in lds:
                d = json.loads(ld)
                self.assertEqual(d["@type"], "Event")
                self.assertEqual(d["startDate"], f["utc"])

    def test_sitemap_lists_every_page(self):
        xml = (DIST / "sitemap.xml").read_text(encoding="utf-8")
        for f in self.ups + self.feed.get("recent", []):
            self.assertIn(f"https://astroradar.io/launch/{f['id']}/", xml)


if __name__ == "__main__":
    unittest.main()
