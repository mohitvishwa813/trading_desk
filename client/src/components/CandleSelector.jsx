import { useState, useEffect, useRef, useCallback } from 'react'

const ICONS = {
  bars: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="2" height="12" rx="0.5" fill="currentColor"/><rect x="6" y="4" width="2" height="10" rx="0.5" fill="currentColor" opacity="0.6"/><rect x="10" y="3" width="2" height="11" rx="0.5" fill="currentColor" opacity="0.6"/><rect x="14" y="5" width="2" height="9" rx="0.5" fill="currentColor" opacity="0.6"/></svg>,
  candles: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="4" width="3" height="8" rx="0.5" fill="#26a69a"/><line x1="4.5" y1="4" x2="4.5" y2="2" stroke="#26a69a" strokeWidth="1"/><line x1="4.5" y1="12" x2="4.5" y2="14" stroke="#26a69a" strokeWidth="1"/><rect x="10" y="6" width="3" height="6" rx="0.5" fill="#ef5350"/><line x1="11.5" y1="6" x2="11.5" y2="4" stroke="#ef5350" strokeWidth="1"/><line x1="11.5" y1="12" x2="11.5" y2="14" stroke="#ef5350" strokeWidth="1"/></svg>,
  hollow: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="4" width="3" height="8" rx="0.5" stroke="#26a69a" strokeWidth="1" fill="none"/><line x1="4.5" y1="4" x2="4.5" y2="2" stroke="#26a69a" strokeWidth="1"/><line x1="4.5" y1="12" x2="4.5" y2="14" stroke="#26a69a" strokeWidth="1"/><rect x="10" y="6" width="3" height="6" rx="0.5" stroke="#ef5350" strokeWidth="1" fill="#ef5350" fillOpacity="0.3"/><line x1="11.5" y1="6" x2="11.5" y2="4" stroke="#ef5350" strokeWidth="1"/><line x1="11.5" y1="12" x2="11.5" y2="14" stroke="#ef5350" strokeWidth="1"/></svg>,
  volume: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="2" height="12" rx="0.5" fill="currentColor" opacity="0.4"/><rect x="5" y="5" width="2" height="9" rx="0.5" fill="#26a69a"/><rect x="8" y="4" width="2" height="10" rx="0.5" fill="#ef5350"/><rect x="11" y="6" width="2" height="8" rx="0.5" fill="currentColor" opacity="0.4"/></svg>,
  line: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 12 L4 8 L7 10 L10 4 L13 6 L15 3" stroke="#4f9cf9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>,
  lineMarkers: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 12 L4 8 L7 10 L10 4 L13 6 L15 3" stroke="#4f9cf9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/><circle cx="4" cy="8" r="1.5" fill="#4f9cf9"/><circle cx="7" cy="10" r="1.5" fill="#4f9cf9"/><circle cx="10" cy="4" r="1.5" fill="#4f9cf9"/><circle cx="13" cy="6" r="1.5" fill="#4f9cf9"/></svg>,
  stepLine: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 12 L4 12 L4 8 L7 8 L7 10 L10 10 L10 4 L13 4 L13 6 L15 6 L15 3" stroke="#4f9cf9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>,
  area: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 12 L4 8 L7 10 L10 4 L13 6 L15 3 L15 14 L1 14 Z" fill="#4f9cf9" fillOpacity="0.2"/><path d="M1 12 L4 8 L7 10 L10 4 L13 6 L15 3" stroke="#4f9cf9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>,
  hlcArea: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M1 8 L4 4 L7 6 L10 2 L13 5 L15 1 L15 14 L1 14 Z" fill="#4f9cf9" fillOpacity="0.15"/><path d="M1 10 L4 6 L7 8 L10 3 L13 5 L15 2" stroke="#4f9cf9" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5"/><path d="M1 12 L4 8 L7 10 L10 4 L13 6 L15 3" stroke="#4f9cf9" strokeWidth="2" strokeLinecap="round" fill="none"/></svg>,
  baseline: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" opacity="0.4"/><path d="M1 10 L4 12 L7 9 L10 12 L13 10 L15 11 L15 14 L1 14 Z" fill="#26a69a" fillOpacity="0.2"/><path d="M1 6 L4 4 L7 7 L10 4 L13 6 L15 5 L15 14 L1 14 Z" fill="#ef5350" fillOpacity="0.15"/><path d="M1 10 L4 12 L7 9 L10 12 L13 10 L15 11" stroke="#26a69a" strokeWidth="1.5" strokeLinecap="round" fill="none"/><path d="M1 6 L4 4 L7 7 L10 4 L13 6 L15 5" stroke="#ef5350" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>,
  columns: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="5" width="2.5" height="7" rx="0.5" fill="#26a69a"/><rect x="5.5" y="3" width="2.5" height="9" rx="0.5" fill="#ef5350"/><rect x="9" y="7" width="2.5" height="5" rx="0.5" fill="#26a69a"/><rect x="12.5" y="2" width="2.5" height="10" rx="0.5" fill="#ef5350"/></svg>,
  highLow: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><line x1="1" y1="3" x2="15" y2="3" stroke="#26a69a" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/><line x1="1" y1="13" x2="15" y2="13" stroke="#ef5350" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/><path d="M1 6 L4 3 L7 8 L10 2 L13 5 L15 4" stroke="#26a69a" strokeWidth="1.5" strokeLinecap="round" fill="none"/><path d="M1 12 L4 9 L7 14 L10 8 L13 11 L15 10" stroke="#ef5350" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg>,
  heikinAshi: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="5" width="3" height="6" rx="0.5" fill="#26a69a" opacity="0.8"/><line x1="4.5" y1="5" x2="4.5" y2="3" stroke="#26a69a" strokeWidth="1"/><line x1="4.5" y1="11" x2="4.5" y2="13" stroke="#26a69a" strokeWidth="1"/><rect x="10" y="6" width="3" height="5" rx="0.5" fill="#ef5350" opacity="0.7"/><line x1="11.5" y1="6" x2="11.5" y2="4" stroke="#ef5350" strokeWidth="1"/><line x1="11.5" y1="11" x2="11.5" y2="13" stroke="#ef5350" strokeWidth="1"/></svg>,
  renko: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="5" height="5" rx="0.5" fill="#26a69a"/><rect x="9" y="9" width="5" height="5" rx="0.5" fill="#ef5350"/><rect x="2" y="9" width="5" height="5" rx="0.5" fill="#ef5350"/></svg>,
  lineBreak: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="3" height="12" rx="0.5" fill="#26a69a"/><rect x="7" y="5" width="3" height="9" rx="0.5" fill="#ef5350"/><rect x="12" y="8" width="3" height="6" rx="0.5" fill="#26a69a"/></svg>,
  kagi: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 14 L4 4 C4 2 6 2 6 4 L6 8 C6 10 8 10 8 8 L8 3 C8 1 10 1 10 3 L10 9 C10 11 12 11 12 9 L12 4" stroke="#4f9cf9" strokeWidth="2" strokeLinecap="round" fill="none"/><line x1="4" y1="5" x2="12" y2="5" stroke="#4f9cf9" strokeWidth="1" strokeDasharray="2 2"/></svg>,
  pointFigure: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="3" cy="3" r="1.5" fill="#26a69a"/><circle cx="7" cy="3" r="1.5" fill="#26a69a"/><circle cx="11" cy="3" r="1.5" fill="#26a69a"/><circle cx="11" cy="7" r="1.5" fill="#ef5350"/><circle cx="7" cy="7" r="1.5" fill="#ef5350"/><circle cx="3" cy="7" r="1.5" fill="#ef5350"/><circle cx="3" cy="11" r="1.5" fill="#26a69a"/><circle cx="7" cy="11" r="1.5" fill="#26a69a"/></svg>,
  range: <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="3" height="10" rx="0.5" fill="#26a69a" opacity="0.8"/><line x1="3.5" y1="3" x2="3.5" y2="1" stroke="#26a69a" strokeWidth="1"/><line x1="3.5" y1="13" x2="3.5" y2="15" stroke="#26a69a" strokeWidth="1"/><rect x="11" y="5" width="3" height="8" rx="0.5" fill="#ef5350" opacity="0.7"/><line x1="12.5" y1="5" x2="12.5" y2="3" stroke="#ef5350" strokeWidth="1"/><line x1="12.5" y1="13" x2="12.5" y2="15" stroke="#ef5350" strokeWidth="1"/></svg>,
}

