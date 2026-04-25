"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
  type MouseEventParams,
} from "lightweight-charts";
import {
  renderDrawings,
  hitTestDrawing,
  findDrawingAt,
  TOOL_POINTS,
  type Drawing,
  type DrawingType,
  type ChartPoint,
} from "@/lib/drawings";
import { renderSessions } from "@/lib/sessions";
import { renderFVGs, type FVG } from "@/lib/fvg";
import { renderTrades, type Trade } from "@/lib/trades";

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type IndicatorSeries = Record<string, { time: number; value: number }[]>;

interface Props {
  candles: Candle[];
  activeTool: DrawingType;
  drawings: Drawing[];
  onDrawingComplete: (d: Drawing) => void;
  onDrawingUpdate: (id: string, updated: Drawing) => void;
  onContextDrawing: (id: string, clientX: number, clientY: number) => void;
  drawColor: string;
  showVolume: boolean;
  activeSessions: string[];
  showFVG: boolean;
  fvgs: FVG[];
  trades: Trade[];
  replayIdx?: number;
  replayCurrentTime?: number;
  indicators?: IndicatorSeries;
}

const IND_COLORS = ["#ff9800","#2196f3","#9c27b0","#00bcd4","#4caf50","#f44336","#ffeb3b","#e91e63"];

interface HoveredBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}  ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

function fmtPrice(p: number): string {
  if (p >= 10000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1)    return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  return p.toFixed(6);
}

