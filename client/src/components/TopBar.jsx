import { useEffect, useState } from 'react'

export default function TopBar({ mode, wsConnected, activeSymbol, onToggleMode }) {
  const [time, setTime] = useState(new Date().toLocaleTimeString())
  useEffect(() => {
    const id = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-surface border-b border-border shrink-0">
      <div className="text-sm font-bold text-accent tracking-wider">TRADE DESK</div>

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

      <div className="text-muted text-[11px]">{activeSymbol}</div>

      <div className="ml-auto flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green' : 'bg-red'}`} />
        <span className="text-[10px] text-muted">{wsConnected ? 'Connected' : 'Disconnected'}</span>
      </div>

      <div className="text-[10px] text-muted ml-2">{time}</div>
    </div>
  )
}