const CANDLE_STYLES = [
  { category: 'Price', items: [
    { id: 'bars', name: 'Bars', icon: 'bars' },
    { id: 'candles', name: 'Candles', icon: 'candles' },
    { id: 'hollow_candles', name: 'Hollow Candles', icon: 'hollow' },
    { id: 'volume_candles', name: 'Volume Candles', icon: 'volume' },
  ]},
  { category: 'Line', items: [
    { id: 'line', name: 'Line', icon: 'line' },
    { id: 'line_markers', name: 'Line with Markers', icon: 'lineMarkers' },
    { id: 'step_line', name: 'Step Line', icon: 'stepLine' },
  ]},
  { category: 'Area', items: [
    { id: 'area', name: 'Area', icon: 'area' },
    { id: 'hlc_area', name: 'HLC Area', icon: 'hlcArea' },
    { id: 'baseline', name: 'Baseline', icon: 'baseline' },
  ]},
  { category: 'Other', items: [
    { id: 'columns', name: 'Columns', icon: 'columns' },
    { id: 'high_low', name: 'High-Low', icon: 'highLow' },
  ]},
  { category: 'Alternative', items: [
    { id: 'heikin_ashi', name: 'Heikin Ashi', icon: 'heikinAshi' },
    { id: 'renko', name: 'Renko', icon: 'renko' },
    { id: 'line_break', name: 'Line Break', icon: 'lineBreak' },
    { id: 'kagi', name: 'Kagi', icon: 'kagi' },
    { id: 'point_figure', name: 'Point & Figure', icon: 'pointFigure' },
    { id: 'range', name: 'Range', icon: 'range' },
  ]},
]

