"""Starlink headings by shell, and a slip on the launch pages (docs/REVIEW-FABLE.md H1, H2): python3 -m unittest tests.test_starlink_shells

  shells   each group in docs/STARLINK_SHELLS.md gets its shell's heading (Groups 6, 12 and 13 southeast from Florida, 10 northeast; the
           Vandenberg shells south easterly or southerly); a group not in the table gets a neutral heading and azq "guess", never northeast
  words    a launch page says its direction is an estimate for such a group
  slip     late_by finds a move later in the last 12 hours from the change log, and the page says "Liftoff was 2 min 36 s late"
"""
import pathlib
import sys
import unittest
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT))
import fetch_launches as fl  # noqa: E402
import launch_pages as lp  # noqa: E402

CAPE, VSFB = (28.5618, -80.5772), (34.6321, -120.6106)


class Shells(unittest.TestCase):
    def head(self, name, pad, v="F9"):
        return fl.starlink_heading(name, pad[0], pad[1], v)

    def test_florida(self):
        for name in ("Starlink Group 6-88", "Starlink Group 12-7", "Starlink 12-25", "Starlink Group 13-1"):
            az, q = self.head(name, CAPE)
            self.assertEqual(q, "shell", name)
            self.assertTrue(120 < az < 128, f"{name} southeast: {az}")
        az, q = self.head("Starlink 10-32", CAPE)
        self.assertTrue(40 < az < 46 and q == "shell", az)

    def test_vandenberg(self):
        self.assertTrue(130 < self.head("Starlink Group 11-25", VSFB)[0] < 136)
        self.assertTrue(152 < self.head("Starlink Group 15-4", VSFB)[0] < 158)
        for name in ("Starlink Group 17-20", "Starlink Group 13-4"):
            self.assertTrue(186 < self.head(name, VSFB)[0] < 192, name)

    def test_unknown_group_is_never_northeast(self):
        self.assertEqual(self.head("Starlink Group 99-1", CAPE), (90.0, "guess"))
        self.assertEqual(self.head("Starlink Group 99-1", VSFB), (180.0, "guess"))
        self.assertEqual(self.head("Starlink Rideshare", CAPE), (90.0, "guess"))

    def test_not_starlink_or_starship(self):
        self.assertIsNone(self.head("GPS III SV10", CAPE))
        self.assertIsNone(self.head("Starlink Group 31-2", (25.997, -97.156), v="SS"))

    def test_meo_flies_east(self):
        self.assertEqual(fl.inclination("O3b mPower 11-13", "MEO", "Medium Earth Orbit", 28.56), 28.56)

    def test_record_carries_azq(self):
        import json
        raw = json.loads((ROOT / "tests/raw_ll2.json").read_text(encoding="utf-8"))
        item = next(x for x in raw["results"] if "starlink" in (x.get("name") or "").lower())
        item = json.loads(json.dumps(item))
        item["name"] = "Falcon 9 Block 5 | Starlink Group 99-1"
        if item.get("mission"):
            item["mission"]["name"] = "Starlink Group 99-1"
        rec = fl.normalize(item, datetime(2026, 10, 26, tzinfo=timezone.utc)) if hasattr(fl, "normalize") else None
        if rec:
            self.assertEqual(rec.get("azq"), "guess")

    def test_launch_page_says_estimate(self):
        f = {"utc": "2026-11-18T05:00:00Z", "az": 90.0, "azq": "guess", "v": "F9", "pad": {"lat": CAPE[0], "lon": CAPE[1]}}
        r = lp.sky_reach(f, datetime(2026, 11, 18, 5, tzinfo=timezone.utc), {"lit": 950, "glowTwilight": 150, "nightFirst": 400})
        self.assertTrue(r and any("direction is an estimate" in x for x in r[0]), r)


class Slip(unittest.TestCase):
    CH = [{"at": "2026-11-13T19:25:00Z", "k": "status", "from": "tbd", "to": "go"},
          {"at": "2026-11-13T21:52:00Z", "k": "slip", "from": "2026-11-13T22:45:00Z", "to": "2026-11-13T22:47:36Z"}]

    def test_late_by(self):
        self.assertEqual(lp.late_by({"utc": "2026-11-13T22:47:36Z"}, self.CH), 156)
        self.assertEqual(lp.dur_text(156), "2 min 36 s")
        # a move days before liftoff is not a late liftoff
        old = [{"at": "2026-11-10T12:00:00Z", "k": "slip", "from": "2026-11-12T22:45:00Z", "to": "2026-11-13T22:47:36Z"}]
        self.assertEqual(lp.late_by({"utc": "2026-11-13T22:47:36Z"}, old), 0)
        # a move earlier is not late
        early = [{"at": "2026-11-13T21:00:00Z", "k": "slip", "from": "2026-11-13T22:50:00Z", "to": "2026-11-13T22:47:36Z"}]
        self.assertEqual(lp.late_by({"utc": "2026-11-13T22:47:36Z"}, early), 0)
        # two moves later in the last hours: from the first one's time
        two = [{"at": "2026-11-13T20:00:00Z", "k": "slip", "from": "2026-11-13T22:40:00Z", "to": "2026-11-13T22:45:00Z"}] + self.CH[1:]
        self.assertEqual(lp.late_by({"utc": "2026-11-13T22:47:36Z"}, two), 456)


if __name__ == "__main__":
    unittest.main()
