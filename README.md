# Nana Chart UI

TradingView-style charting web app for visualizing crypto OHLCV data and backtest results.

Built as the frontend for the [Nana](https://github.com/grymik09/nana) backtesting platform — but works with any PostgreSQL database that has an `ohlcv` table.

![chart preview](docs/preview.png)

## Features

- **Candlestick charts** powered by LightweightCharts v5 with synced volume pane
- **Session bands** — Sydney, Asia, London, New York (UTC-accurate on all timeframes)
- **Fair Value Gaps** (FVG+/FVG−) with fill detection
- **Drawing tools** — trend lines, rays, horizontal lines, Fibonacci retracements, supply/demand zones, R:R calculator
- **Bar replay** — step through history manually, place long/short trades with SL/TP, track P&L
- **Backtest overlay** — load JSON results from the Nana engine: trades on chart, per-indicator panes (oscillators get their own synced sub-chart, price-scale indicators overlay the main chart)
- All panes (price / volume / oscillators) scroll and zoom in sync

## Stack

| Layer    | Tech                                              |
|----------|---------------------------------------------------|
| Frontend | Next.js 15, TypeScript, Tailwind CSS, LightweightCharts v5 |
| Backend  | FastAPI, asyncpg, Python 3.13                     |
| Database | PostgreSQL                                        |

## Project structure

```
web_ui/
├── frontend/          # Next.js app
│   ├── app/           # page.tsx (main route)
│   ├── components/    # Chart, BacktestPanel, Toolbar, ReplayBar, StatsPanel
│   └── lib/           # sessions, fvg, trades, drawings helpers
└── backend/           # FastAPI REST API
    └── main.py        # /api/meta  /api/ohlcv  /api/backtest/*
```

## Prerequisites

- **Node.js** 18+
- **Python** 3.13+ with [uv](https://docs.astral.sh/uv/)
- **PostgreSQL** with an `ohlcv` table (see schema below)

### Minimum DB schema

```sql
CREATE TABLE ohlcv (
    symbol   TEXT    NOT NULL,
    interval TEXT    NOT NULL,
    timestamp BIGINT NOT NULL,   -- Unix ms
    open     NUMERIC NOT NULL,
    high     NUMERIC NOT NULL,
    low      NUMERIC NOT NULL,
    close    NUMERIC NOT NULL,
    volume   NUMERIC NOT NULL,
    PRIMARY KEY (symbol, interval, timestamp)
);
```

## Setup

### 1. Backend

```bash
cd backend
cp .env.example .env        # edit DATABASE_URL
uv sync
uv run uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
cp .env.local.example .env.local   # edit NEXT_PUBLIC_API_URL if backend is not on :8000
npm install
npm run dev
```

Open **http://localhost:3000**

## Backtest integration

The backend serves JSON files from `../docs/research/` that match `backtest_*.json`.

Expected shape:

```json
{
  "meta":    { "symbol": "BTCUSDT", "interval": "60", "strategy": "my_strat", "trade_count": 123 },
  "metrics": { "winrate": 54.2, "profit_factor": 1.8, "compound_pnl": 34.1, "max_drawdown": 12.3, "sharpe_ratio": 1.4 },
  "trades":  [{ "id": "...", "dir": "long", "entryTime": 1700000000, "entryPrice": 43000, "sl": 42000, "tp": 45000, "exitTime": 1700003600, "exitPrice": 45000, "exitReason": "tp" }],
  "indicators": { "vwap": [{ "time": 1700000000, "value": 43100 }], "rsi": [...] }
}
```

## Environment variables

### Frontend (`frontend/.env.local`)

| Variable              | Default                    | Description              |
|-----------------------|----------------------------|--------------------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000`    | Backend base URL         |

### Backend (`backend/.env`)

| Variable       | Default                                                | Description              |
|----------------|--------------------------------------------------------|--------------------------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/crypto_db` | PostgreSQL DSN        |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000`          | Comma-separated origins  |

## License

MIT — see [LICENSE](LICENSE)
