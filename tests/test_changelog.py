"""The change log (scripts/changelog.py, changes.json): python3 -m unittest tests.test_changelog
Each kind of entry, a launch seen for the first time, the 45 day trim, the cap of 20 per launch, and the feed script's flags, including
that a run on a saved answer without them never touches the network."""
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import changelog as cl  # noqa: E402
import fetch_launches as fl  # noqa: E402

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)
AT = "2026-11-13T12:00:00Z"


def iso(d):
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


def L(id_, hours, st="go", **kw):
    return dict(id=id_, utc=iso(NOW + timedelta(hours=hours)), st=st, **kw)


def feed(*launches, recent=()):
    return {"generated": AT, "launches": list(launches), "recent": list(recent)}


def one(prev, cur, prev_changes=None):
    return cl.diff(feed(*prev) if prev is not None else None, feed(*cur), prev_changes, NOW)["launches"]


class Kinds(unittest.TestCase):
    def test_no_change_no_entry(self):
        self.assertEqual(one([L("a", 5)], [L("a", 5)]), {})

    def test_first_seen_gets_nothing(self):
        self.assertEqual(one([L("a", 5)], [L("a", 5), L("b", 3, "tbd", np="DAY")]), {})
        self.assertEqual(one(None, [L("a", 5)]), {})

    def test_slip(self):
        got = one([L("a", 72)], [L("a", 73)])
        self.assertEqual(got, {"a": [{"at": AT, "k": "slip", "from": iso(NOW + timedelta(hours=72)), "to": iso(NOW + timedelta(hours=73))}]})
        # under a minute is not a slip; earlier is a slip
        self.assertEqual(one([L("a", 72)], [dict(L("a", 72), utc=iso(NOW + timedelta(hours=72, seconds=59)))]), {})
        self.assertEqual(one([L("a", 72)], [L("a", 71)])["a"][0]["k"], "slip")

    def test_scrub_later_within_a_day(self):
        got = one([L("a", 5)], [L("a", 5.25)])
        self.assertEqual([e["k"] for e in got["a"]], ["scrub"])
        self.assertEqual(got["a"][0]["to"], iso(NOW + timedelta(hours=5.25)))
        self.assertEqual([e["k"] for e in one([L("a", 5, "hold")], [L("a", 29, "hold")])["a"]], ["scrub"])

    def test_scrub_back_to_tbd(self):
        got = one([L("a", 5)], [L("a", 5, "tbd")])
        self.assertEqual([e["k"] for e in got["a"]], ["scrub", "status"])
        self.assertEqual(got["a"][1], {"at": AT, "k": "status", "from": "go", "to": "tbd"})

    def test_not_a_scrub(self):
        self.assertEqual([e["k"] for e in one([L("a", 5)], [L("a", 5.2)])["a"]], ["slip"])        # under 15 minutes later
        self.assertEqual([e["k"] for e in one([L("a", 30)], [L("a", 31)])["a"]], ["slip"])         # more than a day out
        self.assertEqual([e["k"] for e in one([L("a", 5, "tbd")], [L("a", 6, "tbd")])["a"]], ["slip"])  # was not go or hold
        self.assertEqual([e["k"] for e in one([L("a", 5)], [L("a", 4)])["a"]], ["slip"])          # earlier

    def test_status_and_precision(self):
        got = one([L("a", 50, "tbd", np="HR")], [L("a", 50, "go", np="MIN")])
        self.assertEqual(got["a"], [{"at": AT, "k": "status", "from": "tbd", "to": "go"}, {"at": AT, "k": "np", "from": "HR", "to": "MIN"}])
        # a feed from before np existed is not a change of precision
        self.assertEqual(one([L("a", 50)], [L("a", 50, np="MIN")]), {})

    def test_gone(self):
        # b is more than 2 days out, c in flight and e past the time the feed drops it anyway
        got = one([L("a", 20), L("b", 100), L("c", 1, "flight"), L("e", -1)], [])
        self.assertEqual(got, {"a": [{"at": AT, "k": "gone", "utc": iso(NOW + timedelta(hours=20))}]})
        self.assertEqual(one([L("f", -0.25)], [])["f"][0]["k"], "gone")
        # a launch that flew and is now in recent did not leave
        self.assertEqual(cl.diff(feed(L("d", 10)), feed(recent=[{"id": "d"}]), None, NOW)["launches"], {})

    def test_keeps_previous_and_appends_newest_last(self):
        prev = {"generated": AT, "launches": {"a": [{"at": "2026-11-10T00:00:00Z", "k": "status", "from": "tbd", "to": "go"}],
                                              "z": [{"at": "2026-11-01T00:00:00Z", "k": "gone", "utc": "2026-11-02T00:00:00Z"}]}}
        got = one([L("a", 72)], [L("a", 75)], prev)
        self.assertEqual([e["k"] for e in got["a"]], ["status", "slip"])
        self.assertIn("z", got)

    def test_rerun_is_not_counted_twice(self):
        first = cl.diff(feed(L("a", 72)), feed(L("a", 75)), None, NOW)
        again = cl.diff(feed(L("a", 72)), feed(L("a", 75)), first, NOW + timedelta(minutes=30))
        self.assertEqual(len(again["launches"]["a"]), 1)

    def test_trim_45_days(self):
        old = {"launches": {"a": [{"at": iso(NOW - timedelta(days=46)), "k": "slip", "from": "x", "to": "y"},
                                  {"at": iso(NOW - timedelta(days=44)), "k": "slip", "from": "y", "to": "z"}],
                            "b": [{"at": iso(NOW - timedelta(days=50)), "k": "gone", "utc": "x"}]}}
        got = cl.diff(None, feed(), old, NOW)["launches"]
        self.assertEqual(list(got), ["a"])
        self.assertEqual(got["a"][0]["to"], "z")

    def test_cap_20(self):
        old = {"launches": {"a": [{"at": iso(NOW - timedelta(hours=40 - i)), "k": "slip", "from": str(i), "to": str(i + 1)} for i in range(25)]}}
        got = one([L("a", 72)], [L("a", 80)], old)["a"]
        self.assertEqual(len(got), 20)
        self.assertEqual(got[-1]["at"], AT)
        self.assertEqual(got[0]["from"], "6")

    def test_bad_previous_log_is_ignored(self):
        for bad in (None, [], {"launches": []}, {"launches": {"a": "x", "b": [1, {"k": "slip"}, {"at": "bad", "k": "x"}]}}):
            self.assertEqual(cl.diff(None, feed(), bad, NOW), {"generated": AT, "launches": {}})


