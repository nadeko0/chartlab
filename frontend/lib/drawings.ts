import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";

export type DrawingType =
  | "cursor"
  | "trendline"
  | "ray"
  | "hline"
  | "fib"
  | "measure"
  | "zone"
  | "rr_long"
  | "rr_short";

export interface ChartPoint {
  time: number;
  price: number;
}

export interface Drawing {
  id: string;
  type: DrawingType;
  points: ChartPoint[];
  color: string;
}

export function formatPrice(price: number): string {
  if (price === 0) return "0";
  const abs = Math.abs(price);
  if (abs >= 1000) return price.toFixed(2);
  if (abs >= 1)    return price.toFixed(4);
  const exp = Math.floor(Math.log10(abs));
  return price.toFixed(Math.min(-exp + 4, 10));
}

export const FIB_LEVELS: { level: number; color: string }[] = [
  { level: 0,     color: "#e53935" },
  { level: 0.236, color: "#fb8c00" },
  { level: 0.382, color: "#fdd835" },
  { level: 0.5,   color: "#43a047" },
  { level: 0.618, color: "#00acc1" },
  { level: 0.786, color: "#5e35b1" },
  { level: 1,     color: "#e53935" },
];

export const TOOL_POINTS: Record<DrawingType, number> = {
  cursor:    0,
  hline:     1,
  trendline: 2,
  ray:       2,
  fib:       2,
  measure:   2,
  zone:      2,
  rr_long:   2,
  rr_short:  2,
};

// ── Hit testing ───────────────────────────────────────────────────────────────

export type HitResult =
  | { kind: "handle"; pointIndex: number; priceOnly: boolean }
  | { kind: "body" };

const HIT_R = 12; // handle hit radius (px)

// Returns what was hit for drag purposes.
// "handle" → drag a specific point. "body" → drag the whole drawing.
export function hitTestDrawing(
  d: Drawing,
  mx: number,
  my: number,
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
): HitResult | null {
  if (d.type === "cursor" || d.points.length === 0) return null;

  // ── hline: any Y within threshold ────────────────────────────────────────
  if (d.type === "hline") {
    const y = series.priceToCoordinate(d.points[0].price);
    if (y === null) return null;
    return Math.abs(my - y) <= HIT_R
      ? { kind: "handle", pointIndex: 0, priceOnly: true }
      : null;
  }

  // ── R:R: lines first, then inside-box body ───────────────────────────────
  if (d.type === "rr_long" || d.type === "rr_short") {
    if (d.points.length < 2) return null;
    const x0 = chart.timeScale().timeToCoordinate(d.points[0].time as Time);
    const x1 = chart.timeScale().timeToCoordinate(d.points[1].time as Time);
    if (x0 === null || x1 === null) return null;
    const xL = Math.min(x0, x1), xR = Math.max(x0, x1);
    if (mx < xL - HIT_R || mx > xR + HIT_R) return null;

    const entryP = d.points[0].price;
    const tpP    = d.points[1].price;
    const slP    = d.points.length >= 3 ? d.points[2].price : entryP - (tpP - entryP);
    const entryY = series.priceToCoordinate(entryP);
    const tpY    = series.priceToCoordinate(tpP);
    const slY    = series.priceToCoordinate(slP);
    if (entryY === null || tpY === null || slY === null) return null;

    if (Math.abs(my - tpY)    <= HIT_R) return { kind: "handle", pointIndex: 1, priceOnly: true };
    if (Math.abs(my - entryY) <= HIT_R) return { kind: "handle", pointIndex: 0, priceOnly: true };
    if (Math.abs(my - slY)    <= HIT_R) return { kind: "handle", pointIndex: 2, priceOnly: true };

    const yT = Math.min(tpY, slY), yB = Math.max(tpY, slY);
    if (mx >= xL && mx <= xR && my >= yT && my <= yB) return { kind: "body" };
    return null;
  }

  // ── zone / measure: corner handles, then body ────────────────────────────
  if ((d.type === "zone" || d.type === "measure") && d.points.length >= 2) {
    const c0 = toCoord(chart, series, d.points[0]);
    const c1 = toCoord(chart, series, d.points[1]);
    if (!c0 || !c1) return null;

    for (let i = 0; i < 2; i++) {
      const c = i === 0 ? c0 : c1;
      const dx = mx - c.x, dy = my - c.y;
      if (dx * dx + dy * dy <= HIT_R * HIT_R) {
        return { kind: "handle", pointIndex: i, priceOnly: false };
      }
    }
    const rx = Math.min(c0.x, c1.x), ry = Math.min(c0.y, c1.y);
    const rw = Math.abs(c1.x - c0.x), rh = Math.abs(c1.y - c0.y);
    if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) return { kind: "body" };
    return null;
  }

  // ── Everything else: handle circles at each point ────────────────────────
  for (let i = 0; i < d.points.length; i++) {
    const x = chart.timeScale().timeToCoordinate(d.points[i].time as Time);
    const y = series.priceToCoordinate(d.points[i].price);
    if (x === null || y === null) continue;
    const dx = mx - x, dy = my - y;
    if (dx * dx + dy * dy <= HIT_R * HIT_R) {
      return { kind: "handle", pointIndex: i, priceOnly: false };
    }
  }
  return null;
}

