"""Sign in (auth.py, signin_page.py, src/account.js, src/signin.js): python3 -m unittest tests.test_signin
The switch and its checks, that no secret key is anywhere in the repository, that the Privacy page names every key the sign in code keeps
and the one outside host it talks to, and the built site in whichever state it was built (off: nothing of sign in at all; on: the page,
the control on every page, every policy). tests/signin.cjs runs the flow end to end against tests/mock_supabase.py."""
import base64
import json
import pathlib
import re
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
import sys
sys.path.insert(0, str(ROOT))
import auth  # noqa: E402
import info_pages  # noqa: E402


def jwt(role):
    p = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b"=").decode()
    return p({"alg": "HS256", "typ": "JWT"}) + "." + p({"iss": "supabase", "ref": "x" * 20, "role": role}) + ".c2ln"


class Switch(unittest.TestCase):
    def test_off_unless_asked(self):
        cfg = json.loads((ROOT / "data/config.json").read_text(encoding="utf-8"))
        self.assertFalse(cfg["auth"]["on"], "sign in must stay off in the repository until the setup in docs/SIGNIN-SETUP.md is done")
        self.assertIsNone(auth.load(cfg, env={}))
        self.assertIsNone(auth.load({}, env={}))
        self.assertIsNone(auth.load(cfg, env={"AUTH": "off"}))

    def test_on_with_the_repository_values(self):
        cfg = json.loads((ROOT / "data/config.json").read_text(encoding="utf-8"))
        a = auth.load(cfg, env={"AUTH": "on"})
        self.assertEqual(a["origin"], "https://vxalwjzvlxtdcjcjvlqp.supabase.co")
        self.assertTrue(a["key"].startswith("sb_publishable_"))

    def test_secret_keys_are_refused(self):
        for k in ("sb_" + "secret_abcdefghijklmnop", jwt("service_role")):
            with self.assertRaises(auth.AuthConfigError):
                auth.check_key(k)
            with self.assertRaises(auth.AuthConfigError):
                auth.load({"auth": {"on": True, "url": "https://abcdefghijklmnopqrst.supabase.co", "key": k}}, env={})

    def test_publishable_keys_pass(self):
        self.assertEqual(auth.check_key("sb_publishable_qpggnWWZU0S-xgyZhNKZ1Q_swxjrvDB"), "sb_publishable_qpggnWWZU0S-xgyZhNKZ1Q_swxjrvDB")
        self.assertEqual(auth.check_key(jwt("anon")), jwt("anon"))
        for bad in ("", "hello", jwt("authenticated")):
            with self.assertRaises(auth.AuthConfigError):
                auth.check_key(bad)

    def test_urls(self):
        self.assertEqual(auth.check_url("https://vxalwjzvlxtdcjcjvlqp.supabase.co/"), "https://vxalwjzvlxtdcjcjvlqp.supabase.co")
        self.assertEqual(auth.check_url("http://127.0.0.1:8302"), "http://127.0.0.1:8302")
        for bad in ("http://vxalwjzvlxtdcjcjvlqp.supabase.co", "https://evil.example", "https://vxalwjzvlxtdcjcjvlqp.supabase.co.evil.example", ""):
            with self.assertRaises(auth.AuthConfigError):
                auth.check_url(bad)


