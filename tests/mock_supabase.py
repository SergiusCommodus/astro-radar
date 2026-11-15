"""A stand in for Astro's Supabase auth server and its profiles table, for tests/signin.cjs: python3 tests/mock_supabase.py [port]

It speaks the endpoints supabase-js 2 calls, as Supabase answers them:
  GET  /auth/v1/authorize?provider=google&redirect_to=...&code_challenge=...&code_challenge_method=s256
       a stand in Google account chooser; picking an account redirects to redirect_to with ?code= (PKCE), or, for a Google address with
       no Astro account, with the error Astro's own sign up rule raises (its handle_new_user trigger needs the 18 and over confirmation)
  POST /auth/v1/token?grant_type=pkce          {auth_code, code_verifier}: the code is exchanged only with the verifier whose SHA 256 is the challenge
  POST /auth/v1/token?grant_type=password      {email, password}
  POST /auth/v1/token?grant_type=refresh_token {refresh_token}
  GET  /auth/v1/user                           Authorization: Bearer <access token>
  POST /auth/v1/logout?scope=local             revokes that session
  GET  /rest/v1/profiles?select=...&id=eq.<id>  row level security as Astro's policy: a signed in user sees their own row; anon sees nothing
plus GET /__mock/log (every request, for assertions) and POST /__mock/reset. Test accounts only; nothing here is real."""
import base64
import hashlib
import json
import secrets
import sys
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

USERS = {
    "ada": {"id": "11111111-1111-4111-8111-111111111111", "email": "ada@example.test", "password": "test passphrase 1",
            "profile": {"display_name": "Ada", "planet": "bands", "color": "#2B62F0", "age_confirmed_at": "2026-10-09T12:00:00Z",
                        "zelle": "not for radar"}},
    "noage": {"id": "22222222-2222-4222-8222-222222222222", "email": "noage@example.test", "password": "test passphrase 2",
              "profile": {"display_name": "Pat", "planet": "glow", "color": "#17905A", "age_confirmed_at": None, "zelle": ""}},
}
GOOGLE = {"ada.google@example.test": "ada"}  # a Google address linked to Ada's Astro account (same verified email in real life)
STATE = {"codes": {}, "tokens": {}, "refresh": {}, "log": []}


