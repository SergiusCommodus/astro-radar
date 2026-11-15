"""Sign in with an Astro account (docs/SIGNIN-SETUP.md): the one switch, the checks on its values, and the pieces every page shares.

Astro Radar works fully without an account. Sign in is off unless data/config.json has "auth": {"on": true, ...} or the deploy sets
AUTH=on; SUPABASE_URL and SUPABASE_KEY override the URL and key. Off, the build writes no /signin/ page, no account control, no
script and no new origin in any security policy, so the site is exactly what it was.

Only a publishable key may be used (sb_publishable_..., or a legacy anon JWT): it identifies the project and is meant to be public;
what it can read is decided by row level security in Astro's database. A secret key (sb_secret_..., or a service_role JWT) bypasses
row level security, so the build refuses it outright and never writes it anywhere."""
import base64
import html
import json
import os
import re

ASTRO = "https://astrosocial.io"
STORE = "radar.auth"  # the localStorage key supabase-js keeps the session under (and STORE + "-code-verifier" during a Google round trip)


class AuthConfigError(ValueError):
    pass


def _jwt_role(key):
    try:
        part = key.split(".")[1]
        return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))).get("role")
    except (IndexError, ValueError, AttributeError):
        return None


def check_key(key):
    """the key, if it is a publishable one; AuthConfigError for a secret key or anything else"""
    key = (key or "").strip()
    if key.startswith("sb_secret_") or _jwt_role(key) == "service_role":
        raise AuthConfigError("SUPABASE_KEY is a secret key: it bypasses row level security and must never be in the site. Use the publishable key.")
    if re.fullmatch(r"sb_publishable_[A-Za-z0-9_\-]{10,}", key) or _jwt_role(key) == "anon":
        return key
    raise AuthConfigError("SUPABASE_KEY must be the project's publishable key (sb_publishable_...) or its legacy anon key")


def check_url(url):
    url = (url or "").strip().rstrip("/")
    if re.fullmatch(r"https://[a-z0-9]{20}\.supabase\.co", url) or re.fullmatch(r"http://(127\.0\.0\.1|localhost):\d{2,5}", url):
        return url
    raise AuthConfigError(f"SUPABASE_URL {url!r} must be https://<project ref>.supabase.co (or a local mock for tests)")


def load(cfg, env=os.environ):
    """{"url", "key", "origin"} when sign in is on, else None. A bad value with sign in on stops the build: half a sign in is worse than none."""
    a = (cfg or {}).get("auth") or {}
    on = str(env.get("AUTH") or "").strip().lower()
    on = (on in ("on", "1", "true", "yes")) if on else bool(a.get("on"))
    if not on:
        return None
    url = check_url(env.get("SUPABASE_URL") or a.get("url"))
    key = check_key(env.get("SUPABASE_KEY") or a.get("key"))
    return {"url": url, "key": key, "origin": url}


def slot(auth, signin_href="/signin/"):
    """The account control in a header: a Sign in link until account.js finds a session. Fixed width, so the swap moves nothing."""
    if not auth:
        return ""
    e = html.escape
    return (f'<div class="acct" id="acct" data-sb="{e(auth["url"])}" data-key="{e(auth["key"])}">'
            f'<a class="acct-in" href="{signin_href}">Sign in</a></div>')


# Shared by launch.css and the main page's style block. Colors are the palette's tokens (with launch.css's own value after the comma), so
# tests/palette.cjs passes; the planet is an SVG with fill attributes, not a background.
CSS = """
.acct{position:relative;display:flex;justify-content:flex-end;align-items:center;width:150px;flex:0 0 auto}
.acct-in{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 14px;border-radius:999px;color:var(--fg,#EEF2FF);text-decoration:none;font-size:15px;font-weight:600;box-shadow:inset 0 0 0 1px var(--line-c,rgba(150,175,255,.22))}
.acct-in:hover,.acct-in:focus-visible{box-shadow:inset 0 0 0 1px var(--cool,#8DB4FF)}
.acct-m summary{display:flex;align-items:center;gap:8px;min-height:44px;max-width:150px;padding:0 10px 0 4px;border-radius:999px;cursor:pointer;list-style:none;color:var(--fg,#EEF2FF);font-size:15px;font-weight:600}
.acct-m summary::-webkit-details-marker{display:none}.acct-m summary:hover,.acct-m[open] summary{box-shadow:inset 0 0 0 1px var(--line-c,rgba(150,175,255,.22))}
.acct-m summary svg{flex:0 0 auto}.acct-n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.acct-p{position:absolute;right:0;top:calc(100% + 6px);z-index:30;min-width:220px;display:grid;padding:6px;border-radius:12px;background:var(--surface-2,#0B1228);box-shadow:0 12px 32px rgba(0,0,0,.5),inset 0 0 0 1px rgba(150,175,255,.14)}
.acct-p a,.acct-p button{display:flex;align-items:center;min-height:44px;padding:0 12px;border:0;border-radius:8px;background:transparent;color:var(--fg,#EEF2FF);font:inherit;font-size:15px;text-align:left;text-decoration:none;cursor:pointer}
.acct-p a:hover,.acct-p button:hover,.acct-p a:focus-visible,.acct-p button:focus-visible{background:rgba(124,152,255,.10)}
.acct-p .acct-who{padding:8px 12px 10px;color:var(--fg-2,#A9B2D0);font-size:14px;line-height:1.4}
@media (max-width:640px){.acct{width:64px}.acct-in{padding:0 10px;font-size:14px}.acct-m summary{padding:0 4px}.acct-m summary .acct-n{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}}
@media (max-width:440px){.nav-links a[href="live/"],.nav-links a[href="news/"]{display:none!important}.nmore .nm-ph{display:flex!important}}
"""
