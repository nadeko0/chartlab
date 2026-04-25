"use client";

const SPEEDS = [0.5, 1, 2, 5, 10];

interface Props {
  currentIdx: number;
  totalCandles: number;
  currentClose?: number;
  currentTime?: number;
  isPlaying: boolean;
  speed: number;
  hasOpenTrade: boolean;
  openTradePnl?: number;
  slPct: number;
  tpPct: number;
  onPlayPause: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSeek: (idx: number) => void;
  onSpeedChange: (s: number) => void;
  onLong: () => void;
  onShort: () => void;
  onCloseTrade: () => void;
  onSlPctChange: (v: number) => void;
  onTpPctChange: (v: number) => void;
}

function formatTime(ts?: number) {
  if (!ts) return "--";
  return new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ");
}

export default function ReplayBar({
  currentIdx, totalCandles, currentClose, currentTime,
  isPlaying, speed, hasOpenTrade, openTradePnl,
  slPct, tpPct,
  onPlayPause, onStepBack, onStepForward, onSeek, onSpeedChange,
  onLong, onShort, onCloseTrade, onSlPctChange, onTpPctChange,
}: Props) {
  return (
    <div className="flex items-center gap-2 px-3 h-12 bg-[#1a1d27] border-t border-[#363a45] shrink-0 text-[#d1d4dc] select-none">

      {/* Step back */}
      <button
        onClick={onStepBack}
        disabled={currentIdx <= 0}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-30 transition-colors"
        title="Step back"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
        </svg>
      </button>

      {/* Play / Pause */}
      <button
        onClick={onPlayPause}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-[#2962ff] hover:bg-[#1a4fd4] text-white transition-colors"
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
      >
        {isPlaying
          ? <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M6 19h4V5H6zm8-14v14h4V5z"/></svg>
          : <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path d="M8 5v14l11-7z"/></svg>
        }
      </button>

      {/* Step forward */}
      <button
        onClick={onStepForward}
        disabled={currentIdx >= totalCandles - 1}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-30 transition-colors"
        title="Step forward"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path d="M6 18l8.5-6L6 6v12zM14.5 6v12h2V6h-2z"/>
        </svg>
      </button>

      {/* Speed selector */}
      <div className="flex gap-0.5 ml-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={[
              "px-1.5 h-6 text-[10px] rounded transition-colors font-mono",
              speed === s
                ? "bg-[#2962ff] text-white"
                : "text-[#787b86] hover:text-[#d1d4dc] hover:bg-white/5",
            ].join(" ")}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Scrubber */}
      <input
        type="range"
        min={0}
        max={Math.max(0, totalCandles - 1)}
        value={currentIdx}
        onChange={(e) => onSeek(Number(e.target.value))}
        className="flex-1 h-1.5 accent-[#2962ff] cursor-pointer"
      />

      {/* Timestamp + price */}
      <span className="text-[10px] text-[#787b86] font-mono whitespace-nowrap">
        {formatTime(currentTime)}
      </span>
      {currentClose !== undefined && (
        <span className="text-[11px] font-mono font-semibold min-w-[70px] text-right">
          {currentClose >= 100
            ? currentClose.toFixed(2)
            : currentClose.toFixed(4)}
        </span>
      )}

      <div className="w-px h-6 bg-[#363a45] mx-1" />

      {/* SL / TP inputs */}
      <label className="flex items-center gap-1 text-[10px]">
        <span className="text-[#ef5350] font-semibold">SL</span>
        <input
          type="number"
          value={slPct}
          min={0.1}
          step={0.1}
          onChange={(e) => onSlPctChange(Number(e.target.value))}
          className="w-12 h-6 px-1 bg-[#2a2e39] border border-[#363a45] rounded text-[#d1d4dc] text-[10px] font-mono outline-none text-right"
        />
        <span className="text-[#787b86]">%</span>
      </label>
      <label className="flex items-center gap-1 text-[10px]">
        <span className="text-[#26a69a] font-semibold">TP</span>
        <input
          type="number"
          value={tpPct}
          min={0.1}
          step={0.1}
          onChange={(e) => onTpPctChange(Number(e.target.value))}
          className="w-12 h-6 px-1 bg-[#2a2e39] border border-[#363a45] rounded text-[#d1d4dc] text-[10px] font-mono outline-none text-right"
        />
        <span className="text-[#787b86]">%</span>
      </label>

      <div className="w-px h-6 bg-[#363a45] mx-1" />

      {/* Trade buttons */}
      {!hasOpenTrade ? (
        <>
          <button
            onClick={onLong}
            className="h-7 px-3 text-xs font-semibold bg-[#26a69a] hover:bg-[#1e8f84] text-white rounded transition-colors"
          >
            Long
          </button>
          <button
            onClick={onShort}
            className="h-7 px-3 text-xs font-semibold bg-[#ef5350] hover:bg-[#d93c3a] text-white rounded transition-colors"
          >
            Short
          </button>
        </>
      ) : (
        <button
          onClick={onCloseTrade}
          className={[
            "h-7 px-3 text-xs font-semibold rounded transition-colors text-white whitespace-nowrap",
            (openTradePnl ?? 0) >= 0
              ? "bg-[#26a69a] hover:bg-[#1e8f84]"
              : "bg-[#ef5350] hover:bg-[#d93c3a]",
          ].join(" ")}
        >
          Close{openTradePnl !== undefined
            ? ` ${openTradePnl >= 0 ? "+" : ""}${openTradePnl.toFixed(2)}%`
            : ""}
        </button>
      )}
    </div>
  );
}
