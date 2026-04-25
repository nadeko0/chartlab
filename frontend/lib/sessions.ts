import type { IChartApi, Time } from "lightweight-charts";

// All session times are UTC hours. endH < startH means the session crosses midnight.
export const SESSION_DEFS = [
  { key: "sydney",    label: "Sydney",    startH: 21, endH: 6,  color: "rgba(156,39,176,0.06)"  },
  { key: "asia",      label: "Asia",      startH: 0,  endH: 9,  color: "rgba(255,235,59,0.07)"  },
  { key: "frankfurt", label: "Frankfurt", startH: 7,  endH: 15, color: "rgba(255,152,0,0.07)"   },
  { key: "london",    label: "London",    startH: 7,  endH: 16, color: "rgba(33,150,243,0.06)"  },
  { key: "ny",        label: "New York",  startH: 13, endH: 22, color: "rgba(38,166,154,0.08)"  },
] as const;

export type SessionKey = (typeof SESSION_DEFS)[number]["key"];

/**
 * Map an arbitrary UTC timestamp (seconds) to a canvas x-coordinate.
 * LightweightCharts only maps candle timestamps natively, so for times
 * between candles we interpolate linearly from the two surrounding candles.
 * This makes session bands accurate on all timeframes (1m, 4h, 1D, …).
 */
function tToX(
  chart: IChartApi,
  candles: readonly { time: number }[],
  t: number,
): number | null {
  if (!candles.length) return null;

  // Try the direct lookup first (works when t is an exact candle timestamp)
  const direct = chart.timeScale().timeToCoordinate(t as Time);
  if (direct !== null) return direct;

  // Binary-search for the surrounding candles
  let lo = 0, hi = candles.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time < t) lo = mid + 1;
    else hi = mid;
  }

  // Clamp to data range
  if (lo === 0) return chart.timeScale().timeToCoordinate(candles[0].time as Time);
  if (lo >= candles.length)
    return chart.timeScale().timeToCoordinate(candles[candles.length - 1].time as Time);

  const ca = candles[lo - 1];
  const cb = candles[lo];
  const xa = chart.timeScale().timeToCoordinate(ca.time as Time);
  const xb = chart.timeScale().timeToCoordinate(cb.time as Time);
  if (xa === null || xb === null) return null;

  const ratio = (t - ca.time) / (cb.time - ca.time);
  return xa + ratio * (xb - xa);
}

export function renderSessions(
  ctx: CanvasRenderingContext2D,
  chart: IChartApi,
  candles: { time: number }[],
  activeSessions: readonly string[],
) {
  if (candles.length < 2 || !activeSessions.length) return;

  const W = ctx.canvas.width;
  const H = ctx.canvas.height;

  const visRange = chart.timeScale().getVisibleRange();
  if (!visRange) return;

  const fromT = (visRange.from as number) - 86400;
  const toT   = (visRange.to   as number) + 86400;

  const dayStart = Math.floor(fromT / 86400) * 86400;

  for (const { key, label, startH, endH, color } of SESSION_DEFS) {
    if (!activeSessions.includes(key)) continue;

    const labelColor = color.replace(/[\d.]+\)$/, "0.8)");
    const h = (n: number) => String(n).padStart(2, "0");
    const timeRange = `${h(startH)}:00–${h(endH)}:00`;
    const fullLabel = `${label}  ${timeRange} UTC`;

    for (let d = dayStart; d <= toT; d += 86400) {
      const tStart = d + startH * 3600;
      const tEnd   = endH > startH
        ? d + endH * 3600
        : d + endH * 3600 + 86400;

      if (tEnd < fromT || tStart > toT) continue;

      const x0 = tToX(chart, candles, tStart);
      const x1 = tToX(chart, candles, tEnd);
      if (x0 === null || x1 === null) continue;

      const rx = Math.max(0, x0);
      const rw = Math.min(W, x1) - rx;
      if (rw <= 0) continue;

      ctx.fillStyle = color;
      ctx.fillRect(rx, 0, rw, H);

      if (rw > 60 && rx < W - 4) {
        ctx.font = "bold 10px sans-serif";
        ctx.fillStyle = labelColor;
        ctx.fillText(fullLabel, Math.min(rx + 5, W - 160), 14);
      }
    }
  }
}
