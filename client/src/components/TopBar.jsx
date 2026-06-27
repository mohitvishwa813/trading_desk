import { useEffect, useState } from 'react'

export default function TopBar({ mode, wsConnected, activeSymbol, onToggleMode, onOpenSearch }) {
  const [time, setTime] = useState(new Date().toLocaleTimeString())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-surface border-b border-border shrink-0">
      <div className="text-sm font-bold text-accent tracking-wider">TRADE DESK</div>

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

      <div className="flex gap-1">
        <button
          className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border transition-colors ${
            mode === 'live'
              ? 'bg-green/20 text-green border-green'
              : 'bg-transparent text-muted border-border hover:border-green/50'
          }`}
          onClick={() => onToggleMode('live')}
        >
          LIVE
        </button>
        <button
          className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border transition-colors ${
            mode === 'demo'
              ? 'bg-yellow/20 text-yellow border-yellow'
              : 'bg-transparent text-muted border-border hover:border-yellow/50'
          }`}
          onClick={() => onToggleMode('demo')}
        >
          DEMO
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green' : 'bg-red'}`} />
        <span className="text-[10px] text-muted">{wsConnected ? 'Connected' : 'Disconnected'}</span>
      </div>

      <div className="text-[10px] text-muted ml-2">{time}</div>
    </div>
  )
}
