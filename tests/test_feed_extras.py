"""The optional feed fields np, ws, we, land and tl (scripts/fetch_launches.py, extras and landing): python3 -m unittest tests.test_feed_extras
Read from a real detailed Launch Library answer (tests/raw_ll2_lookup.json, 13 Nov 2026). worker/test/parity.test.mjs checks the Worker
makes the same fields from the same file."""
import json
import pathlib
import sys
import unittest
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import fetch_launches as fl  # noqa: E402

RAW = json.loads((ROOT / "tests/raw_ll2_lookup.json").read_text(encoding="utf-8"))
NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)
FEED = fl.build(RAW, now=NOW)


def by_mis(text):
    return next(l for l in FEED["launches"] if text in l["mis"])


class Extras(unittest.TestCase):
    def test_starship(self):
        l = by_mis("Starlink Group 31-2")
        self.assertEqual(l["np"], "MIN")
        self.assertEqual((l["ws"], l["we"]), ("2026-11-13T22:45:00Z", "2026-11-14T00:00:00Z"))
        self.assertEqual(l["land"], {"t": "RTLS", "at": "OLM-B", "n": "Orbital Launch Mount B"})
        self.assertEqual(len(l["tl"]), 38)
        secs = [s for s, _ in l["tl"]]
        self.assertEqual(secs, sorted(secs))
        self.assertEqual(l["tl"][0], [-3000, "GO for Prop Load"])
        self.assertIn([0, "Liftoff"], l["tl"])
        self.assertTrue(all(isinstance(s, int) and isinstance(n, str) and 0 < len(n) <= 60 for s, n in l["tl"]))

    def test_falcon_drone_ship(self):
        l = by_mis("USSF-317")
        self.assertEqual(l["land"], {"t": "ASDS", "at": "OCISLY", "n": "Of Course I Still Love You"})
        self.assertEqual(l["np"], "MIN")
        self.assertEqual(len(l["tl"]), 19)

    def test_vandenberg_return(self):
        self.assertEqual(by_mis("NROL-136")["land"]["at"], "LZ-4")

    def test_soyuz_has_no_landing_or_timeline(self):
        l = by_mis("Kinosputnik")
        self.assertNotIn("land", l)
        self.assertNotIn("tl", l)
        self.assertEqual(l["np"], "MIN")
        self.assertEqual((l["ws"], l["we"]), ("2026-11-14T00:50:00Z", "2026-11-14T01:50:00Z"))

    def test_zero_length_window_is_left_out(self):
        l = by_mis("Mountain God")
        self.assertNotIn("ws", l)
        self.assertNotIn("we", l)

    def test_precision_tokens(self):
        self.assertEqual({l.get("np") for l in FEED["launches"]}, {"SEC", "MIN", "HR", "DAY", "M"})
        self.assertEqual(by_mis("Amazon Leo (LV-01)")["np"], "SEC")
        self.assertEqual(by_mis("Shenzhou 24")["np"], "DAY")

    def test_durations(self):
        for text, want in (("-PT35M33S", -2133), ("PT2M30S", 150), ("-P1DT2H", -93600), ("P0D", 0), ("PT20H41M55S", 74515),
                           ("-PT1.9S", -1), ("+PT5S", 5), ("PT", None), ("P", None), ("P1DT", None), ("PT1H2", None), ("1H", None),
                           ("P99999999999D", None), (None, None), (60, None), ("-PT35M33S\n", None)):
            self.assertEqual(fl.duration_s(text), want, text)

    def test_odd_records(self):
        base = next(i for i in RAW["results"] if "Kinosputnik" in i["name"])

        def mk(**over):
            return fl.normalize(dict(json.loads(json.dumps(base)), **over), NOW)
        self.assertNotIn("np", mk(net_precision={"abbrev": "min"}))
        self.assertNotIn("np", mk(net_precision={"abbrev": "TOOLONG"}))
        self.assertNotIn("np", mk(net_precision="MIN"))
        self.assertNotIn("ws", mk(window_start="bad"))
        rocket = lambda land: {"configuration": base["rocket"]["configuration"], "launcher_stage": [{"landing": land}]}  # noqa: E731
        self.assertNotIn("land", mk(rocket=rocket({"attempt": False, "type": {"abbrev": "ASDS"}})))
        self.assertNotIn("land", mk(rocket=rocket({"attempt": "yes", "type": {"abbrev": "ASDS"}})))
        self.assertNotIn("land", mk(rocket=rocket({"attempt": True})))
        self.assertEqual(mk(rocket=rocket({"attempt": True, "type": None, "location": {"abbrev": " ", "name": " Zone "}}))["land"], {"n": "Zone"})
        tl = mk(timeline=[{"type": {"abbrev": "B"}, "relative_time": "PT5S"}, {"type": {"abbrev": "A"}, "relative_time": "-PT5S"}, None,
                          {"type": {"abbrev": " "}, "relative_time": "PT1S"}, {"type": {"abbrev": "X"}, "relative_time": "soon"},
                          {"type": {"abbrev": "L" * 80}, "relative_time": "PT9S"}])["tl"]
        self.assertEqual(tl, [[-5, "A"], [5, "B"], [9, "L" * 60]])
        many = mk(timeline=[{"type": {"abbrev": f"E{i}"}, "relative_time": f"PT{50 - i}S"} for i in range(50)])["tl"]
        self.assertEqual(len(many), 40)
        self.assertEqual(many[0], [1, "E49"])
        self.assertNotIn("tl", mk(timeline="nope"))

    def test_recent_carries_landing(self):
        base = next(i for i in RAW["results"] if "USSF-317" in i["name"])
        item = dict(json.loads(json.dumps(base)), net="2026-11-12T03:14:00Z", status={"abbrev": "Success"})
        r = fl.normalize_recent(item, NOW)
        self.assertEqual(r["land"]["t"], "ASDS")
        self.assertNotIn("tl", r)


if __name__ == "__main__":
    unittest.main()
