"""Run the API and Vite together; Ctrl+C stops both."""
import subprocess
import sys
from pathlib import Path
import uvicorn

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))
frontend = subprocess.Popen(['node', str(root / 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], cwd=root)
try:
    uvicorn.run('backend.server:app', host='127.0.0.1', port=8791)
finally:
    frontend.terminate()
    frontend.wait(timeout=10)
