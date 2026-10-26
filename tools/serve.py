"""Serve Elementarium locally, telling the browser to check for a newer copy of every file
on each load, so an edited script never hides behind an older cached one.

Run from anywhere: python tools/serve.py [port]   (default 8767)
"""
import functools
import http.server
import os
import sys


class NoStaleCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # no-cache still lets the browser keep a copy, but it must ask first (an unchanged file
        # costs a quick 304 reply); without it, files untouched for days are reused unasked
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def main():
    root = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8767
    handler = functools.partial(NoStaleCache, directory=root)
    with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as httpd:
        print(f'Serving Elementarium at http://localhost:{port}', flush=True)
        httpd.serve_forever()


if __name__ == '__main__':
    main()
