import { useEffect, useState } from 'react'
import CandleSelector from './CandleSelector'

export default function TopBar({
  wsConnected,
  activeSymbol,
  onOpenSearch,
  // Multi-chart layout
  layoutMode,
  onLayoutModeChange,
  // Replay
  replayState,
  onReplayToggle,
  onReplaySpeedChange,
  onReplayPlayPause,
  onReplayStep,
  onReplayJump,
  // Watchlist
  watchlistOpen,
  onWatchlistToggle,
  // Option Chain
  hasOptions = false,
  onOpenOptionChain = () => {},
  // Style (Stitched next to Option Chain)
  chartStyle,
  onChartStyleChange,
  // Auto Trade
  autoTradeActive = false,
  onOpenAutoTradeSettings = () => {},
  onLogout,
}) {
  const [time, setTime] = useState(new Date().toLocaleTimeString())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(id)
  }, [])

  const layoutModes = [
    { id: 'single', label: '1', icon: null },
    { id: 'side_by_side', label: '||', icon: null },
    { id: 'stacked', label: '=', icon: null },
    { id: 'grid', label: '⊞', icon: null },
  ]

  const replaySpeeds = [0.5, 1, 2, 5, 10]

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border-b border-border shrink-0">
      {/* Brand */}
      <div className="text-sm font-bold text-accent tracking-wider mr-1">TRADE DESK</div>

      {/* Symbol Search Button */}
      <button
        onClick={onOpenSearch}
        className="flex items-center gap-2 px-3 py-1.5 rounded text-sm border border-border bg-[#1E1E1E] hover:border-accent hover:bg-[#252525] transition-all"
        aria-label="Search symbols"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <span className="font-semibold text-white tracking-wide">{activeSymbol}</span>
        <span className="text-[10px] text-muted/60 hidden sm:inline">NSE</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted/60">
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <kbd className="hidden md:inline text-[9px] text-muted/40 border border-border rounded px-1 py-0.5 ml-0.5">Ctrl+K</kbd>
      </button>

      {/* Option Chain Button */}
      <button
        onClick={() => onOpenOptionChain()}
        className={`px-2.5 py-1.5 rounded text-[11px] font-bold tracking-wide border transition-colors ${
          hasOptions
            ? 'bg-accent/15 text-accent border-accent/40 hover:bg-accent/30'
            : 'bg-transparent text-muted border-border hover:border-accent/30 hover:text-accent'
        }`}
        aria-label="Open option chain"
      >
        Option Chain
      </button>

      {/* Candle Style Selector */}
      {activeSymbol && chartStyle && (
        <div className="flex items-center bg-[#0d0f14]/80 border border-[#2a2e39] rounded h-[28px] px-1.5 shrink-0 select-none ml-1">
          <CandleSelector value={chartStyle} onChange={onChartStyleChange} />
        </div>
      )}

      {/* Layout Mode Switcher */}
      <div className="flex gap-0.5 border border-border rounded ml-1">
        {layoutModes.map(lm => (
          <button
            key={lm.id}
            onClick={() => onLayoutModeChange(lm.id)}
            className={`px-1.5 py-1 text-[10px] font-bold transition-colors ${
              layoutMode === lm.id
                ? 'bg-accent text-white'
                : 'bg-transparent text-muted hover:text-white hover:bg-accent/20'
            }`}
            aria-label={`Layout: ${lm.id}`}
            title={lm.id.replace(/_/g, ' ')}
          >
            {lm.label}
          </button>
        ))}
      </div>

      {/* Watchlist Toggle */}
      <button
        onClick={onWatchlistToggle}
        className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors ${
          watchlistOpen
            ? 'bg-accent/20 text-accent border-accent'
            : 'bg-transparent text-muted border-border hover:border-accent/50'
        }`}
        aria-label="Toggle watchlist"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-0.5">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        WL
      </button>

      {/* Auto Trade Trigger */}
      <button
        onClick={onOpenAutoTradeSettings}
        className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all flex items-center gap-1.5 ${
          autoTradeActive
            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.2)] animate-pulse'
            : 'bg-transparent text-muted border-border hover:border-accent/50 hover:text-white'
        }`}
        aria-label="Auto Trade Settings"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${autoTradeActive ? 'bg-emerald-400' : 'bg-muted/60'}`} />
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        Auto Trade
      </button>

      {/* Replay Controls */}
      {replayState?.active && (
        <div className="flex items-center gap-1 border border-yellow/30 rounded px-2 py-0.5 ml-1 bg-yellow/5">
          <span className="text-[9px] font-bold text-yellow mr-1 uppercase">Replay</span>
          <button
            onClick={onReplayPlayPause}
            className="px-1.5 py-0.5 rounded text-[10px] text-yellow hover:bg-yellow/20 transition-colors"
            aria-label={replayState.playing ? 'Pause' : 'Play'}
          >
            {replayState.playing ? '⏸' : '▶'}
          </button>
          <button
            onClick={() => onReplayStep(-1)}
            className="px-1 py-0.5 rounded text-[10px] text-yellow hover:bg-yellow/20 transition-colors"
            aria-label="Step backward"
          >
            ⏮
          </button>
          <button
            onClick={() => onReplayStep(1)}
            className="px-1 py-0.5 rounded text-[10px] text-yellow hover:bg-yellow/20 transition-colors"
            aria-label="Step forward"
          >
            ⏭
          </button>
          <button
            onClick={() => onReplayJump(-5)}
            className="px-1 py-0.5 rounded text-[10px] text-yellow hover:bg-yellow/20 transition-colors"
            aria-label="Jump back 5"
          >
            -5
          </button>
          <button
            onClick={() => onReplayJump(5)}
            className="px-1 py-0.5 rounded text-[10px] text-yellow hover:bg-yellow/20 transition-colors"
            aria-label="Jump forward 5"
          >
            +5
          </button>
          <select
            value={replayState.speed || 1}
            onChange={e => onReplaySpeedChange(Number(e.target.value))}
            className="bg-transparent text-yellow text-[10px] border border-yellow/30 rounded px-1 py-0.5 focus:outline-none cursor-pointer"
            aria-label="Replay speed"
          >
            {replaySpeeds.map(s => (
              <option key={s} value={s} className="bg-surface text-white">{s}x</option>
            ))}
          </select>
          <span className="text-[9px] text-yellow/70 ml-1 font-mono">
            idx: {replayState.index ?? 0}
          </span>
          <button
            onClick={onReplayToggle}
            className="px-1.5 py-0.5 rounded text-[10px] text-red hover:bg-red/20 transition-colors ml-0.5"
            aria-label="Exit replay"
          >
            ✕
          </button>
        </div>
      )}

      {/* Spacer */}
      <div className="ml-auto" />

      {/* Connection Indicator */}
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green' : 'bg-red'}`} />
        <span className="text-[10px] text-muted">{wsConnected ? 'Connected' : 'Disconnected'}</span>
      </div>

      {/* Clock */}
      <div className="text-[10px] text-muted ml-2">{time}</div>

      {/* Logout Button */}
      {onLogout && (
        <button
          onClick={onLogout}
          title="Logout"
          className="ml-3 p-1 rounded hover:bg-[#1f232e] text-[#9093a3] hover:text-[#ff4a4a] transition-all flex items-center justify-center outline-none"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      )}
    </div>
  )
}