class Script(unittest.TestCase):
    """fetch_launches.py writes changes.json next to its output, compact."""

    def setUp(self):
        self.tmp = pathlib.Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.raw = ROOT / "tests/raw_ll2_lookup.json"

    def run_script(self, *extra):
        out = self.tmp / "launches.json"
        r = subprocess.run([sys.executable, str(ROOT / "scripts/fetch_launches.py"), str(out), "--from-file", str(self.raw),
                            "--now", "2026-11-13T12:00:00Z", *extra], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads((self.tmp / "changes.json").read_text(encoding="utf-8")), (self.tmp / "changes.json").read_text(encoding="utf-8")

    def test_from_file_starts_empty(self):
        got, text = self.run_script()
        self.assertEqual(got, {"generated": AT, "launches": {}})
        self.assertNotIn(" ", text)

    def test_prev_flags(self):
        cur = fl.build(json.loads(self.raw.read_text(encoding="utf-8")), now=NOW)
        prev = json.loads(json.dumps(cur))
        star = next(l for l in prev["launches"] if "31-2" in l["mis"])
        star["utc"], star["np"] = "2026-11-13T21:45:00Z", "HR"
        prev["launches"].append(L("left", 30, "go"))
        (self.tmp / "prev.json").write_text(json.dumps(prev), encoding="utf-8")
        (self.tmp / "prevc.json").write_text(json.dumps({"launches": {"x": [{"at": "2026-11-12T00:00:00Z", "k": "gone", "utc": "2026-11-12T01:00:00Z"}]}}),
                                             encoding="utf-8")
        got, _ = self.run_script("--prev-feed", str(self.tmp / "prev.json"), "--prev-changes", str(self.tmp / "prevc.json"))
        sid = star["id"]
        self.assertEqual([e["k"] for e in got["launches"][sid]], ["slip", "np"])
        self.assertEqual(got["launches"][sid][0], {"at": AT, "k": "slip", "from": "2026-11-13T21:45:00Z", "to": "2026-11-13T22:45:00Z"})
        self.assertEqual(got["launches"]["left"][0]["k"], "gone")
        self.assertIn("x", got["launches"])

    def test_no_network_without_flags(self):
        """--from-file and no --prev-* flag: the live site is never asked."""
        cur = fl.build(json.loads(self.raw.read_text(encoding="utf-8")), now=NOW)
        out = self.tmp / "launches.json"
        argv = ["fetch_launches.py", str(out), "--from-file", str(self.raw), "--now", "2026-11-13T12:00:00Z"]
        with mock.patch("urllib.request.urlopen", side_effect=AssertionError("network used")) as net:
            self.assertEqual(fl.main(argv), 0)
            self.assertFalse(net.called)
        self.assertTrue((self.tmp / "changes.json").exists())
        self.assertEqual(len(json.loads(out.read_text(encoding="utf-8"))["launches"]), len(cur["launches"]))

    def test_last_good_reads_the_output_folder_first(self):
        out = self.tmp / "launches.json"
        out.write_text(json.dumps(feed(L("a", 5))), encoding="utf-8")
        (self.tmp / "changes.json").write_text(json.dumps({"launches": {}}), encoding="utf-8")
        with mock.patch("urllib.request.urlopen", side_effect=AssertionError("network used")):
            f, c = cl.last_good(out)
        self.assertEqual(f["launches"][0]["id"], "a")
        self.assertEqual(c, {"launches": {}})
        with mock.patch("urllib.request.urlopen", side_effect=OSError("offline")):
            self.assertEqual(cl.last_good(self.tmp / "missing" / "launches.json"), (None, None))
        self.assertEqual(cl.last_good(self.tmp / "missing" / "launches.json", network=False), (None, None))


if __name__ == "__main__":
    unittest.main()
