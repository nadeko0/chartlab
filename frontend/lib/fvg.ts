import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";

export interface FVG {
  id: string;
  kind: "bull" | "bear";
  time: number;
  high: number;
  low: number;
  fillTime?: number;
}

export function detectFVGs(
  candles: { time: number; high: number; low: number; close: number }[],
): FVG[] {
  const fvgs: FVG[] = [];
  const MIN_RATIO = 0.0002; // 0.02% minimum gap size to filter noise

  for (let i = 2; i < candles.length; i++) {
    const a = candles[i - 2];
    const c = candles[i];

    if (c.low > a.high) {
      const gap = c.low - a.high;
      const ref = (c.low + a.high) / 2;
      if (gap / ref > MIN_RATIO) {
        fvgs.push({ id: `fvg-b${i}`, kind: "bull", time: c.time, high: c.low, low: a.high });
      }
    }
    if (c.high < a.low) {
      const gap = a.low - c.high;
      const ref = (a.low + c.high) / 2;
      if (gap / ref > MIN_RATIO) {
        fvgs.push({ id: `fvg-r${i}`, kind: "bear", time: c.time, high: a.low, low: c.high });
      }
    }
  }

  // Mark fill times (price enters the gap from the opposing side)
  const timeToIdx = new Map<number, number>(candles.map((c, i) => [c.time, i]));
  for (const fvg of fvgs) {
    const start = (timeToIdx.get(fvg.time) ?? 0) + 1;
    for (let j = start; j < candles.length; j++) {
      const c = candles[j];
      if (fvg.kind === "bull" && c.low <= fvg.low) { fvg.fillTime = c.time; break; }
      if (fvg.kind === "bear" && c.high >= fvg.high) { fvg.fillTime = c.time; break; }
    }
  }

  return fvgs;
}

export function renderFVGs(
  ctx: CanvasRenderingContext2D,
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  fvgs: FVG[],
) {
  const W = ctx.canvas.width;

  for (const fvg of fvgs) {
    const x0 = chart.timeScale().timeToCoordinate(fvg.time as Time);
    if (x0 === null || x0 > W + 50) continue;

    let x1: number;
    if (fvg.fillTime) {
      const fx = chart.timeScale().timeToCoordinate(fvg.fillTime as Time);
      x1 = fx !== null ? fx : W;
    } else {
      x1 = W;
    }
    if (x1 <= x0) continue;

    const yH = series.priceToCoordinate(fvg.high);
    const yL = series.priceToCoordinate(fvg.low);
    if (yH === null || yL === null) continue;

    const isBull = fvg.kind === "bull";
    const filled = fvg.fillTime !== undefined;

    ctx.save();

    ctx.fillStyle = isBull
      ? `rgba(38,166,154,${filled ? 0.05 : 0.13})`
      : `rgba(239,83,80,${filled ? 0.05 : 0.13})`;
    ctx.fillRect(x0, Math.min(yH, yL), x1 - x0, Math.abs(yH - yL));

    ctx.strokeStyle = isBull
      ? `rgba(38,166,154,${filled ? 0.25 : 0.55})`
      : `rgba(239,83,80,${filled ? 0.25 : 0.55})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, yH); ctx.lineTo(x1, yH);
    ctx.moveTo(x0, yL); ctx.lineTo(x1, yL);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!filled && x1 - x0 > 28) {
      ctx.font = "9px monospace";
      ctx.fillStyle = isBull ? "rgba(38,166,154,0.8)" : "rgba(239,83,80,0.8)";
      ctx.fillText(isBull ? "FVG+" : "FVG-", x0 + 3, Math.min(yH, yL) + 10);
    }

    ctx.restore();
  }
}