// Broader hit test used for context menu — covers the full visible area of each drawing.
export function findDrawingAt(
  drawings: Drawing[],
  mx: number,
  my: number,
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
): string | null {
  const T = 8;
  for (let i = drawings.length - 1; i >= 0; i--) {
    const d = drawings[i];
    if (d.type === "cursor" || d.points.length === 0) continue;
    const c0 = toCoord(chart, series, d.points[0]);
    const c1 = d.points.length > 1 ? toCoord(chart, series, d.points[1]) : null;

    switch (d.type) {
      case "hline": {
        if (!c0) break;
        if (Math.abs(my - c0.y) <= T) return d.id;
        break;
      }
      case "trendline": {
        if (!c0 || !c1) break;
        const dx = c1.x - c0.x, dy = c1.y - c0.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) { if (Math.abs(mx - c0.x) <= T) return d.id; break; }
        const dist = Math.abs((mx - c0.x) * dy - (my - c0.y) * dx) / len;
        if (dist <= T) return d.id;
        break;
      }
      case "ray": {
        if (!c0 || !c1) break;
        const dx = c1.x - c0.x, dy = c1.y - c0.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.001) break;
        const dot = (mx - c0.x) * dx + (my - c0.y) * dy;
        if (dot < 0) break;
        const dist = Math.abs((mx - c0.x) * dy - (my - c0.y) * dx) / len;
        if (dist <= T) return d.id;
        break;
      }
      case "fib": {
        if (!c0 || !c1) break;
        const xL = Math.min(c0.x, c1.x), xR = Math.max(c0.x, c1.x);
        if (mx < xL - T || mx > xR + T) break;
        const p1p = d.points[0].price, p2p = d.points[1].price;
        for (const { level } of FIB_LEVELS) {
          const yc = series.priceToCoordinate(p1p + level * (p2p - p1p));
          if (yc !== null && Math.abs(my - yc) <= T) return d.id;
        }
        break;
      }
      case "measure":
      case "zone": {
        if (!c0 || !c1) break;
        const rx = Math.min(c0.x, c1.x) - T, ry = Math.min(c0.y, c1.y) - T;
        const rw = Math.abs(c1.x - c0.x) + T * 2, rh = Math.abs(c1.y - c0.y) + T * 2;
        if (mx >= rx && mx <= rx + rw && my >= ry && my <= ry + rh) return d.id;
        break;
      }
      case "rr_long":
      case "rr_short": {
        if (!c0 || !c1 || d.points.length < 2) break;
        const entryP = d.points[0].price;
        const tpP    = d.points[1].price;
        const slP    = d.points.length >= 3 ? d.points[2].price : entryP - (tpP - entryP);
        const tpY    = series.priceToCoordinate(tpP);
        const slY    = series.priceToCoordinate(slP);
        if (tpY === null || slY === null) break;
        const xL = Math.min(c0.x, c1.x) - T, xR = Math.max(c0.x, c1.x) + T;
        const yT = Math.min(tpY, slY) - T, yB = Math.max(tpY, slY) + T;
        if (mx >= xL && mx <= xR && my >= yT && my <= yB) return d.id;
        break;
      }
    }
  }
  return null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function toCoord(
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  p: ChartPoint,
): { x: number; y: number } | null {
  const x = chart.timeScale().timeToCoordinate(p.time as Time);
  const y = series.priceToCoordinate(p.price);
  if (x === null || y === null) return null;
  return { x, y };
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r = 4, color = "#fff") {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function labelBox(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  bg: string,
  fg = "#fff",
  font = "11px monospace",
) {
  ctx.font = font;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = bg;
  ctx.fillRect(x - 3, y - 12, tw + 8, 16);
  ctx.fillStyle = fg;
  ctx.fillText(text, x + 1, y);
}

// ── Main render ───────────────────────────────────────────────────────────────

export function renderDrawings(
  ctx: CanvasRenderingContext2D,
  drawings: Drawing[],
  chart: IChartApi,
  series: ISeriesApi<SeriesType>,
  skipClear = false,
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  if (!skipClear) ctx.clearRect(0, 0, W, H);

  for (const d of drawings) {
    if (d.type === "cursor") continue;

    const coords = d.points.map((p) => toCoord(chart, series, p));
    const c0 = coords[0] ?? null;
    const c1 = coords[1] ?? null;

    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = d.color;

    switch (d.type) {

      case "trendline": {
        if (!c0 || !c1) break;
        const dx = c1.x - c0.x, dy = c1.y - c0.y;
        ctx.beginPath();
        if (Math.abs(dx) < 0.001) {
          ctx.moveTo(c0.x, 0); ctx.lineTo(c0.x, H);
        } else {
          const m = dy / dx;
          ctx.moveTo(0, c0.y + m * (0 - c0.x));
          ctx.lineTo(W, c0.y + m * (W - c0.x));
        }
        ctx.stroke();
        for (const c of [c0, c1]) dot(ctx, c.x, c.y, 4, d.color);
        break;
      }

      case "ray": {
        if (!c0 || !c1) break;
        const dx = c1.x - c0.x, dy = c1.y - c0.y;
        let ex: number, ey: number;
        if (Math.abs(dx) < 0.001) {
          ex = c0.x; ey = dy >= 0 ? H : 0;
        } else {
          const t = dx > 0 ? (W - c0.x) / dx : -c0.x / dx;
          ex = c0.x + t * dx; ey = c0.y + t * dy;
        }
        ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.lineTo(ex, ey); ctx.stroke();
        const ang = Math.atan2(ey - c0.y, ex - c0.x);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - 10 * Math.cos(ang - 0.4), ey - 10 * Math.sin(ang - 0.4));
        ctx.lineTo(ex - 10 * Math.cos(ang + 0.4), ey - 10 * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fillStyle = d.color; ctx.fill();
        dot(ctx, c0.x, c0.y, 4, d.color);
        dot(ctx, c1.x, c1.y, 4, d.color);
        break;
      }

      case "hline": {
        if (!c0) break;
        ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(0, c0.y); ctx.lineTo(W, c0.y); ctx.stroke();
        ctx.setLineDash([]);
        const lbl = formatPrice(d.points[0].price);
        labelBox(ctx, lbl, W - ctx.measureText(lbl).width - 10, c0.y + 4, d.color);
        break;
      }

      case "fib": {
        if (!c0 || !c1) break;
        const p1p = d.points[0].price, p2p = d.points[1].price;
        const xL = Math.min(c0.x, c1.x), xR = Math.max(c0.x, c1.x);
        for (const { level, color } of FIB_LEVELS) {
          const price = p1p + level * (p2p - p1p);
          const yc = series.priceToCoordinate(price);
          if (yc === null) continue;
          ctx.strokeStyle = color;
          ctx.lineWidth = level === 0 || level === 1 ? 1.5 : 1;
          ctx.beginPath(); ctx.moveTo(xL, yc); ctx.lineTo(xR, yc); ctx.stroke();
          const lbl = `${(level * 100).toFixed(1)}%  ${formatPrice(price)}`;
          ctx.font = "10px monospace";
          const tw = ctx.measureText(lbl).width;
          ctx.fillStyle = color + "22";
          ctx.fillRect(xR + 4, yc - 10, tw + 6, 13);
          ctx.fillStyle = color;
          ctx.fillText(lbl, xR + 7, yc + 1);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(c0.x, 0); ctx.lineTo(c0.x, H);
        ctx.moveTo(c1.x, 0); ctx.lineTo(c1.x, H);
        ctx.stroke(); ctx.setLineDash([]);
        dot(ctx, c0.x, c0.y, 4, d.color);
        dot(ctx, c1.x, c1.y, 4, d.color);
        break;
      }

      case "measure": {
        if (!c0 || !c1) break;
        const p1p = d.points[0].price, p2p = d.points[1].price;
        const pct = (p2p - p1p) / p1p * 100;
        const isUp = p2p >= p1p;

        ctx.fillStyle = isUp ? "rgba(38,166,154,0.1)" : "rgba(239,83,80,0.1)";
        ctx.fillRect(
          Math.min(c0.x, c1.x), Math.min(c0.y, c1.y),
          Math.abs(c1.x - c0.x), Math.abs(c1.y - c0.y),
        );
        ctx.strokeStyle = isUp ? "#26a69a" : "#ef5350";
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.min(c0.x, c1.x), c0.y); ctx.lineTo(Math.max(c0.x, c1.x), c0.y);
        ctx.moveTo(Math.min(c0.x, c1.x), c1.y); ctx.lineTo(Math.max(c0.x, c1.x), c1.y);
        ctx.stroke(); ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(c1.x, c0.y); ctx.lineTo(c1.x, c1.y); ctx.stroke();

        const midX = (c0.x + c1.x) / 2, midY = (c0.y + c1.y) / 2;
        const sign = isUp ? "+" : "";
        const main = `${sign}${pct.toFixed(2)}%`;
        const sub  = `${sign}${formatPrice(p2p - p1p)}`;
        ctx.font = "bold 12px monospace";
        const mw = Math.max(ctx.measureText(main).width, ctx.measureText(sub).width);
        const bx = midX - mw / 2 - 6, by = midY - 18;
        ctx.fillStyle = isUp ? "rgba(38,166,154,0.9)" : "rgba(239,83,80,0.9)";
        ctx.fillRect(bx, by, mw + 12, 32);
        ctx.fillStyle = "#fff";
        ctx.fillText(main, bx + 6, by + 14);
        ctx.font = "10px monospace";
        ctx.fillText(sub, bx + 6, by + 27);

        const hc = isUp ? "#26a69a" : "#ef5350";
        dot(ctx, c0.x, c0.y, 4, hc);
        dot(ctx, c1.x, c1.y, 4, hc);
        break;
      }

      case "zone": {
        if (!c0 || !c1) break;
        const p1p = d.points[0].price, p2p = d.points[1].price;
        const isDemand = p2p > p1p;
        const zoneColor = isDemand ? "#26a69a" : "#ef5350";
        const rx = Math.min(c0.x, c1.x), ry = Math.min(c0.y, c1.y);
        const rw = Math.abs(c1.x - c0.x), rh = Math.abs(c1.y - c0.y);

        ctx.fillStyle = isDemand ? "rgba(38,166,154,0.15)" : "rgba(239,83,80,0.15)";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = zoneColor; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rx, ry); ctx.lineTo(rx + rw, ry);
        ctx.moveTo(rx, ry + rh); ctx.lineTo(rx + rw, ry + rh);
        ctx.stroke();
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(rx, ry); ctx.lineTo(rx, ry + rh);
        ctx.moveTo(rx + rw, ry); ctx.lineTo(rx + rw, ry + rh);
        ctx.stroke(); ctx.setLineDash([]);

        const lbl = isDemand ? "Demand" : "Supply";
        ctx.font = "bold 11px sans-serif";
        ctx.fillStyle = zoneColor;
        ctx.fillText(lbl, rx + 6, ry + rh - 5);
        ctx.font = "10px monospace";
        ctx.fillText(formatPrice(Math.max(p1p, p2p)), rx + rw + 4, ry + 10);
        ctx.fillText(formatPrice(Math.min(p1p, p2p)), rx + rw + 4, ry + rh);

        dot(ctx, c0.x, c0.y, 4, zoneColor);
        dot(ctx, c1.x, c1.y, 4, zoneColor);
        break;
      }

      case "rr_long":
      case "rr_short": {
        if (!c0 || !c1) break;
        const isLong = d.type === "rr_long";
        const entryP = d.points[0].price;
        const tpP    = d.points[1].price;
        const slP    = d.points.length >= 3 ? d.points[2].price : entryP - (tpP - entryP);

        const entryY = series.priceToCoordinate(entryP);
        const tpY    = series.priceToCoordinate(tpP);
        const slY    = series.priceToCoordinate(slP);
        if (entryY === null || tpY === null || slY === null) break;

        const xLeft  = Math.min(c0.x, c1.x);
        const xRight = Math.max(c0.x, c1.x);
        const boxW   = xRight - xLeft;

        const riskAmt = Math.abs(entryP - slP);
        const rratio  = riskAmt > 0 ? (Math.abs(tpP - entryP) / riskAmt).toFixed(2) : "—";
        const tpPct   = (tpP - entryP) / entryP * 100;
        const slPct   = (slP - entryP) / entryP * 100;

        ctx.fillStyle = "rgba(38,166,154,0.15)";
        ctx.fillRect(xLeft, Math.min(entryY, tpY), boxW, Math.abs(tpY - entryY));
        ctx.fillStyle = "rgba(239,83,80,0.15)";
        ctx.fillRect(xLeft, Math.min(entryY, slY), boxW, Math.abs(slY - entryY));

        ctx.strokeStyle = "#26a69a"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(xLeft, tpY); ctx.lineTo(xRight, tpY); ctx.stroke();
        ctx.strokeStyle = "#d1d4dc"; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(xLeft, entryY); ctx.lineTo(xRight, entryY); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "#ef5350"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(xLeft, slY); ctx.lineTo(xRight, slY); ctx.stroke();

        if (boxW > 150) {
          const lx = xLeft + 6;
          const tpSign = tpPct >= 0 ? "+" : "";
          const slSign = slPct >= 0 ? "+" : "";
          labelBox(ctx, `TP  ${tpSign}${tpPct.toFixed(2)}%  ${formatPrice(tpP)}`, lx, tpY    - 5, "#26a69a");
          labelBox(ctx, `Entry  ${formatPrice(entryP)}`,                           lx, entryY + 13, "#4a4e5c", "#d1d4dc");
          labelBox(ctx, `SL  ${slSign}${slPct.toFixed(2)}%  ${formatPrice(slP)}`, lx, slY    - 5, "#ef5350");
        }

        const badge = `R:R  1 : ${rratio}`;
        ctx.font = "bold 12px monospace";
        const bw = ctx.measureText(badge).width + 14;
        const badgeX = xRight - bw - 4;
        ctx.fillStyle = isLong ? "rgba(38,166,154,0.9)" : "rgba(239,83,80,0.9)";
        ctx.fillRect(badgeX, Math.min(tpY, slY) + 4, bw, 20);
        ctx.fillStyle = "#fff";
        ctx.fillText(badge, badgeX + 7, Math.min(tpY, slY) + 18);

        dot(ctx, c0.x, entryY, 4, "#d1d4dc");
        break;
      }
    }

    ctx.restore();
  }
}
