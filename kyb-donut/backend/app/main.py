"""FastAPI app entrypoint."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as api_router
from app.core.config import settings
from app.db.database import init_db

logging.basicConfig(level=settings.LOG_LEVEL)


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    init_db()
    yield


app = FastAPI(
    title="KYB Donut",
    version="0.1.0",
    description="Document-understanding for Indian fintech merchant onboarding (Donut + validation).",
    lifespan=lifespan,
)
# Ensure tables exist at import-time too, so test clients that bypass lifespan still work.
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
def root():
    return {"service": "kyb-donut", "docs": "/docs", "health": "/api/health"}
