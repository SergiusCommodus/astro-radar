"""scripts/health_check.py against the local build, served the way GitHub Pages serves it: python3 -m unittest tests.test_health
(after a build with a feed). Healthy as built; a stale feed (the clock moved 3 hours on) and a missing feed are each named."""
import pathlib, shutil, socket, subprocess, sys, tempfile, time, unittest
from datetime import datetime, timedelta, timezone

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
sys.path.insert(0, str(ROOT / "scripts"))
import health_check as hc  # noqa: E402


def serve(folder):
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    p = subprocess.Popen([sys.executable, str(ROOT / "tests/serve.py"), str(folder), str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            socket.create_connection(("127.0.0.1", port), timeout=.2).close()
            break
        except OSError:
            time.sleep(.1)
    return p, f"http://127.0.0.1:{port}/"


@unittest.skipUnless((DIST / "launches.json").exists() and (DIST / "launches.ics").exists(), "build with a feed first")
class Health(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.proc, cls.base = serve(DIST)

    @classmethod
    def tearDownClass(cls):
        cls.proc.terminate()

    def test_healthy_as_built(self):
        bad, ok = hc.check(self.base, 120)
        self.assertEqual(bad, [])
        self.assertGreaterEqual(len(ok), 5)

    def test_a_stale_feed_is_named(self):
        bad, _ = hc.check(self.base, 120, now=datetime.now(timezone.utc) + timedelta(hours=3))
        self.assertEqual(len(bad), 1)
        self.assertIn("feed: launches.json was generated", bad[0])

    def test_a_missing_feed_is_named(self):
        tmp = pathlib.Path(tempfile.mkdtemp())
        try:
            shutil.copytree(DIST, tmp / "d")
            (tmp / "d" / "launches.json").unlink()
            p, base = serve(tmp / "d")
            try:
                bad, _ = hc.check(base, 120)
            finally:
                p.terminate()
                p.wait()
            self.assertTrue(any(b.startswith("feed: launches.json HTTP 404") for b in bad), bad)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
