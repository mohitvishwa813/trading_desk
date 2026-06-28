import { useState, useEffect, useRef, useMemo, useCallback } from 'react'

function fmtExpiry(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getDate())} ${months[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`
}

function fmtNum(n) {
  if (n == null) return '--'
  if (Math.abs(n) >= 1e7) return (n / 1e7).toFixed(1) + 'Cr'
  if (Math.abs(n) >= 1e5) return (n / 1e5).toFixed(1) + 'L'
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  if (Number.isInteger(n)) return n.toLocaleString()
  return n.toFixed(1)
}

function fmtChange(n) {
  if (n == null) return '--'
  const s = n >= 0 ? '+' : ''
  if (Math.abs(n) >= 1e7) return s + (n / 1e7).toFixed(1) + 'Cr'
  if (Math.abs(n) >= 1e5) return s + (n / 1e5).toFixed(1) + 'L'
  if (Math.abs(n) >= 1e3) return s + (n / 1e3).toFixed(1) + 'K'
  return s + n
}

function fmtPct(n) {
  if (n == null) return '--'
  return (n * 100).toFixed(1)
}

function fmtGreek(n) {
  if (n == null) return '--'
  return Number(n).toFixed(2)
}

function ChartIcon({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="opacity-0 group-hover:opacity-100 transition-opacity duration-100 p-0.5 rounded hover:bg-accent/30 text-muted hover:text-accent"
      title="Load into chart"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    </button>
  )
}

function SkeletonRow({ w1, w2, w3, w4 }) {
  return (
    <tr className="border-b border-border/15">
      {[w1 || 40, w2 || 35, w3 || 30, 45, 30, 25, 25, 25, 25].map((w, i) => (
        <td key={i} className="px-1 py-2"><div className="h-2.5 rounded bg-[#2A2A2A] animate-pulse" style={{ width: w + '%', marginLeft: 'auto' }} /></td>
      ))}
      <td className="px-1 py-2"><div className="h-2.5 w-12 rounded bg-[#2A2A2A] animate-pulse mx-auto" /></td>
      {[25, 25, 25, 25, 30, 45, 30, 35, 40].map((w, i) => (
        <td key={i + 10} className="px-1 py-2"><div className="h-2.5 rounded bg-[#2A2A2A] animate-pulse" style={{ width: w + '%' }} /></td>
      ))}
    </tr>
  )
}

export default function OptionChain({
  isOpen = false,
  onClose = () => {},
  activeSymbol = '',
  tickCache = {},
  onLoadContract = () => {},
  onSubscribeKeys = () => {},
  onQuickBuy = () => {},
}) {
  const [expiries, setExpiries] = useState([])
  const [selectedExpiry, setSelectedExpiry] = useState('')
  const [chainData, setChainData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [selectedStrike, setSelectedStrike] = useState(null)
  const prevOiRef = useRef({})
  const chainVersionRef = useRef(0)

  const panelMin = 480
  const panelMax = 1200
  const [panelWidth, setPanelWidth] = useState(() => {
    try { return parseInt(localStorage.getItem('ocPanelWidth') || '740', 10) } catch { return 740 }
  })
  const [panelResizing, setPanelResizing] = useState(false)

  useEffect(() => { localStorage.setItem('ocPanelWidth', panelWidth.toString()) }, [panelWidth])

  const startResize = useCallback((e) => {
    e.preventDefault()
    setPanelResizing(true)
  }, [])

  useEffect(() => {
    if (!panelResizing) return
    const onMove = (e) => {
      const cx = e.touches ? e.touches[0].clientX : e.clientX
      const w = Math.max(panelMin, Math.min(panelMax, window.innerWidth - cx))
      setPanelWidth(w)
    }
    const onUp = () => setPanelResizing(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onUp)
    }
  }, [panelResizing])

  const spotPrice = tickCache[activeSymbol]?.ltp || 0

  useEffect(() => {
    if (!activeSymbol) { setExpiries([]); setSelectedExpiry(''); setChainData([]); return }
    setSelectedStrike(null)
    setChainData([])
    setError(null)
    fetch(`/api/optionchain/${encodeURIComponent(activeSymbol)}/expiries`)
      .then(r => r.json())
      .then(data => {
        const exps = data.expiries || []
        setExpiries(exps)
        if (exps.length > 0) setSelectedExpiry(exps[0])
      })
      .catch(() => setError('Failed to load expiries'))
  }, [activeSymbol])

  useEffect(() => {
    if (!activeSymbol || !selectedExpiry) return
    setLoading(true)
    setError(null)
    setSelectedStrike(null)
    const version = ++chainVersionRef.current
    fetch(`/api/optionchain/${encodeURIComponent(activeSymbol)}/${selectedExpiry}`)
      .then(r => r.json())
      .then(data => {
        if (version !== chainVersionRef.current) return
        setChainData(data.chain || [])
        setLoading(false)
      })
      .catch(() => {
        if (version === chainVersionRef.current) { setLoading(false); setError('Failed to load chain') }
      })
  }, [activeSymbol, selectedExpiry])

  useEffect(() => {
    if (!onSubscribeKeys || chainData.length === 0) return
    const keys = []
    for (const row of chainData) {
      if (row.ce?.instrument_key) keys.push(row.ce.instrument_key)
      if (row.pe?.instrument_key) keys.push(row.pe.instrument_key)
    }
    onSubscribeKeys(keys)
  }, [chainData, onSubscribeKeys])

  const enrichedChain = useMemo(() => {
    return chainData.map(row => {
      const ceTick = row.ce ? tickCache[row.ce.tradingsymbol] : null
      const peTick = row.pe ? tickCache[row.pe.tradingsymbol] : null
      const ce = row.ce ? {
        ...row.ce, ltp: ceTick?.ltp ?? row.ce.ltp, oi: ceTick?.oi, iv: ceTick?.iv,
        volume: ceTick?.volume, greeks: ceTick?.greeks,
      } : null
      const pe = row.pe ? {
        ...row.pe, ltp: peTick?.ltp ?? row.pe.ltp, oi: peTick?.oi, iv: peTick?.iv,
        volume: peTick?.volume, greeks: peTick?.greeks,
      } : null
      return { ...row, ce, pe }
    })
  }, [chainData, tickCache])

  const chainWithChangeOi = useMemo(() => {
    if (!isOpen || enrichedChain.length === 0) return enrichedChain
    const prev = prevOiRef.current
    return enrichedChain.map(row => {
      const r = { ...row }
      for (const side of ['ce', 'pe']) {
        if (!r[side] || r[side].oi == null) continue
        const key = r[side].instrument_key
        if (prev[key] === undefined) prev[key] = r[side].oi
        r[side] = { ...r[side], changeOi: r[side].oi - prev[key] }
      }
      return r
    })
  }, [isOpen, enrichedChain])

  const atmStrike = useMemo(() => {
    if (spotPrice > 0 && chainWithChangeOi.length > 0) {
      let closest = chainWithChangeOi[0].strike
      let minDiff = Math.abs(closest - spotPrice)
      for (const row of chainWithChangeOi) {
        const diff = Math.abs(row.strike - spotPrice)
        if (diff < minDiff) { minDiff = diff; closest = row.strike }
      }
      return closest
    }
    if (chainWithChangeOi.length === 0) return null
    return chainWithChangeOi[Math.floor(chainWithChangeOi.length / 2)]?.strike || null
  }, [chainWithChangeOi, spotPrice])

  const pcr = useMemo(() => {
    let ceOi = 0; let peOi = 0
    for (const row of chainWithChangeOi) {
      if (row.ce?.oi != null) ceOi += row.ce.oi
      if (row.pe?.oi != null) peOi += row.pe.oi
    }
    return ceOi > 0 ? (peOi / ceOi).toFixed(2) : '--'
  }, [chainWithChangeOi])

  const loadContract = useCallback((tradingsymbol, instrumentKey) => {
    onLoadContract(tradingsymbol, instrumentKey)
  }, [onLoadContract])

  const colNum = 'px-1 py-1 text-right text-[10px] font-mono truncate'
  const colNumLeft = 'px-1 py-1 text-left text-[10px] font-mono truncate'
  const colHead = 'px-1 py-1 text-[9px] font-semibold text-muted uppercase tracking-wider'

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      )}
      <div
        className="fixed top-0 right-0 z-50 h-full bg-[#1E1E1E] border-l border-border flex flex-col"
        style={{
          width: panelWidth,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: panelResizing ? 'none' : 'transform 220ms ease',
        }}
      >
        <div
          className={`absolute left-0 top-0 bottom-0 w-[5px] cursor-col-resize z-10 transition-colors duration-150 ${
            panelResizing ? 'bg-accent/60' : 'hover:bg-accent/30'
          }`}
          onMouseDown={startResize}
          onTouchStart={startResize}
        />

        <div className="shrink-0 border-b border-border">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-white tracking-wide">{activeSymbol}</span>
              <span className="text-[10px] text-muted">
                Spot: <span className="text-accent font-mono font-semibold">{spotPrice ? spotPrice.toFixed(2) : '--'}</span>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-muted">
                PCR: <span className="text-white font-mono font-semibold">{pcr}</span>
              </span>
              <button onClick={onClose} className="text-muted/50 hover:text-white transition-colors p-1" aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex gap-1.5 px-4 pb-2.5 overflow-x-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3A3A3A transparent' }}>
            {expiries.map(exp => (
              <button
                key={exp}
                onClick={() => { setSelectedExpiry(exp); setSelectedStrike(null) }}
                style={{
                  padding: '4px 12px', borderRadius: '999px', border: 'none',
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  background: exp === selectedExpiry ? '#4f9cf9' : '#2A2A2A',
                  color: exp === selectedExpiry ? '#fff' : '#888',
                  transition: 'all 120ms',
                }}
              >
                {fmtExpiry(exp)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto will-change-scroll" style={{ scrollbarWidth: 'thin', scrollbarColor: '#3A3A3A transparent' }}>
          {loading && (
            <table className="w-full text-[10px] font-mono">
              <thead><tr className="border-b border-border/40 text-muted">
                {['OI','Chg','Vol','LTP','IV','Δ','Γ','Θ','V'].map(h => (
                  <th key={h} className={colHead}>{h}</th>
                ))}
                <th className="px-1 py-1 w-[60px]"></th>
                {['V','Θ','Γ','Δ','IV','LTP','Vol','Chg','OI'].map(h => (
                  <th key={h} className={colHead}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {[...Array(10)].map((_, i) => <SkeletonRow key={i} />)}
              </tbody>
            </table>
          )}
          {!loading && error && (
            <div className="flex items-center justify-center py-16 text-[11px] text-red">{error}</div>
          )}
          {!loading && !error && chainWithChangeOi.length === 0 && (
            <div className="flex items-center justify-center py-16 text-[11px] text-muted">No options data available for {activeSymbol}</div>
          )}

          {!loading && !error && chainWithChangeOi.length > 0 && (
            <table className="w-full text-[10px] font-mono">
              <thead className="sticky top-0 z-10" style={{ backgroundColor: '#1E1E1E' }}>
                <tr className="border-b border-border/60">
                  <th colSpan={10} className="text-[9px] text-accent uppercase tracking-wider px-1 py-1.5 text-center font-bold">CALLS</th>
                  <th className="sticky z-20 px-1 py-1.5 text-center font-bold text-white text-[9px] bg-[#1E1E1E]" style={{ left: 0 }}>STRIKE</th>
                  <th colSpan={10} className="text-[9px] text-red uppercase tracking-wider px-1 py-1.5 text-center font-bold">PUTS</th>
                </tr>
                <tr className="border-b border-border/40 text-muted">
                  <th className={colHead}></th>
                  <th className={colHead}>OI</th>
                  <th className={colHead}>Chg</th>
                  <th className={colHead}>Vol</th>
                  <th className={colHead}>LTP</th>
                  <th className={colHead}>IV</th>
                  <th className={colHead}>Δ</th>
                  <th className={colHead}>Γ</th>
                  <th className={colHead}>Θ</th>
                  <th className={colHead}>V</th>
                  <th className="sticky z-20 px-1 py-1 bg-[#1E1E1E]" style={{ left: 0, width: 60, minWidth: 60 }}></th>
                  <th className={colHead}>V</th>
                  <th className={colHead}>Θ</th>
                  <th className={colHead}>Γ</th>
                  <th className={colHead}>Δ</th>
                  <th className={colHead}>IV</th>
                  <th className={colHead}>LTP</th>
                  <th className={colHead}>Vol</th>
                  <th className={colHead}>Chg</th>
                  <th className={colHead}>OI</th>
                  <th className={colHead}></th>
                </tr>
              </thead>
              <tbody>
                {chainWithChangeOi.map((row, idx) => {
                  const atm = row.strike === atmStrike
                  const sel = row.strike === selectedStrike
                  const ceItm = spotPrice > 0 && row.strike < spotPrice
                  const peItm = spotPrice > 0 && row.strike > spotPrice
                  let bgClass = ''
                  if (atm) bgClass = 'bg-accent/8'
                  else if (ceItm && idx % 2 === 1) bgClass = 'bg-green/5'
                  else if (peItm && idx % 2 === 1) bgClass = 'bg-red/5'
                  else if (ceItm) bgClass = 'bg-green/3'
                  else if (peItm) bgClass = 'bg-red/3'
                  else if (idx % 2 === 1) bgClass = 'bg-[#1A1A1A]'
                  const ceItmClass = ceItm ? 'bg-green/5' : ''
                  const peItmClass = peItm ? 'bg-red/5' : ''
                  return (
                    <tr
                      key={row.strike}
                      onClick={() => setSelectedStrike(prev => prev === row.strike ? null : row.strike)}
                      className={`group border-b border-border/15 transition-colors cursor-pointer select-none ${bgClass} ${
                        sel ? 'ring-1 ring-inset ring-accent/50' : ''
                      } hover:bg-accent/8`}
                    >
                      <td className={`${colNum} w-0`}>
                        <ChartIcon onClick={(e) => { e.stopPropagation(); if (row.ce) loadContract(row.ce.tradingsymbol, row.ce.instrument_key) }} />
                      </td>
                      <td className={`${colNum} text-white`}>{fmtNum(row.ce?.oi)}</td>
                      <td className={`${colNum} ${(row.ce?.changeOi || 0) >= 0 ? 'text-green' : 'text-red'}`}>{fmtChange(row.ce?.changeOi)}</td>
                      <td className={`${colNum} text-muted`}>{fmtNum(row.ce?.volume)}</td>
                      <td className={`${colNum} ${ceItm ? 'text-green' : 'text-green/80'}`}>{fmtNum(row.ce?.ltp)}</td>
                      <td className={`${colNum} text-muted`}>{fmtPct(row.ce?.iv)}</td>
                      <td className={`${colNum} text-muted`}>{fmtGreek(row.ce?.greeks?.delta)}</td>
                      <td className={`${colNum} text-muted`}>{fmtGreek(row.ce?.greeks?.gamma)}</td>
                      <td className={`${colNum} text-muted`}>{fmtGreek(row.ce?.greeks?.theta)}</td>
                      <td className={`${colNum} text-muted`}>{fmtGreek(row.ce?.greeks?.vega)}</td>

                      <td className={`sticky z-10 px-1 py-1 text-center font-bold text-xs ${
                        atm ? 'text-accent' : 'text-white'
                      } ${ceItmClass || peItmClass || ''}`} style={{ left: 0 }}>{row.strike > 0 ? row.strike : '--'}</td>

                      <td className={`${colNumLeft} text-muted`}>{fmtGreek(row.pe?.greeks?.vega)}</td>
                      <td className={`${colNumLeft} text-muted`}>{fmtGreek(row.pe?.greeks?.theta)}</td>
                      <td className={`${colNumLeft} text-muted`}>{fmtGreek(row.pe?.greeks?.gamma)}</td>
                      <td className={`${colNumLeft} text-muted`}>{fmtGreek(row.pe?.greeks?.delta)}</td>
                      <td className={`${colNumLeft} text-muted`}>{fmtPct(row.pe?.iv)}</td>
                      <td className={`${colNumLeft} ${peItm ? 'text-red' : 'text-red/80'}`}>{fmtNum(row.pe?.ltp)}</td>
                      <td className={`${colNumLeft} text-muted`}>{fmtNum(row.pe?.volume)}</td>
                      <td className={`${colNumLeft} ${(row.pe?.changeOi || 0) >= 0 ? 'text-green' : 'text-red'}`}>{fmtChange(row.pe?.changeOi)}</td>
                      <td className={`${colNumLeft} text-white`}>{fmtNum(row.pe?.oi)}</td>
                      <td className={`${colNumLeft} w-0`}>
                        <ChartIcon onClick={(e) => { e.stopPropagation(); if (row.pe) loadContract(row.pe.tradingsymbol, row.pe.instrument_key) }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          <div className="h-4" />
        </div>

        {selectedStrike && chainWithChangeOi.some(r => r.strike === selectedStrike) && (
          <div className="shrink-0 px-4 py-2.5 border-t border-border/60 flex gap-2 bg-surface">
            <span className="text-[10px] text-muted flex items-center mr-2">
              Strike <span className="text-white font-bold ml-1">{selectedStrike}</span>
              {spotPrice > 0 && (
                <span className="ml-2">
                  <span className={selectedStrike < spotPrice ? 'text-green' : 'text-red'}>
                    {selectedStrike < spotPrice ? 'ITM CE' : 'ITM PE'}
                  </span>
                </span>
              )}
            </span>
            <button
              onClick={() => {
                const row = chainWithChangeOi.find(r => r.strike === selectedStrike)
                if (row?.ce) onQuickBuy(row.ce.tradingsymbol, row.ce.instrument_key, 'BUY')
              }}
              className="flex-1 py-1.5 rounded font-bold text-[10px] bg-green text-white hover:opacity-85 transition-opacity"
            >
              BUY CE @ {selectedStrike}
            </button>
            <button
              onClick={() => {
                const row = chainWithChangeOi.find(r => r.strike === selectedStrike)
                if (row?.pe) onQuickBuy(row.pe.tradingsymbol, row.pe.instrument_key, 'BUY')
              }}
              className="flex-1 py-1.5 rounded font-bold text-[10px] bg-red text-white hover:opacity-85 transition-opacity"
            >
              BUY PE @ {selectedStrike}
            </button>
          </div>
        )}

        <div className="shrink-0 border-t border-border/40 px-4 py-1.5 flex items-center justify-between text-[9px] text-muted/60">
          <span>{chainWithChangeOi.length} strikes</span>
          <span>PCR: {pcr} | Exp: {selectedExpiry ? fmtExpiry(selectedExpiry) : '--'}</span>
        </div>
      </div>
    </>
  )
}
