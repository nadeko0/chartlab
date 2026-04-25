import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";

export type TradeDir = "long" | "short";
export type ExitReason = "tp" | "sl" | "manual";

export interface Trade {
  id: string;
  dir: TradeDir;
  entryTime: number;
  entryPrice: number;
  sl: number;
  tp: number;
  exitTime?: number;
  exitPrice?: number;
  exitReason?: ExitReason;
}

export interface TradeStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;    // %
  avgWin: number;     // %
  avgLoss: number;    // %
  profitFactor: number;
  netPnl: number;     // %
  maxRunDD: number;   // %  (running max drawdown from peak equity)
}

export function tradePnlPct(t: Trade): number {
  if (t.exitPrice === undefined) return 0;
  const sign = t.dir === "long" ? 1 : -1;
  return sign * (t.exitPrice - t.entryPrice) / t.entryPrice * 100;
}

export function calcStats(trades: Trade[]): TradeStats | null {
  const closed = trades.filter((t) => t.exitPrice !== undefined);
  if (closed.length === 0) return null;

  const pnls = closed.map(tradePnlPct);
  const wins   = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);

  const sumWins   = wins.reduce((a, b) => a + b, 0);
  const sumLosses = Math.abs(losses.reduce((a, b) => a + b, 0));
  const netPnl    = pnls.reduce((a, b) => a + b, 0);

  // Running drawdown from equity peak (additive % for simplicity)
  let peak = 0, equity = 0, maxRunDD = 0;
  for (const p of pnls) {
    equity += p;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxRunDD) maxRunDD = dd;
  }

  return {
    total: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: wins.length / closed.length * 100,
    avgWin:  wins.length  > 0 ? sumWins  / wins.length  : 0,
    avgLoss: losses.length > 0 ? -(sumLosses / losses.length) : 0,
    profitFactor: sumLosses > 0 ? sumWins / sumLosses : Infinity,
    netPnl,
    maxRunDD,
  };
}

// ── Canvas render ─────────────────────────────────────────────────────────────

export function renderTrades(
  ctx: CanvasRenderingContext2D,
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  trades: Trade[],
  currentTime?: number,
) {
  const W = ctx.canvas.width;

  for (const t of trades) {
    const x0     = chart.timeScale().timeToCoordinate(t.entryTime as Time);
    const yEntry = series.priceToCoordinate(t.entryPrice);
    const ySL    = series.priceToCoordinate(t.sl);
    const yTP    = series.priceToCoordinate(t.tp);
    if (x0 === null || yEntry === null || ySL === null || yTP === null) continue;

    const isLong = t.dir === "long";
    const isOpen = t.exitTime === undefined;

    // Right edge of the trade zone
    let x1 = W;
    let yExit: number | null = null;
    if (!isOpen && t.exitTime) {
      const xE = chart.timeScale().timeToCoordinate(t.exitTime as Time);
      if (xE !== null) x1 = xE;
      if (t.exitPrice !== undefined) yExit = series.priceToCoordinate(t.exitPrice);
    } else if (currentTime) {
      const xC = chart.timeScale().timeToCoordinate(currentTime as Time);
      if (xC !== null) x1 = xC;
    }
    if (x1 <= x0) continue;

    ctx.save();

    // Filled zones
    ctx.fillStyle = isLong ? "rgba(38,166,154,0.12)" : "rgba(239,83,80,0.12)";
    ctx.fillRect(x0, Math.min(yEntry, yTP), x1 - x0, Math.abs(yTP - yEntry));
    ctx.fillStyle = isLong ? "rgba(239,83,80,0.12)" : "rgba(38,166,154,0.12)";
    ctx.fillRect(x0, Math.min(yEntry, ySL), x1 - x0, Math.abs(ySL - yEntry));

    // TP line
    ctx.strokeStyle = "#26a69a"; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(x0, yTP); ctx.lineTo(x1, yTP); ctx.stroke();

    // SL line
    ctx.strokeStyle = "#ef5350";
    ctx.beginPath(); ctx.moveTo(x0, ySL); ctx.lineTo(x1, ySL); ctx.stroke();
    ctx.setLineDash([]);

    // Entry line
    ctx.strokeStyle = "#d1d4dc"; ctx.lineWidth = 1.5; ctx.setLineDash([6, 3]);
    ctx.beginPath(); ctx.moveTo(x0, yEntry); ctx.lineTo(x1, yEntry); ctx.stroke();
    ctx.setLineDash([]);

    // Entry arrow (triangle above/below entry)
    const arrowColor = isLong ? "#26a69a" : "#ef5350";
    ctx.fillStyle = arrowColor;
    ctx.beginPath();
    if (isLong) {
      ctx.moveTo(x0, yEntry - 14);
      ctx.lineTo(x0 - 7, yEntry - 2);
      ctx.lineTo(x0 + 7, yEntry - 2);
    } else {
      ctx.moveTo(x0, yEntry + 14);
      ctx.lineTo(x0 - 7, yEntry + 2);
      ctx.lineTo(x0 + 7, yEntry + 2);
    }
    ctx.closePath();
    ctx.fill();

    // Entry label
    ctx.font = "10px monospace";
    ctx.fillStyle = "#d1d4dc";
    ctx.fillText(`${isLong ? "L" : "S"} ${t.entryPrice.toFixed(2)}`, x0 + 10, yEntry - 3);

    // Exit marker + PnL
    if (!isOpen && yExit !== null) {
      const ec = t.exitReason === "tp" ? "#26a69a" : t.exitReason === "sl" ? "#ef5350" : "#787b86";
      ctx.fillStyle = ec;
      ctx.beginPath(); ctx.arc(x1, yExit, 5, 0, Math.PI * 2); ctx.fill();

      const pnl = tradePnlPct(t);
      const sign = pnl >= 0 ? "+" : "";
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = pnl >= 0 ? "#26a69a" : "#ef5350";
      ctx.fillText(`${sign}${pnl.toFixed(2)}%`, x1 + 8, yExit + 4);
    }

    ctx.restore();
  }
}
