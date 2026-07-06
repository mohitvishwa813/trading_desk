import { useState, useEffect } from 'react'

function getDefaultExecutionTimes(symbol) {
  const sym = (symbol || '').toUpperCase()
  if (sym.includes('BTC') || sym.includes('ETH') || sym.includes('USD') || sym.includes('USDT')) {
    return { startTime: '00:00', endTime: '23:59' }
  }
  // Commodity (MCX) e.g. CRUDEOILM, GOLD1, SILVERFUT
  if (sym.includes('CRUDE') || sym.includes('GOLD') || sym.includes('SILVER') || sym.includes('NATURALGAS')) {
    return { startTime: '09:00', endTime: '23:30' }
  }
  // Standard Indian Equity/Index
  return { startTime: '09:15', endTime: '15:30' }
}

export default function AutoTradeModal({
  isOpen,
  onClose,
  activeSymbol,
  autoTradeState, // { active: boolean, mode: 'PAPER'|'LIVE', strategyId: string, qty: number, timeframe: string, startTime: string, endTime: string }
  onStartAutoTrade, // (config) => {}
  onStopAutoTrade, // () => {}
  chartStyle = 'candles',
}) {
  const [strategies, setStrategies] = useState([])
  const [selectedStrategy, setSelectedStrategy] = useState('')
  const [qty, setQty] = useState(10)
  const [timeframe, setTimeframe] = useState('5m')
  const [mode, setMode] = useState('PAPER') // 'PAPER' | 'LIVE'
  const [startTime, setStartTime] = useState('09:15')
  const [endTime, setEndTime] = useState('15:30')

  // Fetch strategies
  useEffect(() => {
    if (!isOpen) return
    const token = localStorage.getItem('token')
    fetch('/api/strategies', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setStrategies(data)
        if (data.length > 0 && !selectedStrategy) {
          setSelectedStrategy(data[0].id)
        }
      })
      .catch(err => console.error('Failed to load strategies:', err))
  }, [isOpen])

  // Set default execution times based on activeSymbol
  useEffect(() => {
    if (isOpen && !autoTradeState?.active) {
      const defaults = getDefaultExecutionTimes(activeSymbol)
      setStartTime(defaults.startTime)
      setEndTime(defaults.endTime)
    }
  }, [isOpen, activeSymbol, autoTradeState])

  // Sync state if active
  useEffect(() => {
    if (autoTradeState?.active) {
      setSelectedStrategy(autoTradeState.strategyId || '')
      setQty(autoTradeState.qty || 10)
      setTimeframe(autoTradeState.timeframe || '5m')
      setMode(autoTradeState.mode || 'PAPER')
      setStartTime(autoTradeState.startTime || '09:15')
      setEndTime(autoTradeState.endTime || '15:30')
    }
  }, [autoTradeState, isOpen])

  if (!isOpen) return null

  const handleStart = () => {
    if (!selectedStrategy) {
      alert('Please select a strategy first.')
      return
    }
    onStartAutoTrade({
      strategyId: selectedStrategy,
      symbol: activeSymbol,
      qty,
      timeframe,
      mode,
      startTime,
      endTime,
      candleStyle: chartStyle
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-md bg-[#0a0d16] border border-[#222533] rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.5)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1b1e2a] bg-[#0c0f1b]">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${autoTradeState?.active ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${autoTradeState?.active ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            </span>
            <h3 className="text-sm font-bold text-white tracking-wide uppercase">Auto Trade Config</h3>
          </div>
          <button 
            onClick={onClose}
            className="text-muted hover:text-white transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {/* Active Symbol Display */}
          <div className="bg-[#10121f] rounded-lg p-3 border border-[#1b1e2a] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#808290] font-medium uppercase tracking-wider">Target Stock Symbol</span>
              <span className="text-sm font-bold text-emerald-400 font-mono bg-emerald-950/20 px-2.5 py-0.5 rounded border border-emerald-500/20">
                {activeSymbol || 'Select Symbol'}
              </span>
            </div>
            <div className="flex items-center justify-between border-t border-[#1b1e2a]/50 pt-2 mt-1">
              <span className="text-[11px] text-[#808290] font-medium uppercase tracking-wider">Active Candle Style</span>
              <span className="text-xs font-bold text-indigo-400 font-mono bg-indigo-950/20 px-2 py-0.5 rounded border border-indigo-500/20 capitalize">
                {((autoTradeState?.active ? autoTradeState.candleStyle : chartStyle) || 'candles').replace('_', ' ')}
              </span>
            </div>
          </div>

          {/* Strategy Select */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-[#808290] font-semibold uppercase tracking-wider block">Select Strategy</label>
            <select
              value={selectedStrategy}
              onChange={e => setSelectedStrategy(e.target.value)}
              disabled={autoTradeState?.active}
              className="w-full bg-[#0d0f19] border border-[#222533] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#7c6af7] transition-all disabled:opacity-60"
            >
              {strategies.map(strat => (
                <option key={strat.id} value={strat.id}>
                  {strat.name}
                </option>
              ))}
              {strategies.length === 0 && (
                <option value="">No strategies available</option>
              )}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Quantity */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-[#808290] font-semibold uppercase tracking-wider block">Quantity</label>
              <input
                type="number"
                min="1"
                value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                disabled={autoTradeState?.active}
                className="w-full bg-[#0d0f19] border border-[#222533] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#7c6af7] transition-all disabled:opacity-60 font-mono"
              />
            </div>

            {/* Timeframe */}
            <div className="space-y-1.5">
              <label className="text-[11px] text-[#808290] font-semibold uppercase tracking-wider block">Timeframe</label>
              <select
                value={timeframe}
                onChange={e => setTimeframe(e.target.value)}
                disabled={autoTradeState?.active}
                className="w-full bg-[#0d0f19] border border-[#222533] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#7c6af7] transition-all disabled:opacity-60"
              >
                <option value="1m">1 minute</option>
                <option value="5m">5 minutes</option>
                <option value="15m">15 minutes</option>
                <option value="1h">1 hour</option>
                <option value="1d">1 day</option>
              </select>
            </div>
          </div>

          {/* Execution Time Window */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-[#808290] font-semibold uppercase tracking-wider block">Execution Time Window</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] text-[#808290] mb-0.5">Start Time</div>
                <input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  disabled={autoTradeState?.active}
                  className="w-full bg-[#0d0f19] border border-[#222533] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#7c6af7] transition-all disabled:opacity-60 font-mono"
                />
              </div>
              <div>
                <div className="text-[10px] text-[#808290] mb-0.5">End Time</div>
                <input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  disabled={autoTradeState?.active}
                  className="w-full bg-[#0d0f19] border border-[#222533] rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-[#7c6af7] transition-all disabled:opacity-60 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Mode Selector */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-[#808290] font-semibold uppercase tracking-wider block">Execution Mode</label>
            <div className="grid grid-cols-2 gap-2 bg-[#0d0f19] border border-[#222533] rounded p-1">
              <button
                type="button"
                onClick={() => setMode('PAPER')}
                disabled={autoTradeState?.active}
                className={`py-1.5 text-xs font-bold rounded transition-all ${
                  mode === 'PAPER'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    : 'text-[#808290] hover:text-white border border-transparent'
                }`}
              >
                Paper Auto Trade
              </button>
              <button
                type="button"
                onClick={() => setMode('LIVE')}
                disabled={autoTradeState?.active}
                className={`py-1.5 text-xs font-bold rounded transition-all ${
                  mode === 'LIVE'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                    : 'text-[#808290] hover:text-white border border-transparent'
                }`}
              >
                Live Webhook
              </button>
            </div>
            <p className="text-[10px] text-muted leading-relaxed mt-1">
              {mode === 'PAPER' 
                ? 'Creates order executions internally using simulated accounts and logs performance stats.' 
                : 'Triggers live API requests directly to Make.com Webhook endpoint on every generated signal.'}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-4 border-t border-[#1b1e2a] bg-[#0c0f1b] flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded text-xs font-bold text-muted hover:text-white hover:bg-[#1a1d2e] transition-all"
          >
            Cancel
          </button>
          
          {autoTradeState?.active ? (
            <button
              type="button"
              onClick={onStopAutoTrade}
              className="px-4 py-2 rounded text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-all shadow-[0_0_12px_rgba(220,38,38,0.3)] animate-pulse"
            >
              Stop Auto Trading
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStart}
              className="px-5 py-2 rounded text-xs font-bold bg-[#7c6af7] hover:bg-[#6c58ef] text-white transition-all shadow-[0_0_12px_rgba(124,106,247,0.3)]"
            >
              Start Trading Sequence
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
