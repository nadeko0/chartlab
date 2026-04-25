"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { Trade } from "@/lib/trades";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const BORING = new Set(["warmup", "close_prev"]);
const skipIndicator = (name: string) =>
  BORING.has(name) || name.endsWith("_prev");

interface ResultFile {
  name: string;
  symbol: string;
  interval: string;
  strategy: string;
  trades: number;
  created: string;
}

interface BacktestMeta {
  symbol: string;
  interval: string;
  strategy: string;
  created_at: string;
  candle_count: number;
  trade_count: number;
}

interface BacktestMetrics {
  winrate?: number;
  profit_factor?: number;
  compound_pnl?: number;
  max_drawdown?: number;
  sharpe_ratio?: number;
  total_trades?: number;
}

export interface BacktestResult {
  meta: BacktestMeta;
  metrics: BacktestMetrics;
  trades: Trade[];
  indicators: Record<string, { time: number; value: number }[]>;
}

interface Props {
  onLoad: (result: BacktestResult) => void;
  onClear: () => void;
  onClose: () => void;
  onIndicatorsChange: (enabled: string[]) => void;
  hasLoaded: boolean;
}

function fmt(n?: number | null, d = 2) {
  if (n === undefined || n === null) return "—";
  return n.toFixed(d);
}

function classifyIndicator(
  name: string,
  data: { time: number; value: number }[],
  medPrice: number,
): "price" | "osc" {
  if (!data.length) return "osc";
  const vals = data.map((d) => d.value).sort((a, b) => a - b);
  const med = vals[Math.floor(vals.length / 2)];
  const ratio = medPrice > 0 ? med / medPrice : 0;
  return ratio > 0.5 && ratio < 2.0 ? "price" : "osc";
}

