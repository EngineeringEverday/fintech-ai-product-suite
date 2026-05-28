"""FastAPI entry point for the merchant risk scoring API."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app import db
from app.routers import scoring as scoring_router
from app.routers import model as model_router
from app.routers import merchants as merchants_router
from app.routers import dashboard as dashboard_router
from app.services.scoring import bundle

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Seed SQLite from CSV if empty
    db.connect().close()
    try:
        from app.db import seed_from_csv
        seed_from_csv(Path("data/merchants.csv"), limit=2000)
    except Exception as e:
        logging.warning("seed skipped: %s", e)
    # Trigger model load
    bundle()
    yield


app = FastAPI(
    title="Merchant Risk Scoring API",
    description=(
        "Risk = probability of platform financial loss from chargebacks, fraud, "
        "or regulatory violations. Models built for Indian payments platforms."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scoring_router.router)
app.include_router(model_router.router)
app.include_router(merchants_router.router)
app.include_router(dashboard_router.router)


@app.get("/api/health")
def health():
    b = bundle()
    return {
        "status": "ok",
        "model_loaded": b.loaded,
        "model_version": b.version,
    }


# Serve frontend build output if present
FRONTEND_DIST = Path("frontend/dist")
ARTIFACTS_DIR = Path("artifacts")


@app.get("/artifacts/{name}")
def get_artifact(name: str):
    p = ARTIFACTS_DIR / name
    if not p.exists():
        return JSONResponse({"error": "not found"}, status_code=404)
    return FileResponse(str(p))


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
else:
    @app.get("/")
    def root():
        return {
            "name": "Merchant Risk Scoring API",
            "docs": "/docs",
            "frontend": "build the frontend in ./frontend and re-run",
        }
