"""OHLCV REST API for Nana chart web UI."""
from __future__ import annotations

import json
import logging
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

# Backtest results live two levels up in docs/research/
_RESEARCH_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "docs", "research")
)

DB_DSN = os.environ.get(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/crypto_db"
)

_pool: asyncpg.Pool | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(DB_DSN, min_size=1, max_size=4)
    yield
    if _pool:
        await _pool.close()
    _pool = None


app = FastAPI(title="Nana Chart API", lifespan=lifespan)

_CORS_ORIGINS = os.environ.get(
    "CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_methods=["GET"],
    allow_headers=["*"],
)

TF_ORDER = ["1", "5", "15", "30", "60", "240", "D"]


def pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Pool not initialised")
    return _pool


@app.get("/api/meta")
async def meta() -> JSONResponse:
    rows = await pool().fetch(
        "SELECT DISTINCT symbol, interval FROM ohlcv ORDER BY symbol, interval"
    )
    symbols: set[str] = set()
    tfs: set[str] = set()
    for r in rows:
        symbols.add(r["symbol"])
        tfs.add(r["interval"])

    return JSONResponse({
        "symbols": sorted(symbols),
        "timeframes": [t for t in TF_ORDER if t in tfs],
    })


@app.get("/api/ohlcv")
async def ohlcv(
    symbol: str = Query(...),
    interval: str = Query(...),
    from_date: str = Query(..., description="YYYY-MM-DD"),
    to_date: str = Query(..., description="YYYY-MM-DD"),
) -> JSONResponse:
    try:
        from_ts = int(
            datetime.fromisoformat(from_date).replace(tzinfo=timezone.utc).timestamp() * 1000
        )
        to_ts = int(
            datetime.fromisoformat(to_date).replace(tzinfo=timezone.utc).timestamp() * 1000
        ) + 86_400_000
    except ValueError as exc:
        raise HTTPException(400, f"Invalid date: {exc}") from exc

    rows = await pool().fetch(
        """
        SELECT timestamp, open, high, low, close, volume
        FROM ohlcv
        WHERE symbol = $1 AND interval = $2
          AND timestamp >= $3 AND timestamp < $4
        ORDER BY timestamp ASC
        """,
        symbol, interval, from_ts, to_ts,
    )

    candles = [
        {
            "time":   r["timestamp"] // 1000,
            "open":   float(r["open"]),
            "high":   float(r["high"]),
            "low":    float(r["low"]),
            "close":  float(r["close"]),
            "volume": float(r["volume"]),
        }
        for r in rows
    ]

    return JSONResponse({"candles": candles, "count": len(candles)})


@app.get("/api/backtest/list")
async def backtest_list() -> JSONResponse:
    if not os.path.isdir(_RESEARCH_DIR):
        return JSONResponse({"files": []})
    files = []
    for fname in sorted(os.listdir(_RESEARCH_DIR), reverse=True):
        if fname.startswith("backtest_") and fname.endswith(".json"):
            fpath = os.path.join(_RESEARCH_DIR, fname)
            try:
                with open(fpath, encoding="utf-8") as f:
                    meta = json.load(f).get("meta", {})
            except Exception as exc:
                logger.warning("Failed to read backtest meta from %s: %s", fname, exc)
                meta = {}
            files.append({
                "name":     fname,
                "symbol":   meta.get("symbol", ""),
                "interval": meta.get("interval", ""),
                "strategy": meta.get("strategy", ""),
                "trades":   meta.get("trade_count", 0),
                "created":  meta.get("created_at", ""),
            })
    return JSONResponse({"files": files})


@app.get("/api/backtest/result")
async def backtest_result(name: str = Query(...)) -> JSONResponse:
    if not re.match(r"^[\w\-\.]+\.json$", name) or ".." in name:
        raise HTTPException(400, "Invalid filename")
    try:
        resolved = Path(_RESEARCH_DIR, name).resolve()
        research_dir = Path(_RESEARCH_DIR).resolve()
    except OSError:
        raise HTTPException(400, "Invalid path")
    if not resolved.is_relative_to(research_dir):
        raise HTTPException(400, "Invalid path")
    if not resolved.is_file():
        raise HTTPException(404, "Result not found")
    if resolved.stat().st_size > 100 * 1024 * 1024:  # 100 MB hard cap
        raise HTTPException(400, "Result file too large")
    with resolved.open(encoding="utf-8") as f:
        data = json.load(f)
    return JSONResponse(data)
