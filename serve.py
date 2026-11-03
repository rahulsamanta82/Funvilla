#!/usr/bin/env python3
"""Local static server for Funvilla that never exposes secrets or server code."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
BLOCKED_TOP_LEVEL = {"server", ".git", "node_modules"}


class FunvillaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        parts = [part for part in path.split("/") if part]
        if (
            any(part.startswith(".") for part in parts)
            or (parts and parts[0] in BLOCKED_TOP_LEVEL)
        ):
            self.send_error(404)
            return
        super().do_GET()

    def do_HEAD(self):
        path = unquote(urlparse(self.path).path)
        parts = [part for part in path.split("/") if part]
        if (
            any(part.startswith(".") for part in parts)
            or (parts and parts[0] in BLOCKED_TOP_LEVEL)
        ):
            self.send_error(404)
            return
        super().do_HEAD()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 5501), FunvillaHandler)
    print("Funvilla frontend running at http://localhost:5501")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
