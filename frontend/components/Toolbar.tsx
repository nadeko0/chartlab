"use client";

import { useState, useEffect, useRef } from "react";
import type { DrawingType } from "@/lib/drawings";

const COLORS = [
  "#2196f3", "#e53935", "#43a047", "#fb8c00",
  "#9c27b0", "#00bcd4", "#ffffff", "#ffeb3b",
];

// ── SVG icons ────────────────────────────────────────────────────────────────

const CursorIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M5 3l14 9-7.5 1.5L9 21z" />
  </svg>
);

const TrendlineIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" className="w-5 h-5">
    <circle cx="6" cy="18" r="2" fill="currentColor" stroke="none" />
    <circle cx="18" cy="6" r="2" fill="currentColor" stroke="none" />
    <line x1="7.5" y1="16.5" x2="16.5" y2="7.5" />
  </svg>
);

const RayIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <circle cx="5" cy="12" r="2" fill="currentColor" stroke="none" />
    <line x1="7" y1="12" x2="18" y2="12" />
    <polyline points="15,9 18,12 15,15" />
  </svg>
);

const HlineIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" className="w-5 h-5">
    <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="2 1.5" />
  </svg>
);

const FibIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="w-5 h-5">
    <line x1="4" y1="5"  x2="20" y2="5" />
    <line x1="4" y1="9"  x2="20" y2="9" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <line x1="4" y1="19" x2="20" y2="19" />
  </svg>
);

const MeasureIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    {/* top horizontal */}
    <line x1="4" y1="7" x2="20" y2="7" />
    {/* bottom horizontal */}
    <line x1="4" y1="17" x2="20" y2="17" />
    {/* right vertical connector with arrows */}
    <line x1="18" y1="7" x2="18" y2="17" />
    <polyline points="15,10 18,7 21,10" />
    <polyline points="15,14 18,17 21,14" />
  </svg>
);

const ZoneIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-5 h-5">
    {/* filled zone rectangle */}
    <rect x="3" y="8" width="18" height="8" rx="1" fill="currentColor" fillOpacity={0.2} />
    {/* solid top + bottom borders */}
    <line x1="3" y1="8"  x2="21" y2="8" />
    <line x1="3" y1="16" x2="21" y2="16" />
  </svg>
);

const RRLongIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="w-5 h-5">
    {/* entry (middle dashed) */}
    <line x1="3" y1="13" x2="21" y2="13" strokeDasharray="3 2" stroke="#d1d4dc" />
    {/* TP (top green) */}
    <line x1="3" y1="6" x2="21" y2="6" stroke="#26a69a" />
    {/* SL (bottom red) */}
    <line x1="3" y1="20" x2="21" y2="20" stroke="#ef5350" />
    {/* TP arrow up */}
    <polyline points="17,9 20,6 17,3" stroke="#26a69a" />
  </svg>
);

const RRShortIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="w-5 h-5">
    {/* entry (middle dashed) */}
    <line x1="3" y1="11" x2="21" y2="11" strokeDasharray="3 2" stroke="#d1d4dc" />
    {/* TP (bottom green) */}
    <line x1="3" y1="18" x2="21" y2="18" stroke="#26a69a" />
    {/* SL (top red) */}
    <line x1="3" y1="4" x2="21" y2="4" stroke="#ef5350" />
    {/* TP arrow down */}
    <polyline points="17,15 20,18 17,21" stroke="#26a69a" />
  </svg>
);

const UndoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M3 10h10a6 6 0 0 1 0 12H3" />
    <polyline points="7 6 3 10 7 14" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6M9 6V4h6v2" />
  </svg>
);

// ── Primitives ───────────────────────────────────────────────────────────────

function Tooltip({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute left-full top-1/2 ml-2.5 -translate-y-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 z-50">
      {label}
    </div>
  );
}

interface ToolBtnProps {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}

