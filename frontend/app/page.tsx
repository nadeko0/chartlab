"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import Toolbar from "@/components/Toolbar";
import ReplayBar from "@/components/ReplayBar";
import StatsPanel from "@/components/StatsPanel";
import BacktestPanel, { type BacktestResult } from "@/components/BacktestPanel";
import { detectFVGs, type FVG } from "@/lib/fvg";
import { calcStats, type Trade } from "@/lib/trades";
import type { DrawingType, Drawing } from "@/lib/drawings";
import type { Candle, IndicatorSeries } from "@/components/Chart";

const Chart = dynamic(() => import("@/components/Chart"), { ssr: false });

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const TF_LABELS: Record<string, string> = {
  "1": "1m", "5": "5m", "15": "15m", "30": "30m",
  "60": "1h", "240": "4h", "D": "1D",
};

const MENU_COLORS = [
  "#2196f3", "#e53935", "#43a047", "#fb8c00",
  "#9c27b0", "#00bcd4", "#ffffff", "#ffeb3b",
];

interface ContextMenu { id: string; x: number; y: number; color: string }

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }

function ToggleBtn({ active, label, onClick, title }: {
  active: boolean; label: string; onClick: () => void; title?: string;
}) {
  return (
    <button onClick={onClick} title={title}
      className={["h-7 px-3 text-xs rounded border font-medium transition-colors",
        active ? "border-[#2962ff] text-[#2962ff]" : "border-[#363a45] text-[#787b86]",
      ].join(" ")}>
      {label}
    </button>
  );
}

