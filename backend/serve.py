"""Dev server launcher inside backend/ directory."""
import os
import sys

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    current_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(current_dir)
    database_dir = os.path.join(root_dir, "database")

    for p in (root_dir, current_dir, database_dir):
        if p not in sys.path:
            sys.path.insert(0, p)

    try:
        import uvicorn
        from backend.main import app
        print(f"Evalio unified server starting on http://localhost:{port}/")
        print("Folders active: frontend/ | backend/ | database/")
        uvicorn.run("backend.main:app", host="127.0.0.1", port=port, reload=False)
    except Exception as e:
        print(f"FastAPI startup failed ({e}), falling back to SimpleHTTPRequestHandler...")
        import functools
        import http.server
        ROOT = os.path.join(root_dir, "frontend")
        class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
            def end_headers(self):
                self.send_header("Cache-Control", "no-store")
                super().end_headers()
        handler = functools.partial(NoCacheHandler, directory=ROOT)
        with http.server.ThreadingHTTPServer(("", port), handler) as httpd:
            print(f"Evalio static running at http://localhost:{port}/ (Ctrl+C to stop)")
            httpd.serve_forever()