function getStyle(id) {
  for (const group of CANDLE_STYLES) {
    for (const item of group.items) {
      if (item.id === id) return item
    }
  }
  return CANDLE_STYLES[0].items[1]
}

export default function CandleSelector({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)
  const containerRef = useRef(null)
  const listRef = useRef(null)
  const current = getStyle(value)

  const flatItems = CANDLE_STYLES.flatMap(g => g.items)

  useEffect(() => {
    if (!open) return
    const idx = flatItems.findIndex(i => i.id === value)
    setSelectedIdx(idx >= 0 ? idx : 0)
  }, [open])

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[selectedIdx]
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx, open])

  const handleKey = useCallback((e) => {
    if (!open) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(prev => Math.min(prev + 1, flatItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onChange(flatItems[selectedIdx].id)
      setOpen(false)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }, [open, selectedIdx, flatItems, onChange])

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, handleKey])

  const currentIcon = ICONS[current.icon]
  const currentName = current.name

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] border border-border text-muted hover:border-accent hover:text-accent transition-colors"
        aria-label="Candle style"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="w-4 h-4">{currentIcon}</span>
        <span className="hidden sm:inline">{currentName}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed z-50 bg-[#1E1E1E] border border-[#3A3A3A] rounded-lg shadow-2xl overflow-hidden"
          style={{ width: '300px', maxHeight: 'min(75vh, 560px)' }}
          role="listbox"
          aria-label="Candle styles"
          onMouseDown={e => e.stopPropagation()}
        >
          <div
            ref={listRef}
            className="overflow-y-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#3A3A3A transparent' }}
          >
            {CANDLE_STYLES.map((group, gi) => (
              <div key={group.category}>
                {gi > 0 && (
                  <div className="flex items-center gap-3 px-4 py-1.5">
                    <span className="text-[10px] font-semibold text-muted/50 tracking-wider uppercase">{group.category}</span>
                    <div className="flex-1 h-px bg-[#2A2A2A]" />
                  </div>
                )}
                {group.items.map((item, ii) => {
                  const flatIdx = flatItems.indexOf(item)
                  const isSelected = item.id === value
                  const isHighlighted = flatIdx === selectedIdx
                  return (
                    <div
                      key={item.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => { onChange(item.id); setOpen(false) }}
                      onMouseEnter={() => setSelectedIdx(flatIdx)}
                      className="flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors duration-100"
                      style={{
                        background: isHighlighted ? '#2A2A2A' : 'transparent',
                        borderLeft: isSelected ? '3px solid #4f9cf9' : '3px solid transparent',
                      }}
                    >
                      <span className="w-4 h-4 shrink-0" style={{ color: isSelected ? '#4f9cf9' : '#D0D0D0' }}>
                        {ICONS[item.icon]}
                      </span>
                      <span className="text-[13px]" style={{ color: isSelected ? '#FFFFFF' : '#D0D0D0', fontWeight: isSelected ? 600 : 400 }}>
                        {item.name}
                      </span>
                      {item.id === 'candles' && (
                        <span className="ml-auto text-[10px] text-accent font-semibold tracking-wide">DEFAULT</span>
                      )}
                    </div>
                  )
                })}
                {gi === CANDLE_STYLES.length - 1 && <div className="h-1" />}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export { CANDLE_STYLES, ICONS, getStyle }