export default function HomePage() {
  const [symbols,    setSymbols]    = useState<string[]>([]);
  const [timeframes, setTimeframes] = useState<string[]>([]);
  const [symbol,     setSymbol]     = useState("BTCUSDT");
  const [interval,   setInterval]   = useState("60");

  const defaultDates = useRef<{ from: string; to: string } | null>(null);
  if (!defaultDates.current) {
    const to = new Date(), from = new Date();
    from.setDate(from.getDate() - 180);
    defaultDates.current = { from: isoDate(from), to: isoDate(to) };
  }
  const [fromDate, setFromDate] = useState(defaultDates.current.from);
  const [toDate,   setToDate]   = useState(defaultDates.current.to);

  const [candles,      setCandles]      = useState<Candle[]>([]);
  const [status,       setStatus]       = useState("Ready");
  const [showVolume,   setShowVolume]   = useState(true);
  const [showSessions, setShowSessions] = useState(false);
  const [showFVG,      setShowFVG]      = useState(false);
  const [showStats,    setShowStats]    = useState(false);
  const [showBacktest, setShowBacktest] = useState(false);
  const [btResult,     setBtResult]     = useState<BacktestResult | null>(null);
  const [enabledInds,  setEnabledInds]  = useState<string[]>([]);
  const [activeTool,   setActiveTool]   = useState<DrawingType>("cursor");
  const [drawColor,    setDrawColor]    = useState("#2196f3");
  const [drawings,     setDrawings]     = useState<Drawing[]>([]);
  const [ctxMenu,      setCtxMenu]      = useState<ContextMenu | null>(null);

  // Replay state
  const [replayMode, setReplayMode] = useState(false);
  const [replayIdx,  setReplayIdx]  = useState(0);
  const [playing,    setPlaying]    = useState(false);
  const [speed,      setSpeed]      = useState(1);

  // Trade state
  const [trades,    setTrades]    = useState<Trade[]>([]);
  const [openTrade, setOpenTrade] = useState<Trade | null>(null);
  const [slPct,     setSlPct]     = useState(1.0);
  const [tpPct,     setTpPct]     = useState(2.0);

  // ── Meta + initial load ───────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/api/meta`)
      .then((r) => r.json())
      .then((d) => {
        setSymbols(d.symbols ?? []);
        setTimeframes(d.timeframes ?? []);
        if (d.symbols?.length)    setSymbol(d.symbols[0]);
        if (d.timeframes?.length) setInterval(d.timeframes[d.timeframes.length - 1]);
      })
      .catch(() => setStatus("Backend unavailable"));
  }, []);

  // Core candle fetcher — does NOT reset btResult (caller decides)
  const loadCandlesFor = useCallback(async (sym: string, iv: string) => {
    if (fromDate > toDate) {
      setStatus("Error: 'From' date must be before 'To' date");
      return;
    }
    setStatus("Loading...");
    setReplayMode(false);
    setPlaying(false);
    setOpenTrade(null);
    setTrades([]);
    try {
      const url = `${API}/api/ohlcv?symbol=${sym}&interval=${iv}&from_date=${fromDate}&to_date=${toDate}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setCandles(data.candles ?? []);
      setStatus(`${(data.count ?? 0).toLocaleString()} candles  ${fromDate} -> ${toDate}`);
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [fromDate, toDate]);

  const loadCandles = useCallback(async () => {
    setBtResult(null);
    setEnabledInds([]);
    await loadCandlesFor(symbol, interval);
  }, [symbol, interval, loadCandlesFor]);

  useEffect(() => {
    if (symbols.length && timeframes.length) loadCandles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbols, timeframes]);

  // ── FVG ──────────────────────────────────────────────────────────────────
  const allFvgs = useMemo<FVG[]>(() => {
    if (!showFVG || candles.length < 3) return [];
    return detectFVGs(candles);
  }, [candles, showFVG]);

  const visibleFvgs = useMemo<FVG[]>(() => {
    if (!replayMode || !candles[replayIdx]) return allFvgs;
    const cutoff = candles[replayIdx].time;
    return allFvgs
      .filter((f) => f.time <= cutoff)
      .map((f) => (f.fillTime && f.fillTime > cutoff ? { ...f, fillTime: undefined } : f));
  }, [allFvgs, replayMode, replayIdx, candles]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => calcStats(trades), [trades]);

  // ── Replay: play interval ─────────────────────────────────────────────────
  useEffect(() => {
    if (!playing) return;
    const ms = Math.max(50, Math.round(1000 / speed));
    const id = window.setInterval(() => {
      setReplayIdx((prev) => {
        if (prev >= candles.length - 1) { setPlaying(false); return prev; }
        return prev + 1;
      });
    }, ms);
    return () => window.clearInterval(id);
  }, [playing, speed, candles.length]);

  // ── Replay: auto-close trade on SL/TP hit ────────────────────────────────
  useEffect(() => {
    if (!openTrade || !candles[replayIdx]) return;
    const c = candles[replayIdx];
    let closePrice: number | undefined;
    let exitReason: "sl" | "tp" | undefined;

    if (openTrade.dir === "long") {
      if (c.low <= openTrade.sl)       { closePrice = openTrade.sl; exitReason = "sl"; }
      else if (c.high >= openTrade.tp) { closePrice = openTrade.tp; exitReason = "tp"; }
    } else {
      if (c.high >= openTrade.sl)      { closePrice = openTrade.sl; exitReason = "sl"; }
      else if (c.low <= openTrade.tp)  { closePrice = openTrade.tp; exitReason = "tp"; }
    }

    if (closePrice !== undefined && exitReason !== undefined) {
      setTrades((prev) => [
        ...prev,
        { ...openTrade, exitTime: c.time, exitPrice: closePrice, exitReason },
      ]);
      setOpenTrade(null);
    }
  }, [replayIdx, openTrade, candles]);

  // ── Replay: keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    if (!replayMode) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as Element)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setReplayIdx((p) => Math.min(p + 1, candles.length - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setReplayIdx((p) => Math.max(0, p - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replayMode, candles.length]);

  // ── Replay toggle ─────────────────────────────────────────────────────────
  const handleReplayToggle = useCallback(() => {
    if (!replayMode) {
      setReplayMode(true);
      setReplayIdx(Math.max(0, candles.length - 200));
      setPlaying(false);
      setTrades([]);
      setOpenTrade(null);
    } else {
      setReplayMode(false);
      setPlaying(false);
      setOpenTrade(null);
    }
  }, [replayMode, candles.length]);

  // ── Trade handlers ────────────────────────────────────────────────────────
  const openNewTrade = useCallback((dir: "long" | "short") => {
    if (!replayMode || openTrade) return;
    const c = candles[replayIdx];
    if (!c) return;
    const entry = c.close;
    const sl = dir === "long"
      ? entry * (1 - slPct / 100)
      : entry * (1 + slPct / 100);
    const tp = dir === "long"
      ? entry * (1 + tpPct / 100)
      : entry * (1 - tpPct / 100);
    setOpenTrade({ id: crypto.randomUUID(), dir, entryTime: c.time, entryPrice: entry, sl, tp });
  }, [replayMode, openTrade, candles, replayIdx, slPct, tpPct]);

  const handleCloseTrade = useCallback(() => {
    if (!openTrade || !candles[replayIdx]) return;
    const c = candles[replayIdx];
    setTrades((prev) => [
      ...prev,
      { ...openTrade, exitTime: c.time, exitPrice: c.close, exitReason: "manual" },
    ]);
    setOpenTrade(null);
  }, [openTrade, candles, replayIdx]);

  // ── Drawing handlers ──────────────────────────────────────────────────────
  const handleDrawingComplete = useCallback((d: Drawing) => {
    setDrawings((prev) => [...prev, d]);
    setActiveTool("cursor");
  }, []);

  const handleDrawingUpdate = useCallback((id: string, updated: Drawing) => {
    setDrawings((prev) => prev.map((d) => (d.id === id ? updated : d)));
  }, []);

  const handleContextDrawing = useCallback((id: string, clientX: number, clientY: number) => {
    const d = drawings.find((x) => x.id === id);
    if (!d) return;
    const x = Math.min(clientX + 2, window.innerWidth  - 190);
    const y = Math.min(clientY + 2, window.innerHeight - 260);
    setCtxMenu({ id, x, y, color: d.color });
  }, [drawings]);

  const deleteDrawing = useCallback((id: string) => {
    setDrawings((prev) => prev.filter((d) => d.id !== id));
    setCtxMenu(null);
  }, []);

  const recolorDrawing = useCallback((id: string, color: string) => {
    setDrawings((prev) => prev.map((d) => (d.id === id ? { ...d, color } : d)));
    setCtxMenu(null);
  }, []);

  const handleBacktestLoad = useCallback(async (result: BacktestResult) => {
    const sym = result.meta.symbol;
    const iv  = result.meta.interval;
    setSymbol(sym);
    setInterval(iv);
    await loadCandlesFor(sym, iv);
    setBtResult(result);
  }, [loadCandlesFor]);

  const handleBacktestClear = useCallback(() => {
    setBtResult(null);
    setEnabledInds([]);
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────
  const activeIndicators = useMemo<IndicatorSeries>(() => {
    if (!btResult || !enabledInds.length || !candles.length) return {};
    // Trim to the loaded candle range so price-scale series don't expand the
    // time axis beyond the visible window (backtest may cover years of data).
    const minTime = candles[0].time;
    const maxTime = candles[candles.length - 1].time;
    return Object.fromEntries(
      Object.entries(btResult.indicators)
        .filter(([name]) => enabledInds.includes(name))
        .map(([name, data]) => [
          name,
          data.filter((d) => d.time >= minTime && d.time <= maxTime),
        ])
    );
  }, [btResult, enabledInds, candles]);

  // Backtest trades take over when a result is loaded; otherwise use manual trades
  const chartTrades = useMemo<Trade[]>(() => {
    if (btResult) return btResult.trades;
    return openTrade ? [...trades, openTrade] : trades;
  }, [btResult, trades, openTrade]);

  const replayCurrentTime = replayMode ? candles[replayIdx]?.time : undefined;

  const openTradePnl = useMemo(() => {
    if (!openTrade || !candles[replayIdx]) return undefined;
    const close = candles[replayIdx].close;
    return openTrade.dir === "long"
      ? (close - openTrade.entryPrice) / openTrade.entryPrice * 100
      : (openTrade.entryPrice - close) / openTrade.entryPrice * 100;
  }, [openTrade, candles, replayIdx]);

  return (
    <div className="flex flex-col h-screen bg-[#131722] text-[#d1d4dc] overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 h-11 bg-[#1e222d] border-b border-[#2a2e39] shrink-0 flex-wrap">
        <span className="text-sm font-semibold text-white mr-1">Nana Charts</span>

        <select value={symbol} onChange={(e) => setSymbol(e.target.value)}
          className="h-7 px-2 text-sm bg-[#2a2e39] border border-[#363a45] rounded text-[#d1d4dc] outline-none">
          {symbols.map((s) => <option key={s}>{s}</option>)}
        </select>

        <select value={interval} onChange={(e) => setInterval(e.target.value)}
          className="h-7 px-2 text-sm bg-[#2a2e39] border border-[#363a45] rounded text-[#d1d4dc] outline-none">
          {timeframes.map((t) => <option key={t} value={t}>{TF_LABELS[t] ?? t}</option>)}
        </select>

        <span className="text-xs text-[#787b86]">From</span>
        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
          className="h-7 px-2 text-sm bg-[#2a2e39] border border-[#363a45] rounded text-[#d1d4dc] outline-none [color-scheme:dark]" />
        <span className="text-xs text-[#787b86]">To</span>
        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
          className="h-7 px-2 text-sm bg-[#2a2e39] border border-[#363a45] rounded text-[#d1d4dc] outline-none [color-scheme:dark]" />

        <button onClick={loadCandles}
          className="h-7 px-4 text-sm bg-[#2962ff] hover:bg-[#1a4fd4] text-white rounded font-medium transition-colors">
          Load
        </button>

        <ToggleBtn active={showVolume}   label="Vol"      onClick={() => setShowVolume((v)   => !v)} title="Toggle volume" />
        <ToggleBtn active={showSessions} label="Sessions" onClick={() => setShowSessions((v) => !v)} title="Toggle sessions (UTC)" />
        <ToggleBtn active={showFVG}      label="FVG"      onClick={() => setShowFVG((v)      => !v)} title="Toggle Fair Value Gaps" />
        <ToggleBtn active={replayMode}   label="Replay"   onClick={handleReplayToggle}                title="Bar replay mode" />
        <ToggleBtn active={showStats}    label="Stats"    onClick={() => setShowStats((v)    => !v)} title="Toggle stats panel" />
        <ToggleBtn active={showBacktest || !!btResult} label={btResult ? "BT loaded" : "Backtest"} onClick={() => setShowBacktest((v) => !v)} title="Load backtest results" />

        <span className="ml-auto text-xs text-[#787b86]">{status}</span>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <main className="relative flex-1 min-h-0 min-w-0">
        <Chart
          candles={candles}
          activeTool={activeTool}
          drawings={drawings}
          onDrawingComplete={handleDrawingComplete}
          onDrawingUpdate={handleDrawingUpdate}
          onContextDrawing={handleContextDrawing}
          drawColor={drawColor}
          showVolume={showVolume}
          showSessions={showSessions}
          showFVG={showFVG}
          fvgs={visibleFvgs}
          trades={chartTrades}
          replayIdx={replayMode ? replayIdx : undefined}
          replayCurrentTime={replayCurrentTime}
          indicators={activeIndicators}
        />
        <Toolbar
          activeTool={activeTool}
          drawColor={drawColor}
          hasDrawings={drawings.length > 0}
          onToolChange={setActiveTool}
          onColorChange={setDrawColor}
          onUndo={() => setDrawings((p) => p.slice(0, -1))}
          onClear={() => setDrawings([])}
        />

        {showStats && (
          <StatsPanel
            stats={stats}
            trades={trades}
            onClose={() => setShowStats(false)}
          />
        )}

        {showBacktest && (
          <BacktestPanel
            hasLoaded={!!btResult}
            onLoad={handleBacktestLoad}
            onClear={handleBacktestClear}
            onClose={() => setShowBacktest(false)}
            onIndicatorsChange={setEnabledInds}
          />
        )}
      </main>

      {/* ── Replay bar ───────────────────────────────────────────────────── */}
      {replayMode && (
        <ReplayBar
          currentIdx={replayIdx}
          totalCandles={candles.length}
          currentClose={candles[replayIdx]?.close}
          currentTime={candles[replayIdx]?.time}
          isPlaying={playing}
          speed={speed}
          hasOpenTrade={openTrade !== null}
          openTradePnl={openTradePnl}
          slPct={slPct}
          tpPct={tpPct}
          onPlayPause={() => setPlaying((p) => !p)}
          onStepBack={() => setReplayIdx((p) => Math.max(0, p - 1))}
          onStepForward={() => setReplayIdx((p) => Math.min(p + 1, candles.length - 1))}
          onSeek={setReplayIdx}
          onSpeedChange={setSpeed}
          onLong={() => openNewTrade("long")}
          onShort={() => openNewTrade("short")}
          onCloseTrade={handleCloseTrade}
          onSlPctChange={setSlPct}
          onTpPctChange={setTpPct}
        />
      )}

      {/* ── Context menu ─────────────────────────────────────────────────── */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
          <div
            className="fixed z-50 min-w-[170px] overflow-hidden rounded-xl border border-white/10 bg-[#1a1d27]/95 py-1 shadow-2xl backdrop-blur-md"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <button
              onClick={() => deleteDrawing(ctxMenu.id)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6M9 6V4h6v2" />
              </svg>
              Delete
            </button>

            <div className="my-1 border-t border-white/10" />
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Color</p>
            <div className="grid grid-cols-4 gap-1.5 px-3 pb-2.5">
              {MENU_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => recolorDrawing(ctxMenu.id, c)}
                  className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{ background: c, borderColor: ctxMenu.color === c ? "#fff" : "transparent" }}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
