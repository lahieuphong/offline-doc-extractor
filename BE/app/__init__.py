"""Application package.

Keep this package initializer lightweight.  Import the FastAPI object with
``from app.main import app`` or run ``uvicorn app.main:app``.  Avoid importing
``app.main`` here so unit tests for the deterministic extractor do not require
Redis/RQ to be installed.
"""

__all__ = []
