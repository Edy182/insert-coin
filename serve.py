#!/usr/bin/env python3
"""Local dev server for Clawd Bytes that disables browser caching.

The default `python -m http.server` lets browsers cache HTML aggressively, so
edits to index.html / game HTMLs do not show up without a hard refresh. This
wrapper sends Cache-Control: no-store on every response so refresh just works.

Usage:
  python serve.py            # serves on :8000
  python serve.py 8080       # serves on :8080
"""
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = HTTPServer(("", port), NoCacheHandler)
    print(f"Clawd Bytes dev server: http://localhost:{port}/")
    print("Cache disabled. Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nbye")


if __name__ == "__main__":
    main()
