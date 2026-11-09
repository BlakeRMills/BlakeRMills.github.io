# Static GET over the site, plus PUT so the generator page can write the PNGs
# it renders straight into the repo. Bound to loopback only.
import http.server, os, sys

ROOT = "/Users/blakerobertmills/Documents/blakerobertmills-site"
OUT  = os.path.join(ROOT, "assets/img/art/hokusai")

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def do_PUT(self):
        name = os.path.basename(self.path)
        if not name.endswith(".png"):
            self.send_error(400, "png only"); return
        n = int(self.headers.get("Content-Length", 0))
        data = self.rfile.read(n)
        with open(os.path.join(OUT, name), "wb") as f:
            f.write(data)
        self.send_response(200); self.send_header("Content-Length","2")
        self.end_headers(); self.wfile.write(b"ok")
        sys.stderr.write("wrote %s (%d bytes)\n" % (name, len(data)))
    def log_message(self, *a): pass

http.server.ThreadingHTTPServer(("127.0.0.1", 4188), H).serve_forever()
