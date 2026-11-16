"""Scrub and slip odds (scripts/scrub_stats.py): python3 -m unittest tests.test_scrub_stats
The math on small made up histories (what counts as a scrub, a late move to another day, a watched countdown, the median time to the next
try, the fallback from a rocket to its family and provider, and too few to say), then the committed numbers against the saved history."""
import json
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import scrub_stats as ss  # noqa: E402


def L(net, notes, rocket="Falcon 9", provider="SpaceX", status="Success"):
    return {"net": net, "rocket": rocket, "provider": provider, "status": status, "updates": [{"at": a, "text": t} for a, t in notes]}


class Math(unittest.TestCase):
    def test_a_scrub_note_counts_once_and_no_scrub_does_not(self):
        s, m, r, w = ss.one(L("2026-03-02T12:00:00Z", [("2026-03-01T12:30:00Z", "Scrubbed for the day."), ("2026-03-01T13:00:00Z", "Scrub confirmed")]))
        self.assertTrue(s)
        self.assertAlmostEqual(r, 23.0)
        self.assertTrue(w)
        s, *_ = ss.one(L("2026-03-02T12:00:00Z", [("2026-03-02T11:00:00Z", "No scrub: weather is GO")]))
        self.assertFalse(s)
        s, *_ = ss.one(L("2026-03-02T12:00:00Z", [("2026-03-03T11:00:00Z", "Scrubbed for the day.")]))
        self.assertFalse(s, "a note after liftoff is not a scrub of this flight")

    def test_a_late_move_is_a_new_day_not_a_new_time(self):
        same_day = [("2026-03-01T00:00:00Z", "Now targeting Mar 2 at 10:00 UTC"), ("2026-03-01T20:00:00Z", "Now targeting Mar 2 at 12:00 UTC")]
        self.assertFalse(ss.one(L("2026-03-02T12:00:00Z", same_day))[1])
        new_day = [("2026-02-25T00:00:00Z", "Now targeting Mar 1 at 10:00 UTC"), ("2026-02-28T20:00:00Z", "Now targeting Mar 2 at 12:00 UTC")]
        self.assertTrue(ss.one(L("2026-03-02T12:00:00Z", new_day))[1])
        early = [("2026-02-20T00:00:00Z", "NET Feb 25"), ("2026-02-21T00:00:00Z", "Now targeting Mar 2 at 12:00 UTC")]
        self.assertFalse(ss.one(L("2026-03-02T12:00:00Z", early))[1], "a move more than 72 hours out does not count")

    def test_groups_fallback_and_too_few(self):
        hist = [L(f"2026-01-{d:02d}T12:00:00Z", [(f"2026-01-{d:02d}T10:00:00Z", "GO for launch.")] + ([(f"2026-01-{d - 1:02d}T11:00:00Z", "Scrubbed for the day.")] if d % 4 == 0 else []))
                for d in range(2, 22)]
        hist += [L("2026-02-01T00:00:00Z", [], rocket="Long March 2D", provider="China Aerospace Science and Technology Corporation") for _ in range(10)]
        hist += [L("2026-02-02T00:00:00Z", [("2026-02-01T00:00:00Z", "GO for launch.")], rocket="Atlas V 551", provider="United Launch Alliance") for _ in range(3)]
        g, n = ss.stats(hist)
        self.assertEqual(n, 33)
        f9 = g["rocket:Falcon 9"]
        self.assertEqual((f9["n"], f9["scrubbed"], f9["watched"]), (20, 5, 20))
        self.assertEqual(f9["retry_h"], 25)
        odds = {"groups": g}
        o = ss.odds_for(odds, "Falcon 9", ["SpaceX"])
        self.assertTrue(o["enough"])
        self.assertEqual(o["key"], "rocket:Falcon 9")
        o = ss.odds_for(odds, "Long March 2D", ["China Aerospace Science and Technology Corporation"])
        self.assertFalse(o["enough"], "ten flights whose notes never follow the countdown are too thin to give odds")
        o = ss.odds_for(odds, "Atlas V 541", ["United Launch Alliance"])
        self.assertFalse(o["enough"])
        self.assertEqual(o["key"], "family:Atlas V", "an unknown variant falls back to its family")
        self.assertIsNone(ss.odds_for(odds, "New Glenn", ["Blue Origin"]))

    def test_family(self):
        self.assertEqual(ss.family("Atlas V 551"), "Atlas V")
        self.assertEqual(ss.family("Falcon 9"), "Falcon 9")
        self.assertEqual(ss.family("Long March 2D"), "Long March 2D")
        self.assertEqual(ss.family("Soyuz 2.1b/Fregat-M"), "Soyuz 2.1b/Fregat M")


class Committed(unittest.TestCase):
    def test_odds_match_the_saved_history(self):
        h = json.loads((ROOT / "data/history/ll2_flown.json").read_text(encoding="utf-8"))
        odds = json.loads((ROOT / "data/history/odds.json").read_text(encoding="utf-8"))
        g, n = ss.stats(h["launches"])
        self.assertEqual(odds["flown"], n)
        self.assertEqual(odds["groups"], json.loads(json.dumps(dict(sorted(g.items())))), "run python3 scripts/scrub_stats.py again")
        f9 = odds["groups"]["rocket:Falcon 9"]
        self.assertGreaterEqual(f9["n"], 100)
        self.assertLess(f9["scrubbed"] / f9["n"], 0.25, "a sanity bound: a quarter of Falcon 9 flights scrubbing would mean the parser is wrong")
        self.assertLess(f9["late_move"], f9["n"])
        self.assertFalse(ss.odds_for(odds, "Long March 6A", ["China Aerospace Science and Technology Corporation"])["enough"])


if __name__ == "__main__":
    unittest.main()
