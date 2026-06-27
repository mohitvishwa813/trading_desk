import { useState, useRef, useEffect } from 'react'

export default function Watchlist({ isOpen, onClose, items, onItemsChange, prices, onSelectSymbol }) {
  const [newSymbol, setNewSymbol] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  const addItem = () => {
    const s = newSymbol.trim().toUpperCase()
    if (s && !items.includes(s)) {
      onItemsChange(prev => [...prev, s])
    }
    setNewSymbol('')
    inputRef.current?.focus()
  }

  const removeItem = (sym) => {
    onItemsChange(prev => prev.filter(i => i !== sym))
  }

  const totalPct = items.reduce((acc, sym) => {
    const price = prices[sym]
    if (!price) return acc
    return acc + 1
  }, 0)

  const gainers = items.filter(sym => {
    const price = prices[sym]
    return price
  })

  return (
    <div className="w-[220px] bg-surface border-r border-border flex flex-col shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="text-[11px] font-bold tracking-wider text-muted uppercase">Watchlist</div>
        <button
          onClick={onClose}
          className="text-muted/50 hover:text-muted transition-colors"
          aria-label="Close watchlist"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Add symbol */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="flex gap-1">
          <input
            ref={inputRef}
            type="text"
            placeholder="Add symbol..."
            value={newSymbol}
            onChange={e => setNewSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') addItem() }}
            className="flex-1 bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1 rounded font-mono text-[10px] focus:border-accent focus:outline-none"
          />
          <button
            onClick={addItem}
            className="px-2 py-1 rounded bg-accent text-white text-[10px] font-bold hover:opacity-85 transition-opacity"
          >
            +
          </button>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 && (
          <div className="text-[10px] text-muted/50 text-center py-6 px-3">
            No items in watchlist
          </div>
        )}
        {items.map(sym => {
          const price = prices[sym]
          const change = price ? 0 : 0 // We'd need open prices for real change
          return (
            <div
              key={sym}
              className="flex items-center justify-between px-3 py-1.5 cursor-pointer hover:bg-accent/5 transition-colors group border-b border-border/30"
              onClick={() => onSelectSymbol(sym)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-bold text-white truncate">{sym}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-bold font-mono ${price ? 'text-white' : 'text-muted/40'}`}>
                  {price !== undefined ? price.toFixed(2) : '--'}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); removeItem(sym) }}
                  className="opacity-0 group-hover:opacity-100 text-muted/40 hover:text-red transition-all"
                  aria-label={`Remove ${sym}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-border shrink-0">
        <div className="text-[9px] text-muted/50">
          {items.length} items
        </div>
      </div>
    </div>
  )
}
