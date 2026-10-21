"""Local dev server for the Evalio frontend.

Same as `python -m http.server`, but tells the browser not to cache pages,
so edits show up on a normal refresh.

Usage:  python serve.py            (serves ./frontend on http://localhost:5500)
"""
import functools
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    with http.server.ThreadingHTTPServer(("", PORT), handler) as httpd:
        print(f"Evalio running at http://localhost:{PORT}/  (Ctrl+C to stop)")
        httpd.serve_forever()
