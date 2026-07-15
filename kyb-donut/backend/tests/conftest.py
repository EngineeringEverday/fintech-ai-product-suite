"""Test config: isolated sqlite + mock mode."""
import os
import sys
import tempfile

# Set env BEFORE importing app
_tmp = tempfile.mkdtemp(prefix="kyb_test_")
os.environ.setdefault("MODEL_MODE", "mock")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.db"
os.environ["UPLOAD_DIR"] = _tmp + "/uploads"
os.environ["REDIS_URL"] = "redis://localhost:6379/15"

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
