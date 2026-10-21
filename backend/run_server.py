import os
import sys

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import uvicorn

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    host = "127.0.0.1"

    current_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(current_dir)
    database_dir = os.path.join(root_dir, "database")

    for p in (root_dir, current_dir, database_dir):
        if p not in sys.path:
            sys.path.insert(0, p)

    print("============================================================")
    print(" Evalio Online Examination System - Backend & Web Server")
    print(" Folders: frontend/ | backend/ | database/")
    print(f" Running at: http://{host}:{port}/")
    print(f" REST API at: http://{host}:{port}/api/")
    print(" Database: database/evalio.db")
    print(" Demo Accounts:")
    print("  - Student:       21CS1047 / student123")
    print("  - Administrator: admin@evalio.edu / admin123")
    print("============================================================")

    uvicorn.run("backend.main:app", host=host, port=port, reload=False)