function fmtVol(v: number): string {
  if (v >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(2) + "K";
  return v.toFixed(2);
}

function medianOf(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

export default function Chart({
  candles,
  activeTool,
  drawings,
  onDrawingComplete,
  onDrawingUpdate,
  onContextDrawing,
  drawColor,
  showVolume,
  activeSessions,
  showFVG,
  fvgs,
  trades,
  replayIdx,
  replayCurrentTime,
  indicators,
}: Props) {
  const candleMountRef   = useRef<HTMLDivElement>(null);
  const volMountRef      = useRef<HTMLDivElement>(null);
  const oscContainerRef  = useRef<HTMLDivElement>(null);
  const overlayRef       = useRef<HTMLCanvasElement>(null);

  const candleChartRef = useRef<IChartApi | null>(null);
  const volChartRef    = useRef<IChartApi | null>(null);
  const seriesRef      = useRef<ISeriesApi<SeriesType> | null>(null);
  const volSeriesRef   = useRef<ISeriesApi<SeriesType> | null>(null);

  // Shared sync flag (used across effects)
  const isSyncingRef = useRef(false);

  // Per-oscillator pane state: name → { el, chart, unsub }
  type OscEntry = { el: HTMLDivElement; chart: IChartApi; unsub: () => void };
  const oscChartsRef = useRef(new Map<string, OscEntry>());

  // Price-scale indicator series on main chart: name → series
  const priceSeriesRef = useRef(new Map<string, ISeriesApi<SeriesType>>());

  const [hasOscillators, setHasOscillators] = useState(false);
  const [hoveredBar, setHoveredBar] = useState<HoveredBar | null>(null);

  const activeToolRef         = useRef<DrawingType>(activeTool);
  const drawColorRef          = useRef<string>(drawColor);
  const drawingsRef           = useRef<Drawing[]>(drawings);
  const candlesRef            = useRef<Candle[]>(candles);
  const activeSessionsRef     = useRef<string[]>(activeSessions);
  const showFVGRef            = useRef<boolean>(showFVG);
  const fvgsRef               = useRef<FVG[]>(fvgs);
  const tradesRef             = useRef<Trade[]>(trades);
  const replayCurrentTimeRef  = useRef<number | undefined>(replayCurrentTime);
  const onDrawingUpdateRef    = useRef(onDrawingUpdate);
  const onContextRef          = useRef(onContextDrawing);
  const pendingP1             = useRef<ChartPoint | null>(null);

  useEffect(() => { activeToolRef.current        = activeTool;       }, [activeTool]);
  useEffect(() => { drawColorRef.current         = drawColor;        }, [drawColor]);
  useEffect(() => { drawingsRef.current          = drawings;         }, [drawings]);
  useEffect(() => { candlesRef.current           = candles;          }, [candles]);
  useEffect(() => { activeSessionsRef.current     = activeSessions;   }, [activeSessions]);
  useEffect(() => { showFVGRef.current           = showFVG;          }, [showFVG]);
  useEffect(() => { fvgsRef.current              = fvgs;             }, [fvgs]);
  useEffect(() => { tradesRef.current            = trades;           }, [trades]);
  useEffect(() => { replayCurrentTimeRef.current = replayCurrentTime;}, [replayCurrentTime]);
  useEffect(() => { onDrawingUpdateRef.current   = onDrawingUpdate;  }, [onDrawingUpdate]);
  useEffect(() => { onContextRef.current         = onContextDrawing; }, [onContextDrawing]);

  const redraw = useCallback((extra?: Drawing) => {
    const canvas = overlayRef.current;
    const chart  = candleChartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series || !canvas.width || !canvas.height) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (activeSessionsRef.current.length > 0) {
      renderSessions(ctx, chart, candlesRef.current, activeSessionsRef.current);
    }

    if (showFVGRef.current && fvgsRef.current.length > 0) {
      renderFVGs(ctx, chart, series, fvgsRef.current);
    }

    const all = extra ? [...drawingsRef.current, extra] : drawingsRef.current;
    renderDrawings(ctx, all, chart, series, true);

    if (tradesRef.current.length > 0) {
      renderTrades(ctx, chart, series, tradesRef.current, replayCurrentTimeRef.current);
    }
  }, []);

  // ── Init charts ──────────────────────────────────────────────────────────
  useEffect(() => {
    const candleEl = candleMountRef.current;
    const volEl    = volMountRef.current;
    const overlay  = overlayRef.current;
    if (!candleEl || !volEl || !overlay) return;

    const sharedLayout = {
      layout: { background: { color: "#131722" }, textColor: "#d1d4dc" },
      grid:   { vertLines: { color: "#1e2433" }, horzLines: { color: "#1e2433" } },
      crosshair: { mode: CrosshairMode.Normal },
    };

    const candleChart = createChart(candleEl, {
      ...sharedLayout,
      autoSize: true,
      timeScale: { visible: false, borderColor: "#2a2e39" },
      rightPriceScale: { borderColor: "#2a2e39", scaleMargins: { top: 0.05, bottom: 0.02 } },
    });
    const candleSeries = candleChart.addSeries(CandlestickSeries, {
      upColor: "#26a69a", downColor: "#ef5350",
      borderVisible: false, wickUpColor: "#26a69a", wickDownColor: "#ef5350",
    });

    const volChart = createChart(volEl, {
      ...sharedLayout,
      autoSize: true,
      timeScale: { visible: false, borderColor: "#2a2e39" },
      rightPriceScale: { borderColor: "#2a2e39", scaleMargins: { top: 0.1, bottom: 0.02 } },
    });
    const volSeries = volChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false,
    });

    candleChartRef.current = candleChart;
    volChartRef.current    = volChart;
    seriesRef.current      = candleSeries;
    volSeriesRef.current   = volSeries;

    const onCrosshair = (param: MouseEventParams<Time>) => {
      if (!param.time || !param.seriesData?.size) { setHoveredBar(null); return; }
      const bar = param.seriesData.get(candleSeries) as
        { open: number; high: number; low: number; close: number } | undefined;
      const vol = param.seriesData.get(volSeries) as { value: number } | undefined;
      if (!bar) { setHoveredBar(null); return; }
      setHoveredBar({
        time: param.time as number,
        open: bar.open, high: bar.high, low: bar.low, close: bar.close,
        volume: vol?.value ?? 0,
      });
    };
    candleChart.subscribeCrosshairMove(onCrosshair);

    // Sync all three fixed charts + any dynamic osc charts
    const onCandleRange = () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      try {
        const r = candleChart.timeScale().getVisibleLogicalRange();
        if (r) {
          volChart.timeScale().setVisibleLogicalRange(r);
          for (const { chart } of oscChartsRef.current.values())
            chart.timeScale().setVisibleLogicalRange(r);
        }
        redraw();
      } finally {
        isSyncingRef.current = false;
      }
    };
    const onVolRange = () => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      try {
        const r = volChart.timeScale().getVisibleLogicalRange();
        if (r) {
          candleChart.timeScale().setVisibleLogicalRange(r);
          for (const { chart } of oscChartsRef.current.values())
            chart.timeScale().setVisibleLogicalRange(r);
        }
      } finally {
        isSyncingRef.current = false;
      }
    };

    candleChart.timeScale().subscribeVisibleLogicalRangeChange(onCandleRange);
    volChart.timeScale().subscribeVisibleLogicalRangeChange(onVolRange);

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        overlay.width  = Math.round(e.contentRect.width);
        overlay.height = Math.round(e.contentRect.height);
        redraw();
      }
    });
    ro.observe(candleEl);

    return () => {
      ro.disconnect();
      candleChart.timeScale().unsubscribeVisibleLogicalRangeChange(onCandleRange);
      volChart.timeScale().unsubscribeVisibleLogicalRangeChange(onVolRange);
      candleChart.unsubscribeCrosshairMove(onCrosshair);
      setHoveredBar(null);
      candleChart.remove(); volChart.remove();
      candleChartRef.current = null; volChartRef.current = null;
      seriesRef.current = null; volSeriesRef.current = null;
    };
  }, [redraw]);

  // ── Universal drag + context menu via window listeners ───────────────────
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;

    type HandleDrag = { kind: "handle"; drawingId: string; pointIndex: number; priceOnly: boolean };
    type BodyDrag   = { kind: "body";   drawingId: string; startMx: number; startMy: number; initialPoints: ChartPoint[] };
    type DragState  = HandleDrag | BodyDrag;
    let drag: DragState | null = null;

    const getCoords = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
    };

    const onMove = (e: MouseEvent) => {
      const chart  = candleChartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return;
      const { mx, my } = getCoords(e);

      if (drag) {
        const d = drawingsRef.current.find((x) => x.id === drag!.drawingId);
        if (!d) return;

        if (drag.kind === "handle") {
          const price = series.coordinateToPrice(my);
          if (price === null) return;
          const pts = [...d.points];
          if (drag.pointIndex >= pts.length) {
            pts.push({ time: pts[0].time, price });
          } else if (drag.priceOnly) {
            pts[drag.pointIndex] = { ...pts[drag.pointIndex], price };
          } else {
            const t = chart.timeScale().coordinateToTime(mx);
            if (t === null) return;
            pts[drag.pointIndex] = { time: t as number, price };
          }
          onDrawingUpdateRef.current(d.id, { ...d, points: pts });
        } else {
          const startP = series.coordinateToPrice(drag.startMy);
          const curP   = series.coordinateToPrice(my);
          if (startP === null || curP === null) return;
          const dPrice = curP - startP;

          const startT = chart.timeScale().coordinateToTime(drag.startMx);
          const curT   = chart.timeScale().coordinateToTime(mx);
          const dTime  = startT !== null && curT !== null
            ? (curT as number) - (startT as number)
            : 0;

          const pts = drag.initialPoints.map((p) => ({
            time:  p.time + dTime,
            price: p.price + dPrice,
          }));
          onDrawingUpdateRef.current(d.id, { ...d, points: pts });
        }
        redraw();
        return;
      }

      if (activeToolRef.current !== "cursor") return;
      for (const d of drawingsRef.current) {
        const hit = hitTestDrawing(d, mx, my, chart, series);
        if (hit) {
          canvas.style.pointerEvents = "auto";
          canvas.style.cursor =
            hit.kind === "handle" && hit.priceOnly ? "ns-resize" : "move";
          return;
        }
      }
      canvas.style.pointerEvents = "none";
      canvas.style.cursor = "default";
    };

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const chart  = candleChartRef.current;
      const series = seriesRef.current;
      if (!chart || !series || activeToolRef.current !== "cursor") return;
      const { mx, my } = getCoords(e);

      for (const d of drawingsRef.current) {
        const hit = hitTestDrawing(d, mx, my, chart, series);
        if (hit) {
          if (hit.kind === "handle") {
            drag = { kind: "handle", drawingId: d.id, pointIndex: hit.pointIndex, priceOnly: hit.priceOnly };
          } else {
            drag = { kind: "body", drawingId: d.id, startMx: mx, startMy: my, initialPoints: [...d.points] };
          }
          canvas.style.cursor = "move";
          e.preventDefault();
          return;
        }
      }
    };

    const onUp = () => {
      if (drag) {
        drag = null;
        if (activeToolRef.current === "cursor") {
          canvas.style.pointerEvents = "none";
          canvas.style.cursor = "default";
        }
      }
    };

    const onCtxMenu = (e: MouseEvent) => {
      const chart  = candleChartRef.current;
      const series = seriesRef.current;

      if (activeToolRef.current !== "cursor") {
        pendingP1.current = null;
        redraw();
        e.preventDefault();
        return;
      }

      if (!chart || !series) return;
      const { mx, my } = getCoords(e);
      const id = findDrawingAt(drawingsRef.current, mx, my, chart, series);
      if (id) {
        e.preventDefault();
        onContextRef.current(id, e.clientX, e.clientY);
      }
    };

    window.addEventListener("mousemove",   onMove);
    window.addEventListener("mousedown",   onDown);
    window.addEventListener("mouseup",     onUp);
    window.addEventListener("contextmenu", onCtxMenu);
    return () => {
      window.removeEventListener("mousemove",   onMove);
      window.removeEventListener("mousedown",   onDown);
      window.removeEventListener("mouseup",     onUp);
      window.removeEventListener("contextmenu", onCtxMenu);
    };
  }, [redraw]);

  // ── Load / update candle data ─────────────────────────────────────────────
  useEffect(() => {
    const cs = seriesRef.current, vs = volSeriesRef.current;
    const cc = candleChartRef.current, vc = volChartRef.current;
    if (!cs || !vs || !cc || !vc || !candles.length) return;

    const limit   = replayIdx !== undefined ? replayIdx + 1 : candles.length;
    const display = candles.slice(0, limit);
    if (!display.length) return;

    const lastClose = display[display.length - 1].close;
    const precision = lastClose >= 1000 ? 2 : lastClose >= 1 ? 4
                    : lastClose >= 0.1  ? 5 : lastClose >= 0.01 ? 6
                    : Math.min(Math.floor(-Math.log10(lastClose)) + 4, 10);
    cs.applyOptions({ priceFormat: { type: "price", precision, minMove: Math.pow(10, -precision) } });
    cs.setData(display.map(({ time, open, high, low, close }) => ({ time: time as Time, open, high, low, close })));
    vs.setData(display.map(({ time, close, open, volume }) => ({
      time: time as Time, value: volume,
      color: close >= open ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)",
    })));

    if (replayIdx === undefined) {
      cc.timeScale().fitContent();
      vc.timeScale().fitContent();
      redraw(); // explicit call: fitContent only fires range-change if range actually changed
    } else {
      redraw();
    }
  }, [candles, replayIdx, redraw]);

  useEffect(() => { redraw(); }, [drawings, activeSessions, showFVG, fvgs, trades, redraw]);

  // ── Indicator series (price-overlay + per-osc-pane) ─────────────────────
  useEffect(() => {
    const cc  = candleChartRef.current;
    const con = oscContainerRef.current;

    const destroy = () => {
      for (const s of priceSeriesRef.current.values()) {
        try { candleChartRef.current?.removeSeries(s); } catch { /* noop */ }
      }
      priceSeriesRef.current.clear();
      for (const { chart, el, unsub } of oscChartsRef.current.values()) {
        chart.timeScale().unsubscribeVisibleLogicalRangeChange(unsub);
        chart.remove();
        el.remove();
      }
      oscChartsRef.current.clear();
      setHasOscillators(false);
    };

    if (!cc || !con || !indicators || !Object.keys(indicators).length || !candles.length) {
      destroy();
      return destroy;
    }

    const medClose = medianOf(candles.map((c) => c.close));
    let colorIdx = 0;
    const sharedLayout = {
      layout: { background: { color: "#131722" }, textColor: "#d1d4dc" },
      grid:   { vertLines: { color: "#1e2433" }, horzLines: { color: "#1e2433" } },
      crosshair: { mode: CrosshairMode.Normal },
    };

    for (const [name, data] of Object.entries(indicators)) {
      if (!data.length) continue;
      const medVal = medianOf(data.map((d) => d.value));
      const ratio  = medClose > 0 ? medVal / medClose : 0;
      const isOsc  = !(ratio > 0.5 && ratio < 2.0);
      const color  = IND_COLORS[colorIdx % IND_COLORS.length]; colorIdx++;
      const seriesData = data.map((d) => ({ time: d.time as Time, value: d.value }));

      if (!isOsc) {
        const s = cc.addSeries(LineSeries, {
          color, lineWidth: 1, priceScaleId: "right",
          lastValueVisible: false, priceLineVisible: false, title: name,
        });
        s.setData(seriesData);
        priceSeriesRef.current.set(name, s);
      } else {
        // Wrapper div positions the label over the chart canvas
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "position:relative;height:100px;flex-shrink:0;border-top:1px solid #2a2e39;box-sizing:border-box;";
        const label = document.createElement("div");
        label.textContent = name;
        label.style.cssText = "position:absolute;top:4px;left:8px;z-index:1;font-size:10px;font-family:monospace;color:#9da3b0;pointer-events:none;";
        wrapper.appendChild(label);
        const chartEl = document.createElement("div");
        chartEl.style.cssText = "position:absolute;inset:0;";
        wrapper.appendChild(chartEl);
        con.appendChild(wrapper);

        const oscChart = createChart(chartEl, {
          ...sharedLayout,
          autoSize: true,
          timeScale: { visible: false, borderColor: "#2a2e39" },
          rightPriceScale: { borderColor: "#2a2e39", scaleMargins: { top: 0.1, bottom: 0.1 } },
          leftPriceScale:  { visible: false },
        });
        const s = oscChart.addSeries(LineSeries, {
          color, lineWidth: 1, priceScaleId: "right",
          lastValueVisible: true, priceLineVisible: false,
        });
        s.setData(seriesData);

        const unsub = () => {
          if (isSyncingRef.current) return;
          isSyncingRef.current = true;
          try {
            const r = oscChart.timeScale().getVisibleLogicalRange();
            if (r) {
              candleChartRef.current?.timeScale().setVisibleLogicalRange(r);
              volChartRef.current?.timeScale().setVisibleLogicalRange(r);
              for (const [, { chart: oc }] of oscChartsRef.current)
                if (oc !== oscChart) oc.timeScale().setVisibleLogicalRange(r);
            }
            redraw();
          } finally {
            isSyncingRef.current = false;
          }
        };
        oscChart.timeScale().subscribeVisibleLogicalRangeChange(unsub);
        oscChartsRef.current.set(name, { el: wrapper, chart: oscChart, unsub });
      }
    }

    setHasOscillators(oscChartsRef.current.size > 0);

    // Restore main chart viewport — adding a price-scale series can expand the
    // time axis if that series has more history than the loaded candles.
    const savedRange = cc.timeScale().getVisibleLogicalRange();
    if (savedRange) {
      cc.timeScale().setVisibleLogicalRange(savedRange);
      volChartRef.current?.timeScale().setVisibleLogicalRange(savedRange);
    }
    // Align osc charts to main chart's current viewport
    if (savedRange) {
      for (const { chart } of oscChartsRef.current.values())
        chart.timeScale().setVisibleLogicalRange(savedRange);
    }

    return destroy;
  }, [indicators, candles, redraw]);

  const getPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>): ChartPoint | null => {
    const canvas = overlayRef.current;
    const chart  = candleChartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series) return null;
    const rect  = canvas.getBoundingClientRect();
    const time  = chart.timeScale().coordinateToTime(e.clientX - rect.left);
    const price = series.coordinateToPrice(e.clientY - rect.top);
    if (time === null || price === null) return null;
    return { time: time as number, price };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { pendingP1.current = null; redraw(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redraw]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const tool = activeToolRef.current;
    if (tool === "cursor") return;
    const pt = getPoint(e);
    if (!pt) return;
    const needed = TOOL_POINTS[tool];
    if (needed === 1) {
      onDrawingComplete({ id: crypto.randomUUID(), type: tool, points: [pt], color: drawColorRef.current });
      pendingP1.current = null; redraw(); return;
    }
    if (!pendingP1.current) {
      pendingP1.current = pt;
    } else {
      onDrawingComplete({ id: crypto.randomUUID(), type: tool, points: [pendingP1.current, pt], color: drawColorRef.current });
      pendingP1.current = null; redraw();
    }
  }, [getPoint, onDrawingComplete, redraw]);

  const handleMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const tool = activeToolRef.current;
    if (tool === "cursor" || !pendingP1.current) return;
    const pt = getPoint(e);
    if (!pt) return;
    redraw({ id: "__preview__", type: tool, points: [pendingP1.current, pt], color: drawColorRef.current });
  }, [getPoint, redraw]);

  useEffect(() => { pendingP1.current = null; redraw(); }, [activeTool, redraw]);

  const isDrawing = activeTool !== "cursor";
  const awaitingSecondPoint = isDrawing && !!pendingP1.current && TOOL_POINTS[activeTool] === 2;

  return (
    <div className="relative flex flex-col w-full h-full">
      {/* Main price chart */}
      <div className="relative" style={{ flex: "4 4 0%" }}>
        <div ref={candleMountRef} className="absolute inset-0" />
        <canvas
          ref={overlayRef}
          className="absolute inset-0"
          style={{
            pointerEvents: isDrawing ? "auto" : "none",
            cursor: isDrawing ? "crosshair" : "default",
            zIndex: 10,
          }}
          onClick={handleClick}
          onMouseMove={handleMove}
        />
        {hoveredBar && (() => {
          const bull   = hoveredBar.close >= hoveredBar.open;
          const change = hoveredBar.close - hoveredBar.open;
          const pct    = hoveredBar.open !== 0 ? (change / hoveredBar.open) * 100 : 0;
          const cColor = bull ? "#26a69a" : "#ef5350";
          const sign   = change >= 0 ? "+" : "";
          return (
            <div
              className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 flex items-center gap-3 px-3 py-[3px] text-[11px] font-mono"
              style={{ background: "rgba(19,23,34,0.88)", borderTop: "1px solid #2a2e39" }}
            >
              <span style={{ color: "#9da3b0" }}>{fmtTime(hoveredBar.time)}</span>
              <span style={{ color: "#d1d4dc" }}>O&nbsp;{fmtPrice(hoveredBar.open)}</span>
              <span style={{ color: "#26a69a" }}>H&nbsp;{fmtPrice(hoveredBar.high)}</span>
              <span style={{ color: "#ef5350" }}>L&nbsp;{fmtPrice(hoveredBar.low)}</span>
              <span style={{ color: cColor }}>C&nbsp;{fmtPrice(hoveredBar.close)}</span>
              <span style={{ color: cColor }}>{sign}{fmtPrice(Math.abs(change))}&nbsp;({sign}{pct.toFixed(2)}%)</span>
              <span style={{ color: "#9da3b0" }}>Vol&nbsp;{fmtVol(hoveredBar.volume)}</span>
            </div>
          );
        })()}
      </div>

      {/* Volume pane */}
      <div
        ref={volMountRef}
        className="border-t border-[#2a2e39]"
        style={{ flex: "0.8 0.8 0%", display: showVolume ? "block" : "none" }}
      />

      {/* Dynamic per-oscillator panes container */}
      <div
        ref={oscContainerRef}
        style={{ display: hasOscillators ? "flex" : "none", flexDirection: "column", flexShrink: 0 }}
      />

      {isDrawing && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-lg bg-black/70 px-3 py-1.5 text-xs text-white backdrop-blur">
          {awaitingSecondPoint
            ? "Click to place end point  Right-click or Esc to cancel"
            : "Click to place start point"}
        </div>
      )}
    </div>
  );
}
