"""Every link on the built site leads somewhere: python3 -m unittest tests.test_links   (after a build with a feed)

  links       every href and src on every built page that points inside the site (relative, root relative or https://astroradar.io/)
              names a file the build wrote (a folder means its index.html; a #fragment on another page names an id there)
  sitemap     every URL in sitemap.xml was built, and every page that can be indexed (no noindex) is in it
  titles      no two indexable pages share a title or a description
"""
import html
import pathlib
import re
import unittest
from urllib.parse import urljoin, urlsplit

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
SITE = "https://astroradar.io/"
ATTR = re.compile(r'\s(?:href|src)="([^"]+)"')
SRCSET = re.compile(r'\ssrcset="([^"]+)"')


def pages():
    return sorted(p for p in DIST.rglob("*.html") if "node_modules" not in p.parts)


def url_of(p):
    rel = p.relative_to(DIST).as_posix()
    return SITE + (rel[: -len("index.html")] if rel.endswith("index.html") else rel)


def target(u):
    """the file a site URL names, or None when it is not inside the site"""
    s = urlsplit(u)
    if s.scheme and not u.startswith(SITE):
        return None
    path = s.path[len(urlsplit(SITE).path):] if u.startswith(SITE) else s.path.lstrip("/")
    f = DIST / path
    if path == "" or path.endswith("/"):
        f = f / "index.html"
    return f, s.fragment


@unittest.skipUnless((DIST / "index.html").exists() and (DIST / "launch").exists(), "after a build with a feed")
class Links(unittest.TestCase):
    def test_every_link(self):
        bad, ids = [], {}
        for p in pages():
            if p.name == "artifact.html":
                continue  # the artifact carries everything inline and is not served
            h = p.read_text(encoding="utf-8")
            base = url_of(p)
            refs = [html.unescape(m) for m in ATTR.findall(h)]
            for ss in SRCSET.findall(h):
                refs += [x.strip().split(" ")[0] for x in ss.split(",") if x.strip()]
            for r in refs:
                if r.startswith(("mailto:", "tel:", "data:", "javascript:", "blob:")) or r.startswith("#"):
                    continue
                u = urljoin(base, r)
                t = target(u)
                if not t:
                    continue
                f, frag = t
                if "__" in r:
                    bad.append(f"{p.relative_to(DIST)}: placeholder {r}")
                    continue
                if not f.exists():
                    bad.append(f"{p.relative_to(DIST)}: {r}")
                elif frag and f.suffix == ".html":
                    if f not in ids:
                        ids[f] = set(re.findall(r'\sid="([^"]+)"', f.read_text(encoding="utf-8")))
                    if frag not in ids[f]:
                        bad.append(f"{p.relative_to(DIST)}: {r} (no #{frag} there)")
        self.assertEqual(bad[:30], [], f"{len(bad)} broken links")

    def test_sitemap(self):
        sm = (DIST / "sitemap.xml").read_text(encoding="utf-8")
        urls = re.findall(r"<loc>([^<]+)</loc>", sm)
        self.assertEqual(len(urls), len(set(urls)), "a URL twice in the sitemap")
        missing = [u for u in urls if not target(u)[0].exists()]
        self.assertEqual(missing, [])
        index = []
        for p in pages():
            if p.name != "index.html" or p.parent == DIST / "launch" or p.parent.name in ("signin",):
                continue
            h = p.read_text(encoding="utf-8")
            if 'name="robots" content="noindex' in h or 'http-equiv="refresh"' in h:
                continue
            index.append(url_of(p))
        self.assertEqual(sorted(set(index) - set(urls)), [], "indexable pages missing from the sitemap")

    def test_no_markup_in_text(self):
        """what a page shows never carries structured data or a build placeholder (a schema.org value once leaked into a launch page's
        status line)"""
        bad = []
        for p in pages():
            h = p.read_text(encoding="utf-8")
            t = re.sub(r"<(script|style|template)[^>]*>.*?</\1>", " ", h, flags=re.S | re.I)
            t = re.sub(r"<[^>]+>", " ", t)
            for m in re.findall(r"schema\.org|__[A-Z]{3,}__", t):
                bad.append(f"{p.relative_to(DIST)}: {m}")
        self.assertEqual(bad[:20], [])

    def test_titles_unique(self):
        seen, dup = {}, []
        for p in pages():
            if p.name != "index.html":
                continue
            h = p.read_text(encoding="utf-8")
            if 'content="noindex' in h or 'http-equiv="refresh"' in h:
                continue
            t = re.search(r"<title>(.*?)</title>", h, re.S)
            d = re.search(r'<meta name="description" content="([^"]*)"', h)
            for kind, v in (("title", t and t.group(1).strip()), ("description", d and d.group(1).strip())):
                if not v:
                    dup.append(f"{p.relative_to(DIST)}: no {kind}")
                    continue
                k = (kind, v)
                if k in seen:
                    dup.append(f"{kind} of {p.relative_to(DIST)} is the same as {seen[k]}'s: {v[:60]}")
                seen[k] = p.relative_to(DIST)
        self.assertEqual(dup, [])


if __name__ == "__main__":
    unittest.main()
