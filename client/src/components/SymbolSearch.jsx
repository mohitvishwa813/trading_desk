import { useState, useEffect, useRef, useMemo, useCallback } from 'react'

const CATEGORIES = ['All', 'Stocks', 'Futures', 'Options']

function getCategoryFilter(category) {
  switch (category) {
    case 'Stocks': return 'type=EQ'
    case 'Futures': return 'type=FUT'
    case 'Options': return 'type=OPT'
    default: return ''
  }
}

function getGroupKey(item) {
  const type = (item.instrument_type || '').toUpperCase()
  const key = item.instrument_key || ''
  if (type.includes('INDEX') || key.includes('INDEX')) return 'INDICES'
  if (type === 'EQ') return 'STOCKS'
  if (type.startsWith('FUT')) return 'FUTURES'
  if (type.startsWith('OPT')) return 'OPTIONS'
  return type
}

const GROUP_ORDER = ['STOCKS', 'FUTURES', 'OPTIONS', 'INDICES']

export default function SymbolSearch({ isOpen, onClose, onSelect }) {
  const [query, setQuery] = useState('NIFTY')
  const [category, setCategory] = useState('All')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef(null)

  // ── Debounced API search (300ms) ──
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        let url = `/api/instruments/search?q=${encodeURIComponent(query)}`
        const filter = getCategoryFilter(category)
        if (filter) url += `&${filter}`
        const res = await fetch(url)
        const data = await res.json()
        setResults(data.results || [])
      } catch {
        // silently ignore network errors
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, category])

  // reset selection on results change
  useEffect(() => {
    setSelectedIdx(0)
  }, [results])

  // reset state when opening the modal
  useEffect(() => {
    if (isOpen) {
      setQuery('NIFTY')
      setCategory('All')
      setResults([])
      setLoading(false)
      setSelectedIdx(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const commitSelect = useCallback((item) => {
    onSelect(item.tradingsymbol, item.instrument_key)
    onClose()
  }, [onSelect, onClose])

  // ── Group results by instrument type ──
  const grouped = useMemo(() => {
    const map = {}
    for (const item of results) {
      const key = getGroupKey(item)
      if (!map[key]) map[key] = []
      map[key].push(item)
    }
    // maintain a consistent group order
    const ordered = {}
    for (const g of GROUP_ORDER) {
      if (map[g]) ordered[g] = map[g]
    }
    // add any remaining groups (e.g. unknown types) sorted alphabetically
    const remaining = Object.keys(map).filter(g => !GROUP_ORDER.includes(g)).sort()
    for (const g of remaining) {
      ordered[g] = map[g]
    }
    return ordered
  }, [results])

  const flatResults = useMemo(() => {
    return Object.values(grouped).flat()
  }, [grouped])

  // ── Render helpers ──

  const handleChange = (e) => {
    setQuery(e.target.value)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(prev => Math.min(prev + 1, flatResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatResults[selectedIdx]) commitSelect(flatResults[selectedIdx])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen) return null

  // track global offset across groups for keyboard nav
  let groupOffset = 0

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
                  onClick={() => { setQuery(''); }}
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
          {/* Loading state */}
          {loading && (
            <div style={{ padding: '24px 24px', color: '#8A8A8A', textAlign: 'center', fontSize: '13px' }}>
              Searching...
            </div>
          )}

          {/* No results after search */}
          {!loading && flatResults.length === 0 && query.trim() && (
            <div style={{ padding: '32px 24px', color: '#8A8A8A', textAlign: 'center', fontSize: '14px' }}>
              No results found
            </div>
          )}

          {/* Empty state before search */}
          {!loading && !query.trim() && (
            <div style={{ padding: '32px 24px', color: '#8A8A8A', textAlign: 'center', fontSize: '14px' }}>
              Type to search symbols
            </div>
          )}

          {/* Grouped results */}
          {Object.entries(grouped).map(([group, items]) => {
            const groupStartIdx = groupOffset
            groupOffset += items.length
            return (
              <div key={group}>
                <div
                  style={{
                    padding: '8px 24px 6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.8px',
                    color: '#8A8A8A',
                    textTransform: 'uppercase',
                  }}
                >
                  {group}
                </div>
                {items.map((item, idx) => {
                  const globalIdx = groupStartIdx + idx
                  return (
                    <div
                      key={item.instrument_key}
                      onClick={() => commitSelect(item)}
                      onMouseEnter={() => setSelectedIdx(globalIdx)}
                      style={{
                        padding: '10px 24px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'background 100ms',
                        background: globalIdx === selectedIdx ? '#2A2A2A' : 'transparent',
                        borderLeft: globalIdx === selectedIdx ? '3px solid #4f9cf9' : '3px solid transparent',
                      }}
                      role="option"
                      aria-selected={globalIdx === selectedIdx}
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <div style={{ fontWeight: 600, color: '#FFFFFF', fontSize: '15px' }}>
                            {item.tradingsymbol}
                          </div>
                          {item.name && (
                            <div style={{ fontSize: '12px', color: '#8A8A8A', marginTop: '1px', maxWidth: '420px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.name}
                            </div>
                          )}
                          <div style={{ fontSize: '11px', color: '#5A5A5A', marginTop: '1px' }}>
                            {item.exchange} &middot; {item.instrument_type}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: '12px', color: '#5A5A5A', flexShrink: 0, marginLeft: '12px' }}>
                        {item.exchange}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}
          <div style={{ height: '12px' }} />
        </div>
      </div>
    </div>
  )
}
