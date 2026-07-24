import { useEffect, useState, useRef } from 'react'
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
  onOpenHistory = () => {},
  onLogout,
  onOpenStrategyGuide = () => {},
  // Risk Manager
  riskManager,
  onSaveRiskManager,
}) {
  // Clock state
  const [time, setTime] = useState(new Date().toLocaleTimeString())
  const [profileOpen, setProfileOpen] = useState(false)
  const [riskOpen, setRiskOpen] = useState(false)
  const [riskEnabled, setRiskEnabled] = useState(false)
  const [riskMaxLoss, setRiskMaxLoss] = useState(100)
  const [riskLeft, setRiskLeft] = useState(0)

  const riskButtonRef = useRef(null)

  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(id)
  }, [])

  // Calculate dropdown coordinate dynamically to align exactly below the button
  useEffect(() => {
    if (riskOpen && riskButtonRef.current) {
      const rect = riskButtonRef.current.getBoundingClientRect()
      // Align left boundary with button left boundary
      setRiskLeft(rect.left)
    }
  }, [riskOpen])

  // Sync internal state when prop updates
  useEffect(() => {
    if (riskManager) {
      setRiskEnabled(riskManager.enabled)
      setRiskMaxLoss(riskManager.maxLoss)
    }
  }, [riskManager])

  // Auto close dropdowns on click outside
  useEffect(() => {
    if (!profileOpen && !riskOpen) return
    const handler = () => {
      setProfileOpen(false)
      setRiskOpen(false)
    }
    window.addEventListener('click', handler)
    return () => window.removeEventListener('click', handler)
  }, [profileOpen, riskOpen])

  const layoutModes = [
    { id: 'single', label: '1', icon: null },
    { id: 'side_by_side', label: '||', icon: null },
    { id: 'stacked', label: '=', icon: null },
    { id: 'grid', label: '⊞', icon: null },
  ]

  const replaySpeeds = [0.5, 1, 2, 5, 10]

  return (
    <div className="relative z-30 flex items-center gap-2 px-3 py-1.5 bg-surface border-b border-border shrink-0 overflow-x-auto scrollbar-none">
      {/* Brand */}
      <div className="text-sm font-bold text-accent tracking-wider mr-1 hidden md:block">TRADE DESK</div>

      {/* Symbol Search Button */}
      <button
        onClick={onOpenSearch}
        className="flex items-center gap-2 px-3 py-1.5 rounded text-sm border border-border bg-[#1E1E1E] hover:border-accent hover:bg-[#252525] transition-all shrink-0"
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
        className={`px-2.5 py-1.5 rounded text-[11px] font-bold tracking-wide border transition-colors shrink-0 ${
          hasOptions
            ? 'bg-accent/15 text-accent border-accent/40 hover:bg-accent/30'
            : 'bg-transparent text-muted border-border hover:border-accent/30 hover:text-accent'
        }`}
        aria-label="Open option chain"
      >
        Option <span className="hidden sm:inline">Chain</span>
      </button>

      {/* Candle Style Selector */}
      {activeSymbol && chartStyle && (
        <div className="flex items-center bg-[#0d0f14]/80 border border-[#2a2e39] rounded h-[28px] px-1.5 shrink-0 select-none ml-1">
          <CandleSelector value={chartStyle} onChange={onChartStyleChange} />
        </div>
      )}

      {/* Layout Mode Switcher */}
      <div className="hidden sm:flex gap-0.5 border border-border rounded ml-1">
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
        className={`px-2 py-1 rounded text-[10px] font-bold border transition-colors shrink-0 ${
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
        className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all flex items-center gap-1.5 shrink-0 ${
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
        Auto<span className="hidden sm:inline"> Trade</span>
      </button>

      {/* Risk Manager Trigger */}
      <div className="relative shrink-0">
        <button
          ref={riskButtonRef}
          onClick={(e) => {
            e.stopPropagation()
            setRiskOpen(!riskOpen)
          }}
          className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all flex items-center gap-1.5 shrink-0 ${
            riskEnabled
              ? 'bg-rose-950/40 text-rose-400 border-rose-500/50 shadow-[0_0_8px_rgba(239,68,68,0.2)] animate-pulse'
              : 'bg-transparent text-muted border-border hover:border-accent/50 hover:text-white'
          }`}
          aria-label="Risk Manager Settings"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${riskEnabled ? 'bg-rose-400' : 'bg-muted/60'}`} />
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Risk<span className="hidden sm:inline"> Manager</span>{riskEnabled && ` (₹${riskMaxLoss})`}
        </button>

        {riskOpen && (
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{ left: `${riskLeft}px` }}
            className="fixed w-52 bg-[#0a0d16] border border-[#222533] rounded shadow-2xl p-3.5 z-50 flex flex-col gap-3 font-sans text-xs top-[40px]"
          >
            <div className="font-bold text-slate-200 tracking-wide text-[10px] uppercase border-b border-[#1f2233] pb-1.5">
              Risk Manager Settings
            </div>

            {/* Toggle */}
            <div className="flex items-center justify-between">
              <span className="text-[#a9adc1] text-[10px]">Enable Protection</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={riskEnabled} 
                  onChange={(e) => setRiskEnabled(e.target.checked)} 
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-muted/20 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#a9adc1] after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-rose-500 peer-checked:after:bg-white border border-[#222533]" />
              </label>
            </div>

            {/* Limit Input */}
            <div className="flex flex-col gap-1">
              <span className="text-[#808290] text-[9px]">Max Cumulative Loss (₹)</span>
              <input 
                type="number" 
                value={riskMaxLoss} 
                onChange={(e) => setRiskMaxLoss(e.target.value)}
                disabled={!riskEnabled}
                className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1 rounded font-mono text-xs focus:border-accent focus:outline-none disabled:opacity-40"
                placeholder="100"
              />
            </div>

            {/* Save Button */}
            <button
              onClick={async () => {
                const finalLoss = Math.max(1, Number(riskMaxLoss) || 100)
                await onSaveRiskManager({ enabled: riskEnabled, maxLoss: finalLoss })
                setRiskMaxLoss(finalLoss)
                setRiskOpen(false)
              }}
              className="w-full py-1.5 rounded font-bold text-[10px] bg-rose-600 hover:bg-rose-500 text-white transition-colors"
            >
              Save Configuration
            </button>
          </div>
        )}
      </div>

      {/* Trade History Button */}
      <button
        onClick={onOpenHistory}
        className="px-2 py-1 rounded text-[10px] font-bold border border-border bg-transparent text-[#a9adc1] hover:border-accent hover:text-white hover:bg-accent/10 transition-all flex items-center gap-1 shrink-0"
        aria-label="Open trade history"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#808290]">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        <span className="hidden sm:inline">History</span>
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
      <div className="flex items-center gap-1.5 shrink-0">
        <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green' : 'bg-red'}`} title={wsConnected ? 'Connected' : 'Disconnected'} />
        <span className="text-[10px] text-muted hidden md:inline">{wsConnected ? 'Connected' : 'Disconnected'}</span>
      </div>

      {/* Clock */}
      <div className="text-[10px] text-muted ml-2 hidden lg:block">{time}</div>

      {/* Profile Dropdown Trigger */}
      <div className="relative ml-2 shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setProfileOpen(!profileOpen)
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[11px] font-bold text-[#a9adc1] border border-border bg-[#151922] hover:bg-[#1a1f2b] transition-all outline-none"
        >
          <div className="w-4 h-4 rounded-full bg-[#7c6af7] text-white flex items-center justify-center text-[10px] font-extrabold uppercase">
            U
          </div>
          <span className="hidden sm:inline">Profile</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted/60">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {profileOpen && (
          <div className="fixed right-3 top-[40px] w-44 bg-[#0a0d16] border border-[#222533] rounded shadow-2xl py-1 z-50 flex flex-col">
            <button
              onClick={() => {
                setProfileOpen(false)
                onOpenStrategyGuide()
              }}
              className="w-full text-left px-3.5 py-2 text-[11px] font-bold text-[#a9adc1] hover:text-white hover:bg-accent/10 transition-colors flex items-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
              Strategy Guide
            </button>
            <div className="h-[1px] bg-[#1a1d2e] my-1" />
            <button
              onClick={() => {
                setProfileOpen(false)
                onLogout()
              }}
              className="w-full text-left px-3.5 py-2 text-[11px] font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors flex items-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              Logout
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