class NoSecrets(unittest.TestCase):
    def test_no_secret_key_in_the_repository(self):
        files = subprocess.run(["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
        files += [str(p.relative_to(ROOT)) for p in (ROOT / "tests").glob("*.py")] + ["data/config.json", "auth.py"]
        bad = []
        for f in set(files):
            p = ROOT / f
            if not p.is_file() or p.stat().st_size > 3_000_000 or p.suffix in (".png", ".jpg", ".webp", ".avif", ".woff2", ".mp4", ".webm", ".ico"):
                continue
            t = p.read_text(encoding="utf-8", errors="ignore")
            for m in re.finditer(r"sb_secret_[A-Za-z0-9_\-]{8,}|eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}", t):
                if m.group(0).startswith("sb_secret_") or auth._jwt_role(m.group(0)) == "service_role":
                    bad.append(f)
        self.assertEqual(bad, [], "a secret Supabase key is in the repository")


class TrueToTheCode(unittest.TestCase):
    def test_kept_keys_are_the_ones_the_privacy_page_lists(self):
        js = (ROOT / "src/account.js").read_text(encoding="utf-8") + (ROOT / "src/signin.js").read_text(encoding="utf-8")
        self.assertIn("STORE = 'radar.auth'", js)
        self.assertIn("NEXT = 'radar.next'", js)
        written = set(re.findall(r"(?:localStorage|sessionStorage)\.setItem\(\s*'([^']+)'", js))
        self.assertEqual(written, set(), "account.js or signin.js now writes a key of its own: name it on the Privacy page and here")
        for k in ("radar.auth", "one time check value", "radar.next"):
            self.assertIn(k, info_pages.ACCOUNT)

    def test_only_this_site_and_the_auth_server(self):
        js = (ROOT / "src/account.js").read_text(encoding="utf-8") + (ROOT / "src/signin.js").read_text(encoding="utf-8")
        self.assertEqual(set(re.findall(r"fetch\('([^']+)'", js)), {"/launches.json"})
        self.assertEqual(set(re.findall(r"https?://[a-z0-9.\-]+", js)) - {"http://www.w3.org"}, {"https://astrosocial.io"}, "a new outside host")
        self.assertNotIn("document.cookie", js)
        self.assertNotIn("innerHTML", js, "text from the account goes in with textContent only")

    def test_pkce_and_no_url_sessions(self):
        js = (ROOT / "src/account.js").read_text(encoding="utf-8")
        self.assertIn("flowType: 'pkce'", js)
        self.assertIn("detectSessionInUrl: false", js)
        self.assertIn("scope: 'local'", js)

    def test_no_hyphens_in_copy(self):
        for f in ("src/account.js", "src/signin.js"):
            t = (ROOT / f).read_text(encoding="utf-8")
            for s in re.findall(r"(?:textContent = |say\()'([^']+)'", t) + re.findall(r"return '([A-Z][^']+)'", t):
                self.assertNotRegex(s, r"[A-Za-z]-[A-Za-z]", f"{f}: {s}")


@unittest.skipUnless((DIST / "index.html").exists(), "build first")
class Built(unittest.TestCase):
    def pages(self):
        return [p for p in DIST.rglob("*.html") if p.name != "artifact.html" and "content-security-policy" in p.read_text(encoding="utf-8").lower()]

    def test_built_state(self):
        on = (DIST / "signin/index.html").exists()
        main = (DIST / "index.html").read_text(encoding="utf-8")
        art = (DIST / "artifact.html").read_text(encoding="utf-8") if (DIST / "artifact.html").exists() else ""
        self.assertNotIn('id="acct"', art, "the artifact never carries sign in")
        if not on:
            self.assertFalse((DIST / "account.js").exists() or (DIST / "signin.js").exists() or (DIST / "vendor/supabase.js").exists())
            for p in self.pages():
                t = p.read_text(encoding="utf-8")
                self.assertNotIn('id="acct"', t, p)
                self.assertNotIn("supabase", t.lower(), p)
            self.assertIn("no accounts, no sign in", (DIST / "privacy/index.html").read_text(encoding="utf-8"))
            return
        s = (DIST / "signin/index.html").read_text(encoding="utf-8")
        url = re.search(r'id="authcfg" data-sb="([^"]+)" data-key="([^"]+)"', s)
        self.assertIsNotNone(url)
        origin, key = url.group(1), url.group(2)
        auth.check_key(key)
        self.assertIn('<meta name="robots" content="noindex">', s)
        self.assertNotRegex(s, r"<script>", "the sign in page has no inline script")
        self.assertIn("script-src 'self';", s)
        self.assertNotIn("/signin/", (DIST / "sitemap.xml").read_text(encoding="utf-8"))
        for p in self.pages():
            t = p.read_text(encoding="utf-8")
            c = re.search(r"connect-src ([^;\"]*)", t)
            self.assertTrue(c and origin in c.group(1).split(), f"{p}: the policy does not let it reach {origin}")
            self.assertNotIn("sb_secret_", t)
            if p.parent.name != "signin" and p.name == "index.html" and 'class="top"' in t + main:
                self.assertTrue('id="acct"' in t or p.parent.name in ("signin",), p)
        self.assertIn('id="acct"', main)
        self.assertTrue((DIST / "vendor/supabase.js").exists() and (DIST / "account.js").exists() and (DIST / "signin.js").exists())
        self.assertIn('id="account"', (DIST / "privacy/index.html").read_text(encoding="utf-8"))
        sw = (DIST / "sw.js").read_text(encoding="utf-8")
        self.assertNotIn("signin", sw, "the sign in page is never kept offline")


if __name__ == "__main__":
    unittest.main()