def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def jwt(sub):
    now = int(time.time())
    head = b64u(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = b64u(json.dumps({"sub": sub, "role": "authenticated", "aud": "authenticated", "iat": now, "exp": now + 3600}).encode())
    return head + "." + body + "." + b64u(secrets.token_bytes(16))


def session(key):
    u = USERS[key]
    at, rt = jwt(u["id"]), secrets.token_urlsafe(24)
    STATE["tokens"][at] = key
    STATE["refresh"][rt] = key
    return {"access_token": at, "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": rt,
            "user": user_json(key)}


def user_json(key):
    u = USERS[key]
    return {"id": u["id"], "aud": "authenticated", "role": "authenticated", "email": u["email"], "app_metadata": {"provider": "email"},
            "user_metadata": {}, "created_at": "2026-10-09T12:00:00Z"}


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def cors(self):
        o = self.headers.get("Origin")
        if o:
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info, accept, accept-profile, content-profile, prefer, x-supabase-api-version")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "content-range, x-supabase-api-version")

    def send(self, code, obj=None, ctype="application/json", extra=None):
        body = b"" if obj is None else (obj.encode() if isinstance(obj, str) else json.dumps(obj).encode())
        self.send_response(code)
        self.cors()
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        if body:
            self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def who(self):
        a = self.headers.get("Authorization") or ""
        return STATE["tokens"].get(a[7:]) if a.startswith("Bearer ") else None

    def rec(self, body=None):
        u = urllib.parse.urlsplit(self.path)
        STATE["log"].append({"m": self.command, "path": u.path, "q": u.query, "apikey": self.headers.get("apikey"),
                             "auth": bool(self.who()), "accept": self.headers.get("Accept"), "body": body})

    def do_OPTIONS(self):
        self.send(204)

    def do_GET(self):
        u = urllib.parse.urlsplit(self.path)
        q = dict(urllib.parse.parse_qsl(u.query))
        if u.path == "/__mock/log":
            return self.send(200, STATE["log"])
        self.rec()
        if u.path == "/auth/v1/authorize":
            if q.get("provider") != "google" or (q.get("code_challenge_method") or "").lower() != "s256" or not q.get("code_challenge"):
                return self.send(400, {"code": 400, "error_code": "validation_failed", "msg": "PKCE with S256 required"})
            ret = q.get("redirect_to") or ""
            if not ret.endswith("/signin/"):
                return self.send(400, {"code": 400, "msg": "redirect_to is not in the allow list"})  # the dashboard's allow list
            pick = lambda who: "/__mock/google/pick?" + urllib.parse.urlencode({"who": who, "ret": ret, "ch": q["code_challenge"]})
            page = ('<!doctype html><meta charset="utf-8"><title>Choose an account</title><body style="font:16px system-ui;background:#fff;color:#202124;padding:40px">'
                    '<h1 style="font-weight:400">Choose an account</h1><p>to continue to Astro (test stand in for Google)</p>'
                    f'<p><a id="g-ada" href="{pick("ada.google@example.test")}">Ada · ada.google@example.test</a></p>'
                    f'<p><a id="g-new" href="{pick("newcomer@example.test")}">Newcomer · newcomer@example.test</a></p>'
                    f'<p><a id="g-cancel" href="{ret}?error=access_denied&amp;error_description=The+user+cancelled">Cancel</a></p></body>')
            return self.send(200, page, "text/html; charset=utf-8")
        if u.path == "/__mock/google/pick":
            key = GOOGLE.get(q.get("who"))
            if not key:  # Astro's handle_new_user raises: sign up needs the 18 and over confirmation, which Google cannot give
                loc = q["ret"] + "?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user"
            else:
                code = secrets.token_urlsafe(16)
                STATE["codes"][code] = (key, q["ch"], time.time())
                loc = q["ret"] + "?code=" + code
            self.send_response(302)
            self.send_header("Location", loc)
            self.end_headers()
            return
        if u.path == "/auth/v1/user":
            k = self.who()
            return self.send(200, user_json(k)) if k else self.send(401, {"code": 401, "error_code": "bad_jwt", "msg": "invalid JWT: unable to parse or verify signature"})
        if u.path == "/rest/v1/profiles":
            k = self.who()
            want = q.get("id", "")
            cols = [c for c in (q.get("select") or "*").split(",") if c]
            rows = []
            for key, us in USERS.items():
                if k == key and want == "eq." + us["id"]:  # Astro's policy: id = auth.uid() (groups and friends do not apply here)
                    rows.append({c: us["profile"].get(c) for c in cols} if cols != ["*"] else dict(us["profile"]))
            if "vnd.pgrst.object" in (self.headers.get("Accept") or ""):
                if len(rows) != 1:
                    return self.send(406, {"code": "PGRST116", "details": f"The result contains {len(rows)} rows", "hint": None,
                                           "message": "JSON object requested, multiple (or no) rows returned"})
                return self.send(200, rows[0])
            return self.send(200, rows, extra={"Content-Range": f"0-{max(len(rows) - 1, 0)}/*"})
        return self.send(404, {"msg": "not found"})

    def do_POST(self):
        u = urllib.parse.urlsplit(self.path)
        q = dict(urllib.parse.parse_qsl(u.query))
        n = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(n) if n else b""
        try:
            body = json.loads(raw or b"{}")
        except ValueError:
            body = {}
        if u.path == "/__mock/reset":
            STATE.update(codes={}, tokens={}, refresh={}, log=[])
            return self.send(204)
        self.rec({k: ("***" if k in ("password", "code_verifier", "refresh_token") else v) for k, v in body.items()})
        if u.path == "/auth/v1/token":
            g = q.get("grant_type")
            if g == "pkce":
                c = STATE["codes"].pop(body.get("auth_code"), None)
                if not c or time.time() - c[2] > 600:
                    return self.send(404, {"code": 404, "error_code": "flow_state_not_found", "msg": "invalid flow state, no valid flow state found"})
                if b64u(hashlib.sha256((body.get("code_verifier") or "").encode()).digest()) != c[1]:
                    return self.send(400, {"code": 400, "error_code": "bad_code_verifier", "msg": "code challenge does not match previously saved code verifier"})
                return self.send(200, session(c[0]))
            if g == "password":
                for key, us in USERS.items():
                    if us["email"] == (body.get("email") or "").lower() and us["password"] == body.get("password"):
                        return self.send(200, session(key))
                return self.send(400, {"code": 400, "error_code": "invalid_credentials", "msg": "Invalid login credentials"})
            if g == "refresh_token":
                k = STATE["refresh"].pop(body.get("refresh_token"), None)
                return self.send(200, session(k)) if k else self.send(400, {"code": 400, "error_code": "refresh_token_not_found", "msg": "Invalid Refresh Token: Refresh Token Not Found"})
            return self.send(400, {"msg": "unsupported grant_type"})
        if u.path == "/auth/v1/logout":
            a = (self.headers.get("Authorization") or "")[7:]
            k = STATE["tokens"].pop(a, None)
            for rt in [r for r, kk in STATE["refresh"].items() if kk == k]:
                STATE["refresh"].pop(rt)
            return self.send(204)
        return self.send(404, {"msg": "not found"})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8302
    print(f"mock supabase on http://127.0.0.1:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
