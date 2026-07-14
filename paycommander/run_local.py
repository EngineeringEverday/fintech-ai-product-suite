"""
One-shot launcher: start the FastAPI backend and the Streamlit frontend
together. Press Ctrl-C to terminate both.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main() -> int:
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    api = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "dashboard.api:app",
         "--host", "0.0.0.0", "--port", "8000"],
        cwd=str(ROOT),
        env=env,
    )
    # Give the API a beat to come up
    time.sleep(2.5)

    ui = subprocess.Popen(
        [sys.executable, "-m", "streamlit", "run", "dashboard/app.py",
         "--server.port", "8501",
         "--server.headless", "true",
         "--browser.gatherUsageStats", "false"],
        cwd=str(ROOT),
        env=env,
    )

    print("\nPayCommander running:")
    print("  API   ->  http://localhost:8000")
    print("  UI    ->  http://localhost:8501\n")

    def stop(*_):
        for p in (ui, api):
            try:
                p.terminate()
            except Exception:
                pass
        sys.exit(0)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    ui.wait()
    api.terminate()
    return 0


if __name__ == "__main__":
    sys.exit(main())
