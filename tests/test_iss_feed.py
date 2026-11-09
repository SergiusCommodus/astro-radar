"""The ISS elements in the feed (scripts/fetch_launches.py): python3 -m unittest tests.test_iss_feed
CelesTrak's answer is parsed into the two lines and their epoch, anything else is refused, --iss-file puts them in the feed, and a failed
fetch keeps the last good elements, marked stale."""
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import fetch_launches as fl  # noqa: E402

TLE = (ROOT / "tests/iss/tle.txt").read_text(encoding="utf-8")
NOW = datetime(2026, 11, 9, 12, tzinfo=timezone.utc)


class IssElements(unittest.TestCase):
    def test_parses_celestrak(self):
        v = fl.iss_from(TLE, NOW)
        self.assertTrue(v["tle"][0].startswith("1 25544"))
        self.assertTrue(v["tle"][1].startswith("2 25544"))
        self.assertEqual(v["epoch"], "2026-11-08T04:12:35Z")

    def test_refuses_anything_else(self):
        for bad in ("", "<html>No GP data found</html>", "1 25544U short\n2 25544 short", TLE.replace("25544", "12345")):
            self.assertIsNone(fl.iss_from(bad, NOW), bad[:40])

    def test_iss_file_goes_into_the_feed(self):
        with tempfile.TemporaryDirectory() as d:
            out = pathlib.Path(d) / "launches.json"
            subprocess.run([sys.executable, str(ROOT / "scripts/fetch_launches.py"), str(out), "--from-file", str(ROOT / "tests/raw_ll2.json"),
                            "--now", "2026-10-26T00:00:00Z", "--iss-file", str(ROOT / "tests/iss/tle.txt")], check=True, capture_output=True)
            self.assertEqual(json.loads(out.read_text(encoding="utf-8"))["iss"]["epoch"], "2026-11-08T04:12:35Z")

    def test_last_good_copy_is_kept_and_marked_stale(self):
        with tempfile.TemporaryDirectory() as d:
            out = pathlib.Path(d) / "launches.json"
            out.write_text(json.dumps({"launches": [], "iss": fl.iss_from(TLE, NOW)}), encoding="utf-8")
            v = fl.iss_last_good(out)
            self.assertTrue(v["stale"])
            self.assertEqual(v["epoch"], "2026-11-08T04:12:35Z")


if __name__ == "__main__":
    unittest.main()
