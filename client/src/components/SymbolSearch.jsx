import { useState, useEffect, useRef, useMemo, useCallback } from 'react'

const INSTRUMENTS = [
  { symbol: 'NIFTY50', exchange: 'NSE', category: 'Indices', live: true },
  { symbol: 'BANKNIFTY', exchange: 'NSE', category: 'Indices', live: true },
  { symbol: 'NIFTY NEXT 50', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY MIDCAP 100', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY FINANCIAL SERVICES', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY IT', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY PHARMA', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY AUTO', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY FMCG', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY METAL', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY MEDIA', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY REALTY', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY ENERGY', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY PSU BANK', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY PRIVATE BANK', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY CONSUMER DURABLES', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY HEALTHCARE', exchange: 'NSE', category: 'Indices' },
  { symbol: 'NIFTY OIL & GAS', exchange: 'NSE', category: 'Indices' },
  { symbol: 'INDIA VIX', exchange: 'NSE', category: 'Indices' },

  { symbol: 'RELIANCE', exchange: 'NSE', category: 'Stocks', live: true },
  { symbol: 'TCS', exchange: 'NSE', category: 'Stocks', live: true },
  { symbol: 'HDFC BANK', exchange: 'NSE', category: 'Stocks', live: true },
  { symbol: 'INFY', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'ICICI BANK', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'HINDUNILVR', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'ITC', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'SBIN', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'BHARTIARTL', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'KOTAKBANK', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'BAJFINANCE', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'DMART', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'MARUTI', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'TATAMOTORS', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'TATASTEEL', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'AXISBANK', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'LT', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'WIPRO', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'HCLTECH', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'SUNPHARMA', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'CIPLA', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'DRREDDY', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'NESTLEIND', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'TITAN', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'BAJAJFINSV', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'ASIANPAINT', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'ULTRACEMCO', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'ADANIENT', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'ADANIPORTS', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'ONGC', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'NTPC', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'POWERGRID', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'M&M', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'SBILIFE', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'HDFC', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'JSW STEEL', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'TATACONSUM', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'BAJAJ-AUTO', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'EICHERMOT', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'COALINDIA', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'BRITANNIA', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'HINDALCO', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'DIVISLAB', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'GRASIM', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'HEROMOTOCO', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'APOLLOHOSP', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'TECHM', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'INDUSINDBK', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'BPCL', exchange: 'NSE', category: 'Stocks' },
  { symbol: 'HDFCLIFE', exchange: 'NSE', category: 'Stocks' },

  { symbol: 'CRUDE OIL', exchange: 'MCX', category: 'Futures', live: true },
  { symbol: 'GOLD', exchange: 'MCX', category: 'Futures' },
  { symbol: 'SILVER', exchange: 'MCX', category: 'Futures' },
  { symbol: 'NATURALGAS', exchange: 'MCX', category: 'Futures' },
  { symbol: 'COPPER', exchange: 'MCX', category: 'Futures' },
  { symbol: 'ALUMINIUM', exchange: 'MCX', category: 'Futures' },
  { symbol: 'LEAD', exchange: 'MCX', category: 'Futures' },
  { symbol: 'ZINC', exchange: 'MCX', category: 'Futures' },
]

const CATEGORIES = ['All', 'Stocks', 'Futures', 'Indices']

