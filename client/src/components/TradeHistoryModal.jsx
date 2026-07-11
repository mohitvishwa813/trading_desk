import { useState, useMemo, useEffect } from 'react'

export default function TradeHistoryModal({ isOpen, onClose, prices = {} }) {
  const [trades, setTrades] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Filters State
  const [searchSymbol, setSearchSymbol] = useState('')
  const [filterType, setFilterType] = useState('all') // all, manual_paper, auto_paper, journal
  const [filterStatus, setFilterStatus] = useState('all') // all, OPEN, CLOSED
  const [filterDateRange, setFilterDateRange] = useState('all_time') // all_time, today, yesterday, 7_days, 30_days, custom
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 12

  // Fetch all trade history
  useEffect(() => {
    if (!isOpen) return

    async function fetchHistory() {
      setLoading(true)
      setError(null)
      try {
        const token = localStorage.getItem('token')
        if (!token) {
          throw new Error('Access token required. Please log in again.')
        }
        const res = await fetch('/api/history/all-trades', {
          headers: { Authorization: `Bearer ${token}` }
        })
        
        if (!res.ok) {
          let errMsg = 'Failed to fetch trade history'
          try {
            const errData = await res.json()
            if (errData && errData.error) errMsg = errData.error
          } catch (e) {}
          throw new Error(errMsg)
        }
        
        const data = await res.json()
        if (Array.isArray(data)) {
          setTrades(data)
        } else {
          throw new Error('Invalid trade history data format')
        }
      } catch (err) {
        setError(err.message)
        setTrades([])
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [isOpen])

  // Reset pagination on filter change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchSymbol, filterType, filterStatus, filterDateRange, customStartDate, customEndDate])

  // Filtering Logic
  const filteredTrades = useMemo(() => {
    if (!Array.isArray(trades)) return []
    return trades.filter(t => {
      // 1. Symbol search filter (case insensitive substring)
      if (searchSymbol && !t.symbol.toLowerCase().includes(searchSymbol.toLowerCase())) {
        return false
      }

      // 2. Type filter
      if (filterType !== 'all') {
        if (filterType === 'manual_paper' && !(t.origin === 'paper' && !t.isAuto)) return false
        if (filterType === 'auto_paper' && !(t.origin === 'paper' && t.isAuto)) return false
        if (filterType === 'journal' && t.origin !== 'journal') return false
      }

      // 3. Status filter
      if (filterStatus !== 'all' && t.status !== filterStatus) {
        return false
      }

      // 4. Date Range filter
      if (filterDateRange !== 'all_time') {
        const tradeDate = new Date(t.created_at)
        const now = new Date()

        if (filterDateRange === 'today') {
          if (tradeDate.toDateString() !== now.toDateString()) return false
        } else if (filterDateRange === 'yesterday') {
          const yesterday = new Date()
          yesterday.setDate(now.getDate() - 1)
          if (tradeDate.toDateString() !== yesterday.toDateString()) return false
        } else if (filterDateRange === '7_days') {
          const limit = new Date()
          limit.setDate(now.getDate() - 7)
          if (tradeDate < limit) return false
        } else if (filterDateRange === '30_days') {
          const limit = new Date()
          limit.setDate(now.getDate() - 30)
          if (tradeDate < limit) return false
        } else if (filterDateRange === 'custom') {
          if (customStartDate) {
            const start = new Date(customStartDate)
            start.setHours(0, 0, 0, 0)
            if (tradeDate < start) return false
          }
          if (customEndDate) {
            const end = new Date(customEndDate)
            end.setHours(23, 59, 59, 999)
            if (tradeDate > end) return false
          }
        }
      }

      return true
    })
  }, [trades, searchSymbol, filterType, filterStatus, filterDateRange, customStartDate, customEndDate])

  // Live P&L and metrics calculations
  const stats = useMemo(() => {
    let totalRealizedPnl = 0
    let totalUnrealizedPnl = 0
    let winCount = 0
    let closedCount = 0
    let totalProfit = 0
    let totalLoss = 0

    filteredTrades.forEach(t => {
      if (t.status === 'CLOSED') {
        const p = Number(t.pnl) || 0
        totalRealizedPnl += p
        closedCount++
        if (p > 0) {
          winCount++
          totalProfit += p
        } else {
          totalLoss += p
        }
      } else if (t.status === 'OPEN') {
        // Calculate unrealized live P&L if we have live prices
        const livePrice = prices[t.symbol]
        if (livePrice) {
          const entryPrice = Number(t.price) || 0
          const qty = Number(t.qty) || 0
          const isBuy = t.direction.toUpperCase() === 'BUY'
          const unrealized = isBuy ? (livePrice - entryPrice) * qty : (entryPrice - livePrice) * qty
          totalUnrealizedPnl += unrealized
        }
      }
    })

    const winRate = closedCount > 0 ? ((winCount / closedCount) * 100).toFixed(1) : '0.0'
    const totalPnl = totalRealizedPnl + totalUnrealizedPnl

    return {
      totalTrades: filteredTrades.length,
      closedCount,
      winRate,
      realizedPnl: totalRealizedPnl,
      unrealizedPnl: totalUnrealizedPnl,
      totalPnl,
      totalProfit,
      totalLoss
    }
  }, [filteredTrades, prices])

  // Pagination Logic
  const totalPages = Math.ceil(filteredTrades.length / itemsPerPage)
  const paginatedTrades = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredTrades.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredTrades, currentPage])

  if (!isOpen) return null

  // Helpers for formatting
  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    const d = new Date(dateStr)
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  const getCommentText = (comment) => {
    if (!comment) return '-'
    try {
      if (comment.trim().startsWith('{')) {
        const parsed = JSON.parse(comment)
        return parsed.strategyName ? `Auto Strategy: ${parsed.strategyName}` : comment
      }
    } catch (e) {}
    return comment
  }

  return (
    <div className="fixed inset-0 bg-[#000]/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 select-none animate-fadeIn">
      <div className="bg-[#0b0d14] border border-[#222533] w-full max-w-6xl h-[85vh] rounded-xl flex flex-col overflow-hidden shadow-2xl">
        
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-[#222533] flex items-center justify-between bg-[#0e111a]">
          <div className="flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c6af7" strokeWidth="2.5">
              <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-sm font-extrabold text-white tracking-widest uppercase">Trade History Log & Analytics</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-muted hover:text-white transition-colors p-1 hover:bg-[#1f2230] rounded-full outline-none"
            aria-label="Close modal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Stats Summary Widget Panel */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-[#090b10] border-b border-[#1b1f2e]">
          
          <div className="bg-[#0f121d] border border-[#1b1f2e] rounded-lg p-2.5 flex flex-col justify-center">
            <span className="text-[9px] text-[#808290] font-bold uppercase tracking-wider">Total Trades</span>
            <span className="text-lg font-extrabold font-mono text-white mt-0.5">{stats.totalTrades}</span>
            <span className="text-[9px] text-[#4f5260] mt-0.5">{stats.closedCount} Closed, {stats.totalTrades - stats.closedCount} Open</span>
          </div>

          <div className="bg-[#0f121d] border border-[#1b1f2e] rounded-lg p-2.5 flex flex-col justify-center">
            <span className="text-[9px] text-[#808290] font-bold uppercase tracking-wider">Closed Win Rate</span>
            <span className="text-lg font-extrabold font-mono text-purple-400 mt-0.5">{stats.winRate}%</span>
            <span className="text-[9px] text-[#4f5260] mt-0.5">Win/Loss ratio for closed trades</span>
          </div>

          <div className="bg-[#0f121d] border border-[#1b1f2e] rounded-lg p-2.5 flex flex-col justify-center">
            <span className="text-[9px] text-[#808290] font-bold uppercase tracking-wider">Realized P&L</span>
            <span className={`text-lg font-extrabold font-mono mt-0.5 ${stats.realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.realizedPnl >= 0 ? '+' : ''}₹{stats.realizedPnl.toFixed(2)}
            </span>
            <span className="text-[9px] text-[#4f5260] mt-0.5">Locked profit & loss</span>
          </div>

          <div className="bg-[#0f121d] border border-[#1b1f2e] rounded-lg p-2.5 flex flex-col justify-center">
            <span className="text-[9px] text-[#808290] font-bold uppercase tracking-wider">Unrealized P&L</span>
            <span className={`text-lg font-extrabold font-mono mt-0.5 ${stats.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.unrealizedPnl >= 0 ? '+' : ''}₹{stats.unrealizedPnl.toFixed(2)}
            </span>
            <span className="text-[9px] text-[#4f5260] mt-0.5">Live running trades</span>
          </div>

          <div className="bg-[#0f121d] border border-[#1b1f2e] rounded-lg p-2.5 flex flex-col justify-center col-span-2 md:col-span-1">
            <span className="text-[9px] text-[#808290] font-bold uppercase tracking-wider">Net Combined P&L</span>
            <span className={`text-lg font-extrabold font-mono mt-0.5 ${stats.totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stats.totalPnl >= 0 ? '+' : ''}₹{stats.totalPnl.toFixed(2)}
            </span>
            <span className="text-[9px] text-[#4f5260] mt-0.5">Realized + Unrealized</span>
          </div>

        </div>

        {/* Filter Toolbar controls */}
        <div className="p-4 bg-[#0d0f17] border-b border-[#222533] flex flex-wrap items-center gap-3">
          
          {/* Symbol Search */}
          <div className="flex flex-col gap-1 w-full sm:w-44">
            <label className="text-[9px] text-[#808290] font-bold uppercase tracking-wider">Search Symbol</label>
            <input 
              type="text"
              placeholder="e.g. CRUDEOILM"
              value={searchSymbol}
              onChange={e => setSearchSymbol(e.target.value)}
              className="bg-[#151922] border border-[#26293b] text-white text-xs rounded px-2.5 py-1.5 focus:outline-none focus:border-accent placeholder-[#4f5260]"
            />
          </div>

          {/* Trade Type Filter */}
          <div className="flex flex-col gap-1 w-full sm:w-40">
            <label className="text-[9px] text-[#808290] font-bold uppercase tracking-wider">Trade Type</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-[#151922] border border-[#26293b] text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="all">All Types</option>
              <option value="manual_paper">Manual Paper Trade</option>
              <option value="auto_paper">Auto Paper Trade</option>
              <option value="journal">Trade Journal</option>
            </select>
          </div>

          {/* Trade Status Filter */}
          <div className="flex flex-col gap-1 w-full sm:w-32">
            <label className="text-[9px] text-[#808290] font-bold uppercase tracking-wider">Status</label>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-[#151922] border border-[#26293b] text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="OPEN">OPEN</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>

          {/* Date Range Filter */}
          <div className="flex flex-col gap-1 w-full sm:w-36">
            <label className="text-[9px] text-[#808290] font-bold uppercase tracking-wider">Date Period</label>
            <select
              value={filterDateRange}
              onChange={e => setFilterDateRange(e.target.value)}
              className="bg-[#151922] border border-[#26293b] text-white text-xs rounded px-2 py-1.5 focus:outline-none focus:border-accent cursor-pointer"
            >
              <option value="all_time">All Time</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7_days">Last 7 Days</option>
              <option value="30_days">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Custom Date Pickers */}
          {filterDateRange === 'custom' && (
            <>
              <div className="flex flex-col gap-1 w-full sm:w-32">
                <label className="text-[9px] text-[#808290] font-bold uppercase tracking-wider">Start Date</label>
                <input 
                  type="date"
                  value={customStartDate}
                  onChange={e => setCustomStartDate(e.target.value)}
                  className="bg-[#151922] border border-[#26293b] text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-accent cursor-pointer"
                />
              </div>
              <div className="flex flex-col gap-1 w-full sm:w-32">
                <label className="text-[9px] text-[#808290] font-bold uppercase tracking-wider">End Date</label>
                <input 
                  type="date"
                  value={customEndDate}
                  onChange={e => setCustomEndDate(e.target.value)}
                  className="bg-[#151922] border border-[#26293b] text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-accent cursor-pointer"
                />
              </div>
            </>
          )}

          {/* Reset Filters button */}
          <button
            onClick={() => {
              setSearchSymbol('')
              setFilterType('all')
              setFilterStatus('all')
              setFilterDateRange('all_time')
              setCustomStartDate('')
              setCustomEndDate('')
            }}
            className="mt-auto px-3.5 py-1.5 bg-[#171b26] border border-[#2c3045] hover:border-accent hover:text-white rounded text-[11px] font-bold text-muted transition-colors sm:ml-auto"
          >
            Clear Filters
          </button>

        </div>

        {/* Trade Logs List / Table */}
        <div className="flex-1 overflow-y-auto min-h-0 bg-[#07090d]">
          {loading ? (
            <div className="h-full flex items-center justify-center text-muted text-xs gap-2">
              <svg className="animate-spin h-4 w-4 text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Loading trade history...</span>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center">
              <span className="text-rose-400 text-xs font-bold font-mono">Error: {error}</span>
            </div>
          ) : filteredTrades.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted text-xs">
              <span>No trade logs match the selected filters.</span>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0b0d15] text-[#808290] text-[9px] uppercase font-extrabold tracking-wider border-b border-[#1b1f2e] sticky top-0 z-10">
                  <th className="py-3 px-4">Trade Type</th>
                  <th className="py-3 px-3">Symbol</th>
                  <th className="py-3 px-3">Direction</th>
                  <th className="py-3 px-3 text-right">Qty</th>
                  <th className="py-3 px-3 text-right">Entry Price</th>
                  <th className="py-3 px-3 text-right">Close / Current</th>
                  <th className="py-3 px-3 text-right">Realized PnL</th>
                  <th className="py-3 px-4">Timeline (Created / Closed)</th>
                  <th className="py-3 px-4">Comments / Strategy</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1b1f2e] font-mono text-[11px] text-white">
                {paginatedTrades.map(t => {
                  // Resolve type details
                  let typeLabel = 'Paper (Manual)'
                  let typeClass = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                  if (t.origin === 'journal') {
                    typeLabel = 'Trade Journal'
                    typeClass = 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                  } else if (t.origin === 'paper' && t.isAuto) {
                    typeLabel = `Auto Paper`
                    typeClass = 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                  }

                  // Direction display
                  const isBuy = t.direction?.toUpperCase() === 'BUY'
                  const dirClass = isBuy 
                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                    : 'text-rose-400 bg-rose-500/10 border-rose-500/20'

                  // P&L calculation
                  let pnlVal = Number(t.pnl) || 0
                  let isLive = false
                  
                  if (t.status === 'OPEN' && t.origin === 'paper') {
                    const livePrice = prices[t.symbol]
                    if (livePrice) {
                      const entryPrice = Number(t.price) || 0
                      const qty = Number(t.qty) || 0
                      pnlVal = isBuy ? (livePrice - entryPrice) * qty : (entryPrice - livePrice) * qty
                      isLive = true
                    }
                  }

                  return (
                    <tr key={t.id} className="hover:bg-[#111420]/50 transition-colors">
                      {/* Type Badge */}
                      <td className="py-2.5 px-4 font-sans font-bold">
                        <span className={`px-2 py-0.5 rounded border text-[9px] ${typeClass}`}>
                          {typeLabel}
                        </span>
                      </td>

                      {/* Symbol */}
                      <td className="py-2.5 px-3 font-semibold font-sans text-white">{t.symbol}</td>

                      {/* Direction */}
                      <td className="py-2.5 px-3 font-sans font-extrabold text-center">
                        <span className={`px-2 py-0.5 rounded border text-[9px] ${dirClass}`}>
                          {t.direction}
                        </span>
                      </td>

                      {/* Qty */}
                      <td className="py-2.5 px-3 text-right font-bold">{t.qty}</td>

                      {/* Entry Price */}
                      <td className="py-2.5 px-3 text-right text-muted">₹{Number(t.price).toFixed(2)}</td>

                      {/* Close or Live Price */}
                      <td className="py-2.5 px-3 text-right font-bold text-white">
                        {t.status === 'OPEN' ? (
                          <span className="text-[10px] text-sky-400 flex items-center justify-end gap-1.5">
                            <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-ping shrink-0" />
                            ₹{(prices[t.symbol] || t.price).toFixed(2)}
                          </span>
                        ) : (
                          // For CLOSED trades, closed price can be estimated or calculated.
                          // Realized PnL is accurate, showing CLOSED label.
                          <span className="text-muted text-[10px]">CLOSED</span>
                        )}
                      </td>

                      {/* P&L */}
                      <td className={`py-2.5 px-3 text-right font-extrabold ${pnlVal > 0 ? 'text-emerald-400' : pnlVal < 0 ? 'text-rose-400' : 'text-muted'}`}>
                        {pnlVal > 0 ? '+' : ''}₹{pnlVal.toFixed(2)}
                        {isLive && <span className="text-[8px] block text-sky-400 font-sans font-bold">Unrealized</span>}
                      </td>

                      {/* Timeline */}
                      <td className="py-2.5 px-4 text-muted text-[10px] font-sans">
                        <div className="flex flex-col gap-0.5">
                          <span><span className="text-[#808290] font-bold">In:</span> {formatDate(t.created_at)}</span>
                          {t.closed_at && (
                            <span><span className="text-[#808290] font-bold">Out:</span> {formatDate(t.closed_at)}</span>
                          )}
                        </div>
                      </td>

                      {/* Comments */}
                      <td className="py-2.5 px-4 text-muted text-[10px] font-sans break-words max-w-[200px]">
                        {t.isAuto && t.strategyName ? (
                          <div className="text-sky-300 font-semibold flex items-center gap-1">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="inline-block shrink-0">
                              <polygon points="12 2 2 7 12 12 22 7 12 2" />
                              <polyline points="2 17 12 22 22 17" />
                              <polyline points="2 12 12 17 22 12" />
                            </svg>
                            <span>{t.strategyName}</span>
                          </div>
                        ) : (
                          getCommentText(t.comment)
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer with Pagination */}
        {filteredTrades.length > 0 && (
          <div className="px-5 py-3 border-t border-[#222533] bg-[#0e111a] flex items-center justify-between text-xs text-muted">
            <span>
              Showing {Math.min(filteredTrades.length, (currentPage - 1) * itemsPerPage + 1)} to {Math.min(filteredTrades.length, currentPage * itemsPerPage)} of {filteredTrades.length} trades
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-2.5 py-1.5 bg-[#171b26] hover:bg-[#202534] border border-[#2c3045] hover:text-white rounded disabled:opacity-40 disabled:hover:bg-[#171b26] disabled:hover:text-muted transition-colors outline-none font-bold"
              >
                Previous
              </button>
              <span className="font-mono text-white text-[11px] px-2.5">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1.5 bg-[#171b26] hover:bg-[#202534] border border-[#2c3045] hover:text-white rounded disabled:opacity-40 disabled:hover:bg-[#171b26] disabled:hover:text-muted transition-colors outline-none font-bold"
              >
                Next
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
