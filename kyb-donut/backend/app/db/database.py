"""SQLite + SQLAlchemy bootstrapping."""
from __future__ import annotations

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.core.config import settings

# Ensure sqlite file directory exists when using file URL
if settings.DATABASE_URL.startswith("sqlite"):
    # sqlite:///path -> path; sqlite:////abs -> /abs
    raw = settings.DATABASE_URL.replace("sqlite:///", "", 1)
    db_path = raw if raw.startswith("/") else os.path.abspath(raw)
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {},
    future=True,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app.db import models  # noqa: F401  ensure models import
    Base.metadata.create_all(bind=engine)