export default function SymbolSearch({ isOpen, onClose, onSelect }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)
  const debounceRef = useRef(null)

  const filtered = useMemo(() => {
    let list = category === 'All'
      ? INSTRUMENTS
      : INSTRUMENTS.filter(i => i.category === category)
    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter(i =>
        i.symbol.toLowerCase().includes(q) ||
        i.exchange.toLowerCase().includes(q)
      )
    }
    return list
  }, [query, category])

  useEffect(() => {
    setSelectedIdx(0)
  }, [query, category])

  const commitSelect = useCallback((item) => {
    onSelect(item.symbol)
    onClose()
  }, [onSelect, onClose])

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(prev => Math.min(prev + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIdx]) commitSelect(filtered[selectedIdx])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const handleChange = (e) => {
    const val = e.target.value
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setQuery(val), 200)
  }

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setCategory('All')
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  useEffect(() => {
    return () => clearTimeout(debounceRef.current)
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />

      <div
        className="relative w-[680px] max-w-[92vw] max-h-[80vh] flex flex-col rounded-lg overflow-hidden shadow-2xl"
        style={{ backgroundColor: '#1E1E1E' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Symbol search"
      >
        {/* ── Sticky Header ── */}
        <div className="shrink-0" style={{ borderBottom: '1px solid #2A2A2A' }}>
          <div style={{ padding: '24px 24px 0' }}>
            <h2
              className="text-4xl font-bold text-white m-0"
              style={{ fontSize: '34px', lineHeight: 1.2, letterSpacing: '-0.3px' }}
            >
              Symbol search
            </h2>

            <div style={{ position: 'relative', marginTop: '16px' }}>
              <input
                ref={inputRef}
                type="text"
                placeholder="Search symbols..."
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                aria-label="Search symbols"
                style={{
                  width: '100%', height: '48px',
                  background: '#2A2A2A',
                  border: '1px solid #3A3A3A',
                  borderRadius: '10px',
                  padding: '0 44px 0 44px',
                  fontSize: '16px',
                  color: '#FFFFFF',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 200ms',
                }}
                onFocus={e => e.target.style.borderColor = '#5A5A5A'}
                onBlur={e => e.target.style.borderColor = '#3A3A3A'}
              />
              <svg
                style={{ position: 'absolute', left: '13px', top: '14px', width: '20px', height: '20px', color: '#8A8A8A', pointerEvents: 'none' }}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {query && (
                <button
                  onClick={() => { setQuery(''); inputRef.current?.focus() }}
                  style={{
                    position: 'absolute', right: '10px', top: '10px',
                    width: '28px', height: '28px', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: 'transparent', border: 'none',
                    borderRadius: '6px', cursor: 'pointer',
                    color: '#8A8A8A', transition: 'all 150ms',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#3A3A3A'; e.currentTarget.style.color = '#FFFFFF' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#8A8A8A' }}
                  aria-label="Clear search"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            <div
              className="flex gap-1.5"
              style={{
                padding: '14px 0 14px',
                overflowX: 'auto',
                scrollbarWidth: 'thin',
                scrollbarColor: '#3A3A3A transparent',
              }}
              role="tablist"
              aria-label="Categories"
            >
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  role="tab"
                  aria-selected={category === cat}
                  onClick={() => setCategory(cat)}
                  style={{
                    height: '36px', borderRadius: '999px', padding: '0 16px',
                    border: 'none', fontSize: '14px', fontWeight: 500,
                    cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
                    transition: 'all 150ms',
                    background: category === cat ? '#FFFFFF' : '#2A2A2A',
                    color: category === cat ? '#000000' : '#D0D0D0',
                  }}
                  onMouseEnter={e => { if (category !== cat) e.currentTarget.style.background = '#3A3A3A' }}
                  onMouseLeave={e => { if (category !== cat) e.currentTarget.style.background = '#2A2A2A' }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Results ── */}
        <div className="flex-1 overflow-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3A3A3A transparent' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '32px 24px', color: '#8A8A8A', textAlign: 'center', fontSize: '14px' }}>
              No results found
            </div>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={item.symbol + item.exchange}
                onClick={() => commitSelect(item)}
                onMouseEnter={() => setSelectedIdx(idx)}
                style={{
                  padding: '10px 24px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'background 100ms',
                  background: idx === selectedIdx ? '#2A2A2A' : 'transparent',
                  borderLeft: idx === selectedIdx ? '3px solid #4f9cf9' : '3px solid transparent',
                }}
                role="option"
                aria-selected={idx === selectedIdx}
              >
                <div className="flex items-center gap-3">
                  <div>
                    <div style={{ fontWeight: 600, color: '#FFFFFF', fontSize: '15px' }}>
                      {item.symbol}
                    </div>
                    <div style={{ fontSize: '12px', color: '#8A8A8A', marginTop: '1px' }}>
                      {item.exchange} &middot; {item.category}
                    </div>
                  </div>
                  {item.live && (
                    <span style={{
                      fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px',
                      color: '#26a69a', border: '1px solid #26a69a44',
                      borderRadius: '4px', padding: '1px 6px', lineHeight: '16px',
                    }}>
                      LIVE
                    </span>
                  )}
                </div>
                <span style={{ fontSize: '12px', color: '#5A5A5A' }}>
                  {item.exchange}
                </span>
              </div>
            ))
          )}
          <div style={{ height: '12px' }} />
        </div>
      </div>
    </div>
  )
}