function ToolBtn({ active, onClick, title, children }: ToolBtnProps) {
  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={[
          "flex h-10 w-10 items-center justify-center rounded-xl border transition-all",
          active
            ? "border-blue-500 bg-blue-500/20 text-blue-400"
            : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:bg-white/10 hover:text-slate-200",
        ].join(" ")}
      >
        {children}
      </button>
      <Tooltip label={title} />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

interface Props {
  activeTool: DrawingType;
  drawColor: string;
  hasDrawings: boolean;
  onToolChange: (t: DrawingType) => void;
  onColorChange: (c: string) => void;
  onUndo: () => void;
  onClear: () => void;
}

type GroupId = "lines" | "rr" | "color" | null;

export default function Toolbar({
  activeTool,
  drawColor,
  hasDrawings,
  onToolChange,
  onColorChange,
  onUndo,
  onClear,
}: Props) {
  const [openGroup, setOpenGroup] = useState<GroupId>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Close flyout on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = (g: GroupId) => setOpenGroup((o) => (o === g ? null : g));

  const selectTool = (t: DrawingType) => {
    onToolChange(t);
    setOpenGroup(null);
  };

  const isLine = ["trendline", "ray", "hline"].includes(activeTool);
  const isRR   = ["rr_long", "rr_short"].includes(activeTool);

  return (
    <div
      ref={ref}
      className="absolute left-2.5 top-2.5 z-30 flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-[#1a1d27]/90 p-2 shadow-2xl backdrop-blur-md"
    >
      {/* Cursor */}
      <ToolBtn active={activeTool === "cursor"} onClick={() => selectTool("cursor")} title="Cursor (Esc)">
        <CursorIcon />
      </ToolBtn>

      <div className="my-0.5 border-t border-white/10" />

      {/* Lines group */}
      <div className="relative group">
        <button
          onClick={() => toggle("lines")}
          className={[
            "relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all",
            isLine || openGroup === "lines"
              ? "border-blue-500 bg-blue-500/20 text-blue-400"
              : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:bg-white/10 hover:text-slate-200",
          ].join(" ")}
        >
          <TrendlineIcon />
          <svg
            className={`absolute bottom-1 right-1 h-2.5 w-2.5 transition-transform ${openGroup === "lines" ? "rotate-180" : ""}`}
            viewBox="0 0 10 10" fill="none"
          >
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
        </button>
        {!openGroup && <Tooltip label="Lines" />}

        {openGroup === "lines" && (
          <div className="absolute left-full top-0 ml-3 min-w-52 rounded-2xl border border-white/10 bg-[#1a1d27]/95 p-2 shadow-2xl backdrop-blur-md">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Lines</p>
            {[
              { tool: "trendline" as DrawingType, label: "Trend Line",  Icon: TrendlineIcon },
              { tool: "ray"       as DrawingType, label: "Ray",         Icon: RayIcon       },
              { tool: "hline"     as DrawingType, label: "Horizontal",  Icon: HlineIcon     },
            ].map(({ tool, label, Icon }) => (
              <button
                key={tool}
                onClick={() => selectTool(tool)}
                className={[
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                  activeTool === tool
                    ? "bg-blue-500/20 text-blue-300"
                    : "text-slate-300 hover:bg-white/8 hover:text-white",
                ].join(" ")}
              >
                <Icon />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fibonacci */}
      <ToolBtn active={activeTool === "fib"} onClick={() => selectTool("fib")} title="Fibonacci Retracement">
        <FibIcon />
      </ToolBtn>

      {/* Measure */}
      <ToolBtn active={activeTool === "measure"} onClick={() => selectTool("measure")} title="Measure (% change)">
        <MeasureIcon />
      </ToolBtn>

      {/* Zone */}
      <ToolBtn active={activeTool === "zone"} onClick={() => selectTool("zone")} title="Supply / Demand Zone">
        <ZoneIcon />
      </ToolBtn>

      {/* R:R group */}
      <div className="relative group">
        <button
          onClick={() => toggle("rr")}
          className={[
            "relative flex h-10 w-10 items-center justify-center rounded-xl border transition-all",
            isRR || openGroup === "rr"
              ? "border-blue-500 bg-blue-500/20 text-blue-400"
              : "border-white/10 bg-white/5 text-slate-400 hover:border-white/20 hover:bg-white/10 hover:text-slate-200",
          ].join(" ")}
        >
          {activeTool === "rr_short" ? <RRShortIcon /> : <RRLongIcon />}
          <svg
            className={`absolute bottom-1 right-1 h-2.5 w-2.5 transition-transform ${openGroup === "rr" ? "rotate-180" : ""}`}
            viewBox="0 0 10 10" fill="none"
          >
            <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
          </svg>
        </button>
        {!openGroup && <Tooltip label="Risk / Reward" />}

        {openGroup === "rr" && (
          <div className="absolute left-full top-0 ml-3 min-w-52 rounded-2xl border border-white/10 bg-[#1a1d27]/95 p-2 shadow-2xl backdrop-blur-md">
            <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Risk / Reward</p>
            {[
              { tool: "rr_long"  as DrawingType, label: "Long  (entry → TP)",  Icon: RRLongIcon  },
              { tool: "rr_short" as DrawingType, label: "Short (entry → TP)",  Icon: RRShortIcon },
            ].map(({ tool, label, Icon }) => (
              <button
                key={tool}
                onClick={() => selectTool(tool)}
                className={[
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors",
                  activeTool === tool
                    ? "bg-blue-500/20 text-blue-300"
                    : "text-slate-300 hover:bg-white/8 hover:text-white",
                ].join(" ")}
              >
                <Icon />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="my-0.5 border-t border-white/10" />

      {/* Color picker */}
      <div className="relative group">
        <button
          onClick={() => toggle("color")}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-all hover:border-white/20 hover:bg-white/10"
        >
          <span
            className="h-5 w-5 rounded-full border-2 border-white/30 shadow"
            style={{ background: drawColor }}
          />
        </button>
        {!openGroup && <Tooltip label="Color" />}

        {openGroup === "color" && (
          <div className="absolute left-full top-0 ml-3 rounded-2xl border border-white/10 bg-[#1a1d27]/95 p-2.5 shadow-2xl backdrop-blur-md">
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">Color</p>
            <div className="grid grid-cols-4 gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { onColorChange(c); setOpenGroup(null); }}
                  className="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    background: c,
                    borderColor: drawColor === c ? "#fff" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="my-0.5 border-t border-white/10" />

      {/* Undo */}
      <div className="relative group">
        <button
          onClick={onUndo}
          disabled={!hasDrawings}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition-all hover:border-white/20 hover:bg-white/10 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-30"
        >
          <UndoIcon />
        </button>
        <Tooltip label="Undo" />
      </div>

      {/* Clear */}
      <div className="relative group">
        <button
          onClick={onClear}
          disabled={!hasDrawings}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition-all hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400 disabled:pointer-events-none disabled:opacity-30"
        >
          <TrashIcon />
        </button>
        <Tooltip label="Clear all" />
      </div>
    </div>
  );
}
