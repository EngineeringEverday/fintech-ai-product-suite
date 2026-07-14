"""
Published-site launcher for PayCommander.

The pplx.app runtime serves backend ports behind a path prefix such as
`/port/8501/`. The proxy strips that prefix before the request reaches
Streamlit, so Streamlit should still serve from its normal root path.
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
    env.setdefault("PAYCOMMANDER_API", "http://127.0.0.1:8000")

    api = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "dashboard.api:app",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
        ],
        cwd=str(ROOT),
        env=env,
    )
    time.sleep(2.5)

    ui = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "streamlit",
            "run",
            "dashboard/app.py",
            "--server.address",
            "0.0.0.0",
            "--server.port",
            "8501",
            "--server.headless",
            "true",
            "--server.enableCORS",
            "false",
            "--server.enableXsrfProtection",
            "false",
            "--browser.gatherUsageStats",
            "false",
        ],
        cwd=str(ROOT),
        env=env,
    )

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
