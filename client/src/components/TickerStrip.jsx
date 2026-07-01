import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function TickerStrip({
  instruments,
  prices,
  openPrices,
  activeSymbol,
  onSelect,
  onItemsChange,
}) {
  const [editOpen, setEditOpen] = useState(false)
  const [newSymbol, setNewSymbol] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)

  const editRef = useRef(null)
  const editBtnRef = useRef(null)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  // Position the portal popup relative to the edit button screen coordinates
  useEffect(() => {
    if (editOpen && editBtnRef.current) {
      const rect = editBtnRef.current.getBoundingClientRect()
      setCoords({
        top: rect.bottom + window.scrollY + 6,
        left: rect.right + window.scrollX - 200 // Align right edge of popup with right edge of button (200px width)
      })
    }
  }, [editOpen, instruments])

  // Drag and drop states
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  // Scroll arrows state
  const [showLeftArrow, setShowLeftArrow] = useState(false)
  const [showRightArrow, setShowRightArrow] = useState(false)
  const scrollRef = useRef(null)

  const updateArrows = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current
      setShowLeftArrow(scrollLeft > 2)
      setShowRightArrow(scrollLeft + clientWidth < scrollWidth - 2)
    }
  }

  // Monitor scroll positioning to toggle arrows
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      updateArrows()
      el.addEventListener('scroll', updateArrows)
      window.addEventListener('resize', updateArrows)

      // Periodically poll to capture late price updates changing container dimensions
      const timer = setInterval(updateArrows, 500)

      return () => {
        el.removeEventListener('scroll', updateArrows)
        window.removeEventListener('resize', updateArrows)
        clearInterval(timer)
      }
    }
  }, [instruments, prices]) // Trigger update on content shifts

  // Autocomplete search effect
  useEffect(() => {
    if (!newSymbol.trim()) {
      setSearchResults([])
      return
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const res = await fetch(`/api/instruments/search?q=${encodeURIComponent(newSymbol)}`)
        const data = await res.json()
        setSearchResults(data.results || [])
      } catch {
        setSearchResults([])
      } finally {
        setSearchLoading(false)
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [newSymbol])

  // Close modal on click outside
  useEffect(() => {
    function clickOutside(e) {
      if (
        editRef.current &&
        !editRef.current.contains(e.target) &&
        editBtnRef.current &&
        !editBtnRef.current.contains(e.target)
      ) {
        setEditOpen(false)
        setNewSymbol('')
        setSearchResults([])
      }
    }
    if (editOpen) {
      document.addEventListener('mousedown', clickOutside)
    }
    return () => document.removeEventListener('mousedown', clickOutside)
  }, [editOpen])

  // Drag and Drop Event Handlers
  const handleDragStart = (e, idx) => {
    setDraggedIndex(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.target.style.opacity = '0.5'
  }

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1'
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  const handleDragOver = (e, idx) => {
    e.preventDefault()
    setDragOverIndex(idx)
  }

  const handleDrop = (e, idx) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === idx) return
    const updated = [...instruments]
    const [removed] = updated.splice(draggedIndex, 1)
    updated.splice(idx, 0, removed)
    onItemsChange(updated)
  }

  const handleSelectSearchResult = (item) => {
    let s = item.tradingsymbol.toUpperCase().replace(/[\s_-]/g, '')
    if (s === 'NIFTY50') s = 'NIFTY'
    if (s === 'STATEBANK' || s === 'STATEBANKOFINDIA') s = 'SBIN'

    // Enforce correct symbol for display
    let name = item.tradingsymbol
    if (s === 'NIFTY') name = 'NIFTY'
    if (s === 'SBIN') name = 'SBIN'

    if (instruments.some(i => (typeof i === 'string' ? i : i.symbol) === name)) return
    if (instruments.length >= 6) return // Enforce max 6 limit!

    onItemsChange([...instruments, { symbol: name, key: item.instrument_key }])
    setNewSymbol('')
    setSearchResults([])
  }

  const handleRemove = (sym) => {
    if (instruments.length <= 1) return // Enforce at least 1 item is always present!
    onItemsChange(instruments.filter(i => (typeof i === 'string' ? i : i.symbol) !== sym))
  }

  return (
    <div className="relative flex items-center bg-[#0d0f14]/80 border border-[#2a2e39] rounded h-[28px] max-w-[660px] w-fit shrink-0 select-none pl-1 pr-0">

      {/* Left Scroll Button - Highlighted & Floating */}
      {showLeftArrow && (
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: -110, behavior: 'smooth' })}
          className="absolute left-[3px] top-1/2 -translate-y-1/2 h-[20px] w-[18px] flex items-center justify-center text-accent hover:text-white bg-[#1a1f2c] border border-accent/40 hover:bg-accent hover:border-accent transition-all z-20 font-black rounded shadow-[0_0_8px_rgba(79,156,249,0.3)] text-[15px] cursor-pointer"
          aria-label="Scroll left"
        >
          ‹
        </button>
      )}

      {/* Scrollable list */}
      <div
        ref={scrollRef}
        className="flex items-center gap-3 overflow-x-auto h-full scrollbar-none py-1 pl-1 flex-1"
        style={{ scrollBehavior: 'smooth' }}
      >
        {instruments.map((item, idx) => {
          const sym = typeof item === 'string' ? item : item.symbol
          const key = typeof item === 'string' ? undefined : item.key

          let resolvedSymbol = sym.toUpperCase().replace(/[\s_-]/g, '')
          if (resolvedSymbol === 'NIFTY50') resolvedSymbol = 'NIFTY'
          if (resolvedSymbol === 'STATEBANK' || resolvedSymbol === 'STATEBANKOFINDIA') resolvedSymbol = 'SBIN'

          const price = prices[key] || prices[resolvedSymbol] || prices[sym]
          const open = openPrices[key] || openPrices[resolvedSymbol] || openPrices[sym] || price
          const change = price ? price - open : 0
          const changePct = open && Number.isFinite(open) && open !== 0 ? ((change / open) * 100).toFixed(2) : '0.00'
          const dirColor = change >= 0 ? 'text-[#26a69a]' : 'text-[#ef5350]'
          const isActive = activeSymbol === sym

          const isOver = dragOverIndex === idx

          return (
            <div
              key={sym}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              onDrop={(e) => handleDrop(e, idx)}
              onClick={() => onSelect(sym, key)}
              className={`flex items-center gap-1 text-[10px] font-bold cursor-grab active:cursor-grabbing select-none transition-all px-1.5 py-0.5 rounded shrink-0 ${isActive ? 'bg-accent/15 text-accent' : 'text-[#e2e8f0] hover:bg-[#1E1E1E]'
                } ${isOver ? 'border border-dashed border-accent/60 scale-105 bg-[#1E1E1E]' : ''}`}
            >
              {/* Drag handles indicator */}
              <span className="text-muted/40 text-[9px] mr-0.5 font-normal">::</span>
              <span>{sym}</span>
              <span className="font-mono">{price !== undefined ? price.toFixed(1) : '--'}</span>
              <span className={`font-mono text-[9px] ${dirColor}`}>
                ({changePct}%)
              </span>
            </div>
          )
        })}
        {/* Invisible spacer to prevent content from going behind right absolute buttons on full scroll */}
        <div className="w-12 shrink-0 h-1" />
      </div>

      {/* Right Scroll Button - Highlighted & Floating */}
      {showRightArrow && (
        <button
          onClick={() => scrollRef.current?.scrollBy({ left: 110, behavior: 'smooth' })}
          className="absolute right-[24px] top-1/2 -translate-y-1/2 h-[20px] w-[18px] flex items-center justify-center text-accent hover:text-white bg-[#1a1f2c] border border-accent/40 hover:bg-accent hover:border-accent transition-all z-20 font-black rounded shadow-[0_0_8px_rgba(79,156,249,0.3)] text-[15px] cursor-pointer"
          aria-label="Scroll right"
        >
          ›
        </button>
      )}

      {/* Edit Button */}
      <button
        ref={editBtnRef}
        onClick={() => setEditOpen(!editOpen)}
        className="p-1 text-muted/60 hover:text-white transition-colors border-l border-[#2a2e39] h-full flex items-center justify-center shrink-0 ml-auto rounded-r hover:bg-[#1a1f2c] z-10 w-[22px]"
        title="Edit Ticker Items"
        aria-label="Edit ticker items"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>

      {/* Floating Edit Popup Modal — rendered via Portal to prevent layout clipping */}
      {editOpen && createPortal(
        <div
          ref={editRef}
          className="fixed bg-[#131722] border border-[#2a2e39] rounded shadow-2xl p-2.5 z-[9999] text-white pointer-events-auto"
          style={{
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: '200px',
          }}
        >
          <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-2 flex justify-between items-center select-none">
            <span>Edit Ticker (Max 6)</span>
            <span className="text-[9px] font-mono font-normal normal-case">{instruments.length}/6</span>
          </div>

          {/* List */}
          <div className="flex flex-col gap-1 max-h-[140px] overflow-y-auto mb-2 pr-0.5 scrollbar-none">
            {instruments.map(item => {
              const symName = typeof item === 'string' ? item : item.symbol
              return (
                <div key={symName} className="flex items-center justify-between bg-[#0d0f14] px-2 py-1 rounded text-[10px] font-mono select-none">
                  <span className="truncate pr-1">{symName}</span>
                  {instruments.length > 1 ? (
                    <button
                      onClick={() => handleRemove(symName)}
                      className="text-[#ef5350] hover:text-[#ff6b6b] transition-colors font-bold px-1"
                    >
                      ✕
                    </button>
                  ) : (
                    <span className="text-muted/30 font-bold px-1 cursor-not-allowed" title="At least one item must remain in ticker">
                      ✕
                    </span>
                  )}
                </div>
              )
            })}
            {instruments.length === 0 && (
              <div className="text-[9px] text-muted italic text-center py-2 select-none">No items</div>
            )}
          </div>

          {/* Input Form with Autocomplete */}
          {instruments.length < 6 && (
            <div className="relative mt-2">
              <input
                type="text"
                placeholder="SEARCH STOCK..."
                value={newSymbol}
                onChange={e => setNewSymbol(e.target.value)}
                className="w-full bg-[#0d0f14] border border-[#2a2e39] text-white px-1.5 py-1 rounded font-mono text-[9px] focus:border-accent focus:outline-none uppercase"
              />

              {/* Autocomplete Dropdown */}
              {newSymbol.trim() && (
                <div className="absolute left-0 right-0 mt-1 max-h-[160px] overflow-y-auto bg-[#0d0f14] border border-[#2a2e39] rounded shadow-2xl z-50 scrollbar-none">
                  {searchLoading && (
                    <div className="text-[9px] text-muted p-2 text-center">Searching...</div>
                  )}
                  {!searchLoading && searchResults.length === 0 && (
                    <div className="text-[9px] text-muted p-2 text-center">No results</div>
                  )}
                  {!searchLoading && searchResults.map(item => (
                    <div
                      key={item.instrument_key}
                      onClick={() => handleSelectSearchResult(item)}
                      className="px-2 py-1.5 text-[9px] cursor-pointer hover:bg-accent/15 border-b border-[#2a2e39]/30 last:border-b-0 text-left"
                    >
                      <div className="font-bold text-white truncate">{item.tradingsymbol}</div>
                      <div className="text-[8px] text-muted truncate">{item.name || item.exchange}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
