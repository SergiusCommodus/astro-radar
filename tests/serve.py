"""Serve a folder the way GitHub Pages does: index.html for a folder, and 404.html (with status 404) for anything missing.

Usage: python3 tests/serve.py dist 8123   (the smoke test starts it itself)
"""
import functools, http.server, os, sys

root, port = sys.argv[1], int(sys.argv[2])


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".webmanifest": "application/manifest+json", ".ics": "text/calendar", ".js": "text/javascript", ".webp": "image/webp"}

    def log_message(self, *args):
        pass

    def send_error(self, code, message=None, explain=None):
        page = os.path.join(root, "404.html")
        if code == 404 and os.path.exists(page):
            body = open(page, "rb").read()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
        else:
            super().send_error(code, message, explain)


http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=root)).serve_forever()
