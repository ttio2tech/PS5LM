#!/usr/bin/env bash
# Serves the game store (ps5/games) on this computer, as the app does on the
# console, for working on the games without a PS5:
#
#   scripts/serve-games.sh                 http://localhost:8083
#   LLAMA_URL=http://127.0.0.1:8080 scripts/serve-games.sh
#
# /v1/chat/completions and /health go on to LLAMA_URL (a llama-server on
# this computer, or the console's: http://<console IP>:8081), so the AI
# games work too. PORT changes the port.
set -euo pipefail

root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
exec python3 - "$root/ps5/games" "${PORT:-8083}" "${LLAMA_URL:-http://127.0.0.1:8080}" <<'PY'
import functools, http.server, sys, urllib.error, urllib.request

root, port, llama = sys.argv[1], int(sys.argv[2]), sys.argv[3].rstrip('/')
PASSED = ('/v1/chat/completions', '/health', '/v1/models')

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def pass_on(self, body=None):
        req = urllib.request.Request(llama + self.path, data=body, method=self.command,
                                     headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                code, data = r.status, r.read()
        except urllib.error.HTTPError as e:
            code, data = e.code, e.read()
        except OSError:
            code, data = 503, b'{"error":{"message":"No model at ' + llama.encode() + b'"}}'
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in PASSED:
            self.pass_on()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path not in PASSED:
            self.send_error(404)
            return
        self.pass_on(self.rfile.read(int(self.headers.get('Content-Length', 0))))

print(f'games: http://localhost:{port} (AI from {llama})')
http.server.ThreadingHTTPServer(('0.0.0.0', port), functools.partial(Handler, directory=root)).serve_forever()
PY
