"use client";

import { useRef, useState } from "react";
import type { TradeStats, Trade } from "@/lib/trades";
import { tradePnlPct } from "@/lib/trades";

interface Props {
  stats: TradeStats | null;
  trades: Trade[];
  onClose: () => void;
}

export default function StatsPanel({ stats, trades, onClose }: Props) {
  const [pos, setPos] = useState({ x: 20, y: 60 });
  const dragging = useRef(false);
  const offset   = useRef({ x: 0, y: 0 });

  const onHeaderDown = (e: React.MouseEvent) => {
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth  - 256, ev.clientX - offset.current.x)),
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

  const closed = trades.filter((t) => t.exitPrice !== undefined);

  const row = (label: string, value: string, color = "text-[#d1d4dc]") => (
    <div key={label} className="flex justify-between items-baseline py-[3px] border-b border-white/[0.04]">
      <span className="text-[11px] text-[#787b86]">{label}</span>
      <span className={`text-[11px] font-mono font-semibold ${color}`}>{value}</span>
    </div>
  );

  return (
    <div
      className="fixed z-50 w-60 rounded-xl bg-[#1a1d27]/95 border border-white/10 shadow-2xl backdrop-blur-md overflow-hidden"
      style={{ left: pos.x, top: pos.y }}
    >
      {/* Drag handle / title bar */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-[#1e2230] cursor-move select-none border-b border-white/10"
        onMouseDown={onHeaderDown}
      >
        <span className="text-xs font-semibold text-[#d1d4dc]">Trade Statistics</span>
        <button
          onClick={onClose}
          className="w-5 h-5 flex items-center justify-center rounded text-[#787b86] hover:text-white hover:bg-white/10 transition-colors text-[11px]"
        >
          x
        </button>
      </div>

      {/* Stats rows */}
      <div className="px-3 py-2">
        {!stats ? (
          <p className="text-[11px] text-[#787b86] text-center py-3">No closed trades yet</p>
        ) : (
          <>
            {row("Total Trades",  `${stats.total}`)}
            {row("Wins / Losses", `${stats.wins} / ${stats.losses}`)}
            {row("Win Rate",      `${stats.winRate.toFixed(1)}%`,
              stats.winRate >= 50 ? "text-[#26a69a]" : "text-[#ef5350]")}
            {row("Avg Win",       `+${stats.avgWin.toFixed(2)}%`,   "text-[#26a69a]")}
            {row("Avg Loss",      `${stats.avgLoss.toFixed(2)}%`,   "text-[#ef5350]")}
            {row("Profit Factor",
              stats.profitFactor === Infinity ? "inf" : stats.profitFactor.toFixed(2),
              stats.profitFactor >= 1.5 ? "text-[#26a69a]"
                : stats.profitFactor >= 1  ? "text-[#fdd835]"
                : "text-[#ef5350]")}
            {row("Net P&L",
              `${stats.netPnl >= 0 ? "+" : ""}${stats.netPnl.toFixed(2)}%`,
              stats.netPnl >= 0 ? "text-[#26a69a]" : "text-[#ef5350]")}
            {row("Max Drawdown",  `-${stats.maxRunDD.toFixed(2)}%`, "text-[#ef5350]")}
          </>
        )}
      </div>

      {/* Trade list */}
      {closed.length > 0 && (
        <div className="border-t border-white/10">
          <div className="max-h-52 overflow-y-auto">
            <table className="w-full text-[10px] font-mono">
              <thead className="sticky top-0 bg-[#1a1d27]">
                <tr className="text-[#787b86] border-b border-white/[0.06]">
                  <th className="text-left px-3 py-1 font-normal">#</th>
                  <th className="px-1 py-1 font-normal">Dir</th>
                  <th className="text-right px-1 py-1 font-normal">Entry</th>
                  <th className="text-right px-1 py-1 font-normal">PnL</th>
                  <th className="text-right px-3 py-1 font-normal">Exit</th>
                </tr>
              </thead>
              <tbody>
                {[...closed].reverse().map((t, i) => {
                  const pnl = tradePnlPct(t);
                  return (
                    <tr key={t.id} className="border-b border-white/[0.03] hover:bg-white/[0.04]">
                      <td className="px-3 py-1 text-[#787b86]">{closed.length - i}</td>
                      <td className="px-1 py-1 text-center">
                        <span className={t.dir === "long" ? "text-[#26a69a]" : "text-[#ef5350]"}>
                          {t.dir === "long" ? "L" : "S"}
                        </span>
                      </td>
                      <td className="px-1 py-1 text-right text-[#d1d4dc]">
                        {t.entryPrice >= 100
                          ? t.entryPrice.toFixed(2)
                          : t.entryPrice.toFixed(4)}
                      </td>
                      <td className={`px-1 py-1 text-right font-semibold ${pnl >= 0 ? "text-[#26a69a]" : "text-[#ef5350]"}`}>
                        {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
                      </td>
                      <td className="px-3 py-1 text-right text-[#787b86]">
                        {t.exitReason ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
