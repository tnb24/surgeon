"""Download and validate the pinned GPT-2 snapshot before starting offline."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.runtime import Runtime
r = Runtime()
r.load()
if r.error:
    raise RuntimeError(r.error)
print(f'GPT-2 ready on {r.device}; loaded in {r.load_seconds:.2f}s', flush=True)