export default function BacktestPanel({
  onLoad, onClear, onClose, onIndicatorsChange, hasLoaded,
}: Props) {
  const [files, setFiles]       = useState<ResultFile[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [selected, setSelected] = useState<string>("");
  const [loaded, setLoaded]     = useState<BacktestResult | null>(null);
  const [enabled, setEnabled]   = useState<Set<string>>(new Set());

  const [pos, setPos] = useState({ x: 260, y: 60 });
  const dragging = useRef(false);
  const offset   = useRef({ x: 0, y: 0 });

  const onHeaderDown = (e: React.MouseEvent) => {
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - 300, ev.clientX - offset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, ev.clientY - offset.current.y)),
      });
    };
    const cancel = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   cancel);
      window.removeEventListener("blur",      cancel);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   cancel);
    window.addEventListener("blur",      cancel, { once: true });
  };

  const fetchList = async () => {
    setError("");
    try {
      const r = await fetch(`${API}/api/backtest/list`);
      const d = await r.json();
      setFiles(d.files ?? []);
      if (d.files?.length && !selected) setSelected(d.files[0].name);
    } catch {
      setError("Cannot reach backend");
    }
  };

  useEffect(() => { fetchList(); }, []);

  // Classify indicators relative to trade prices
  const classified = useMemo<{ name: string; kind: "price" | "osc" }[]>(() => {
    if (!loaded) return [];
    const prices = loaded.trades.map((t) => t.entryPrice).sort((a, b) => a - b);
    const medPrice = prices[Math.floor(prices.length / 2)] || 1;
    return Object.keys(loaded.indicators)
      .filter((n) => !skipIndicator(n) && loaded.indicators[n].length > 0)
      .map((n) => ({ name: n, kind: classifyIndicator(n, loaded.indicators[n], medPrice) }));
  }, [loaded]);

  const handleLoad = async () => {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`${API}/api/backtest/result?name=${encodeURIComponent(selected)}`);
      if (!r.ok) throw new Error(await r.text());
      const data: BacktestResult = await r.json();
      setLoaded(data);
      onLoad(data);
      // auto-enable all non-boring indicators
      const allNames = Object.keys(data.indicators).filter((n) => !skipIndicator(n));
      const next = new Set(allNames);
      setEnabled(next);
      onIndicatorsChange(allNames);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setLoaded(null);
    setEnabled(new Set());
    onClear();
    onIndicatorsChange([]);
  };

  const toggleIndicator = (name: string) => {
    const next = new Set(enabled);
    if (next.has(name)) next.delete(name); else next.add(name);
    setEnabled(next);
    onIndicatorsChange([...next]);
  };

  const m = loaded?.metrics;

  const priceInds = classified.filter((c) => c.kind === "price");
  const oscInds   = classified.filter((c) => c.kind === "osc");

  return (
    <div
      className="fixed z-50 w-72 rounded-xl bg-[#1a1d27]/95 border border-white/10 shadow-2xl backdrop-blur-md overflow-hidden"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-[#1e2230] cursor-move select-none border-b border-white/10"
        onMouseDown={onHeaderDown}
      >
        <span className="text-xs font-semibold text-[#d1d4dc]">Load Backtest</span>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded text-[#787b86] hover:text-white hover:bg-white/10 transition-colors text-[11px]"
        >
          x
        </button>
      </div>

      <div className="px-3 py-2 space-y-2">
        {/* File selector */}
        <div className="flex gap-1.5">
          <select
            value={selected}
            onChange={(e) => { setSelected(e.target.value); setLoaded(null); }}
            className="flex-1 h-7 px-2 text-[11px] bg-[#2a2e39] border border-[#363a45] rounded text-[#d1d4dc] outline-none font-mono"
          >
            {files.length === 0 && <option value="">No results found</option>}
            {files.map((f) => (
              <option key={f.name} value={f.name}>
                {f.strategy} · {f.symbol} {f.interval} · {f.trades}T
              </option>
            ))}
          </select>
          <button
            onClick={fetchList}
            title="Refresh list"
            className="w-7 h-7 flex items-center justify-center rounded bg-[#2a2e39] border border-[#363a45] text-[#787b86] hover:text-white hover:bg-[#363a45] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-3.5 h-3.5">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-1.5">
          <button
            onClick={handleLoad}
            disabled={!selected || loading}
            className="flex-1 h-7 text-xs font-semibold bg-[#2962ff] hover:bg-[#1a4fd4] disabled:opacity-40 text-white rounded transition-colors"
          >
            {loading ? "Loading..." : "Load"}
          </button>
          {hasLoaded && (
            <button
              onClick={handleClear}
              className="h-7 px-3 text-xs font-semibold bg-[#2a2e39] border border-[#363a45] hover:border-[#ef5350] hover:text-[#ef5350] text-[#787b86] rounded transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {error && <p className="text-[10px] text-[#ef5350]">{error}</p>}

        {/* Loaded result summary */}
        {loaded && (
          <div className="border-t border-white/10 pt-2 space-y-1">
            <p className="text-[10px] text-[#787b86] font-mono">
              {loaded.meta.strategy} · {loaded.meta.symbol} {loaded.meta.interval}
              &nbsp;· {loaded.meta.trade_count} trades
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px] font-mono">
              <span className="text-[#787b86]">Win rate</span>
              <span className={`font-semibold ${(m?.winrate ?? 0) >= 50 ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
                {fmt(m?.winrate, 1)}%
              </span>
              <span className="text-[#787b86]">Profit factor</span>
              <span className={`font-semibold ${(m?.profit_factor ?? 0) >= 1 ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
                {fmt(m?.profit_factor)}
              </span>
              <span className="text-[#787b86]">Compound PnL</span>
              <span className={`font-semibold ${(m?.compound_pnl ?? 0) >= 0 ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
                {(m?.compound_pnl ?? 0) >= 0 ? "+" : ""}{fmt(m?.compound_pnl, 1)}%
              </span>
              <span className="text-[#787b86]">Max drawdown</span>
              <span className="font-semibold text-[#ef5350]">-{fmt(m?.max_drawdown, 1)}%</span>
              <span className="text-[#787b86]">Sharpe</span>
              <span className="font-semibold text-[#d1d4dc]">{fmt(m?.sharpe_ratio)}</span>
            </div>

            {/* Indicator toggles */}
            {classified.length > 0 && (
              <div className="border-t border-white/[0.08] pt-2 space-y-1">
                {priceInds.length > 0 && (
                  <>
                    <p className="text-[9px] uppercase tracking-wider text-[#787b86] font-semibold">On chart</p>
                    {priceInds.map(({ name }) => (
                      <label key={name} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={enabled.has(name)}
                          onChange={() => toggleIndicator(name)}
                          className="w-3 h-3 accent-[#2962ff]"
                        />
                        <span className="text-[11px] font-mono text-[#d1d4dc] group-hover:text-white transition-colors">{name}</span>
                      </label>
                    ))}
                  </>
                )}
                {oscInds.length > 0 && (
                  <>
                    <p className="text-[9px] uppercase tracking-wider text-[#787b86] font-semibold mt-1">Oscillators</p>
                    {oscInds.map(({ name }) => (
                      <label key={name} className="flex items-center gap-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={enabled.has(name)}
                          onChange={() => toggleIndicator(name)}
                          className="w-3 h-3 accent-[#2962ff]"
                        />
                        <span className="text-[11px] font-mono text-[#d1d4dc] group-hover:text-white transition-colors">{name}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
