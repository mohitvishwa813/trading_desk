import { useState, useEffect, useCallback, useRef } from 'react'
import StrategyEditor from './StrategyEditor'

const LS_KEY = 'upstox_paper_positions'
const LS_TAB  = 'sidebar_tab'

function loadPositions() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePositions(positions) {
  localStorage.setItem(LS_KEY, JSON.stringify(positions))
}

let posIdCounter = Date.now()
function nextId() {
  return ++posIdCounter
}

/* ================================================================== */
/*  ROOT SIDEBAR                                                        */
/* ================================================================== */
export default function Sidebar({
  activeSymbol,
  price,
  alerts,
  webhookStatus,
  onSendAlert,
  prices,
  tick,
  instrumentKey,
  sidebarCollapsed,
  onToggleCollapse,
  onStrategyResult,
  tradesRefreshKey,
}) {
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem(LS_TAB) || 'trade' } catch { return 'trade' }
  })

  const switchTab = (tab) => {
    setActiveTab(tab)
    try { localStorage.setItem(LS_TAB, tab) } catch {}
  }


  return (
    <div className="w-full bg-surface flex flex-col shrink-0 overflow-hidden h-full">

      {/* ── Tab Navigation Header ── */}
      <div
        className="flex items-center border-b border-border shrink-0"
        style={{ background: '#0d0f14', minHeight: 40 }}
      >
        {/* Trade tab */}
        <button
          id="sidebar-tab-trade"
          onClick={() => switchTab('trade')}
          className={`flex-1 h-full py-2.5 text-[11px] font-bold tracking-widest uppercase transition-colors duration-150 relative ${
            activeTab === 'trade'
              ? 'text-accent'
              : 'text-muted hover:text-[#e2e8f0]'
          }`}
        >
          Trade
          {activeTab === 'trade' && (
            <span className="absolute bottom-0 left-0 w-full h-[2px] bg-accent rounded-full" />
          )}
        </button>

        {/* Terminal tab */}
        <button
          id="sidebar-tab-terminal"
          onClick={() => switchTab('terminal')}
          className={`flex-1 h-full py-2.5 text-[11px] font-bold tracking-widest uppercase transition-colors duration-150 relative ${
            activeTab === 'terminal'
              ? 'text-accent'
              : 'text-muted hover:text-[#e2e8f0]'
          }`}
        >
          Terminal
          {activeTab === 'terminal' && (
            <span className="absolute bottom-0 left-0 w-full h-[2px] bg-accent rounded-full" />
          )}
        </button>

        {/* Log tab */}
        <button
          id="sidebar-tab-log"
          onClick={() => switchTab('log')}
          className={`flex-1 h-full py-2.5 text-[11px] font-bold tracking-widest uppercase transition-colors duration-150 relative ${
            activeTab === 'log'
              ? 'text-accent'
              : 'text-muted hover:text-[#e2e8f0]'
          }`}
        >
          Log
          {activeTab === 'log' && (
            <span className="absolute bottom-0 left-0 w-full h-[2px] bg-accent rounded-full" />
          )}
        </button>

        {/* Collapse button */}
        <button
          id="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="shrink-0 w-8 h-full flex items-center justify-center text-muted hover:text-[#e2e8f0] hover:bg-white/5 transition-colors duration-150 border-l border-border"
        >
          {/* chevron icon flips based on collapsed state */}
          <svg
            width="14" height="14" viewBox="0 0 14 14" fill="none"
            style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }}
          >
            <path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {activeTab === 'trade' ? (
          <TradeTabContent
            activeSymbol={activeSymbol}
            price={price}
            onSendAlert={onSendAlert}
            prices={prices}
            tick={tick}
            instrumentKey={instrumentKey}
          />
        ) : activeTab === 'terminal' ? (
          <StrategyEditor activeSymbol={activeSymbol} onStrategyResult={onStrategyResult} />
        ) : (
          <LogTabContent
            alerts={alerts}
            webhookStatus={webhookStatus}
            tradesRefreshKey={tradesRefreshKey}
          />
        )}
      </div>
    </div>
  )
}

/* ================================================================== */
/*  TRADE TAB — existing content                                        */
/* ================================================================== */
function TradeTabContent({ activeSymbol, price, onSendAlert, prices, tick, instrumentKey }) {
  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-y-auto">
      <TradingPanel
        activeSymbol={activeSymbol}
        price={price}
        prices={prices}
        tick={tick}
        instrumentKey={instrumentKey}
        onSendAlert={onSendAlert}
      />
    </div>
  )
}

/* ================================================================== */
/*  LOG TAB — Alert log & Webhook Logs                                  */
/* ================================================================== */
function LogTabContent({ alerts, webhookStatus, tradesRefreshKey }) {
  const [bottomTab, setBottomTab] = useState('alerts') // 'alerts' | 'journal'
  const [trades, setTrades] = useState([])
  const [tradesLoading, setTradesLoading] = useState(false)

  // Fetch trades from database
  useEffect(() => {
    if (bottomTab === 'journal') {
      setTradesLoading(true)
      fetch('/api/trades')
        .then((r) => {
          if (!r.ok) throw new Error('Failed to fetch trades')
          return r.json()
        })
        .then((data) => setTrades(data || []))
        .catch((err) => console.error(err.message))
        .finally(() => setTradesLoading(false))
    }
  }, [bottomTab, tradesRefreshKey])

  return (
    <div className="flex flex-col min-h-0 flex-1 bg-surface h-full">
      {/* Sub-Tabs Selector */}
      <div className="flex border-b border-border bg-[#0d0f14] shrink-0 items-center justify-between">
        <div className="flex flex-1">
          <button
            onClick={() => setBottomTab('alerts')}
            className={`flex-1 py-2 text-[10px] font-bold tracking-widest uppercase border-r border-border transition-colors outline-none
              ${bottomTab === 'alerts' ? 'text-accent bg-[#151922]' : 'text-muted hover:text-white bg-transparent'}
            `}
          >
            Alert Log
          </button>
          <button
            onClick={() => setBottomTab('journal')}
            className={`flex-1 py-2 text-[10px] font-bold tracking-widest uppercase transition-colors outline-none
              ${bottomTab === 'journal' ? 'text-accent bg-[#151922]' : 'text-muted hover:text-white bg-transparent'}
            `}
          >
            make.com logs
          </button>
        </div>
      </div>

      {/* Tab Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        {bottomTab === 'alerts' ? (
          <AlertLog alerts={alerts} />
        ) : (
          <TradeJournal trades={trades} loading={tradesLoading} />
        )}
      </div>
      <WebhookPanel status={webhookStatus} />
    </div>
  )
}

function TradeJournal({ trades, loading }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 text-muted text-xs">
        <svg className="animate-spin h-5 w-5 text-indigo-500 mb-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span>Loading journal entries...</span>
      </div>
    )
  }

  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 text-muted text-xs">
        <span>No trades recorded in journal.</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col p-2 gap-1.5 font-mono text-[11px] text-slate-300">
      {trades.map((t) => {
        const isBuy = t.direction.toUpperCase() === 'BUY'
        const isClosed = t.status.toUpperCase() === 'CLOSED'
        const pnlColor = t.pnl > 0 ? 'text-[#00e676]' : t.pnl < 0 ? 'text-[#ff1744]' : 'text-slate-400'

        return (
          <div key={t.id} className="p-2 bg-[#12151e] border border-[#1e2332] rounded flex flex-col gap-1">
            <div className="flex justify-between items-center">
              <span className="font-bold text-white">{t.symbol}</span>
              <span className={`px-1 rounded text-[9px] font-bold ${isBuy ? 'bg-[#00e676]/10 text-[#00e676]' : 'bg-[#ff1744]/10 text-[#ff1744]'}`}>
                {t.direction}
              </span>
            </div>
            
            <div className="flex justify-between text-[10px] text-muted">
              <span>Qty: {t.qty}</span>
              <span>Entry: {t.price}</span>
            </div>

            <div className="flex justify-between text-[10px] text-muted border-t border-border/20 pt-1 mt-0.5">
              <span>Status: <span className={isClosed ? 'text-slate-400' : 'text-yellow'}>{t.status}</span></span>
              {isClosed && (
                <span>
                  P&L: <span className={`font-bold ${pnlColor}`}>{t.pnl > 0 ? `+${t.pnl}` : t.pnl}</span>
                </span>
              )}
            </div>
            
            {t.comment && (
              <div className="text-[9px] text-indigo-300 mt-1 italic leading-tight">
                {t.comment}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ================================================================== */
/*  TRADING PANEL                                                       */
/* ================================================================== */
function TradingPanel({ activeSymbol, price, prices, tick, instrumentKey, onSendAlert }) {
  const [tradingMode, setTradingMode] = useState('paper') // 'paper' | 'live' | null

  return (
    <div className="border-b border-border">
      {/* Mode Toggle */}
      <div className="p-3 pb-0">
        <ModeToggle value={tradingMode} onChange={setTradingMode} />
      </div>

      {tradingMode ? (
        <TradingForm
          tradingMode={tradingMode}
          activeSymbol={activeSymbol}
          price={price}
          prices={prices}
          tick={tick}
          instrumentKey={instrumentKey}
          onSendAlert={onSendAlert}
        />
      ) : (
        <div className="px-3 py-4 text-[11px] text-muted text-center">
          Click a mode above to start trading
        </div>
      )}
    </div>
  )
}

/* ================================================================== */
/*  MODE TOGGLE                                                         */
/* ================================================================== */
function ModeToggle({ value, onChange }) {
  const btn = (label, mode) => (
    <button
      onClick={() => onChange(value === mode ? null : mode)}
      className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
        value === mode
          ? mode === 'paper'
            ? 'bg-accent text-white'
            : 'bg-green text-white'
          : 'bg-[#0d0f14] border border-border text-muted hover:text-[#e2e8f0]'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="flex gap-1.5 mb-3">
      {btn('PAPER TRADE', 'paper')}
      {/* {btn('LIVE TRADE', 'live')} */}
    </div>
  )
}

/* ================================================================== */
/*  TRADING FORM                                                        */
/* ================================================================== */
function TradingForm({ tradingMode, activeSymbol, price, prices, tick, instrumentKey, onSendAlert }) {
  const [qty, setQty] = useState('25')
  const [orderType, setOrderType] = useState('Market')
  const [limitPrice, setLimitPrice] = useState('')
  const [triggerPrice, setTriggerPrice] = useState('')
  const [product, setProduct] = useState('MIS')
  const [stopLoss, setStopLoss] = useState('')
  const [target, setTarget] = useState('')
  const [positions, setPositions] = useState(loadPositions)

  useEffect(() => { savePositions(positions) }, [positions])

  useEffect(() => {
    if (!prices || Object.keys(prices).length === 0) return
    setPositions(prev =>
      prev.map(p => ({
        ...p,
        ltp: prices[p.symbol] ?? p.ltp,
      }))
    )
  }, [prices])

  const priceDisabled   = orderType === 'Market' || orderType === 'SL-M'
  const triggerDisabled = orderType === 'Market' || orderType === 'Limit'
  const rr = useMemoRR(stopLoss, target, price)

  const placeBuyOrder = useCallback(() => {
    placeOrder({ side: 'BUY', tradingMode, qty, orderType, limitPrice, triggerPrice, product, stopLoss, target, activeSymbol, price, positions, setPositions, onSendAlert, prices, tick })
  }, [tradingMode, qty, orderType, limitPrice, triggerPrice, product, stopLoss, target, activeSymbol, price, positions, onSendAlert, prices, tick])

  const placeSellOrder = useCallback(() => {
    placeOrder({ side: 'SELL', tradingMode, qty, orderType, limitPrice, triggerPrice, product, stopLoss, target, activeSymbol, price, positions, setPositions, onSendAlert, prices, tick })
  }, [tradingMode, qty, orderType, limitPrice, triggerPrice, product, stopLoss, target, activeSymbol, price, positions, onSendAlert, prices, tick])

  const closePosition = useCallback((id) => {
    setPositions(prev => {
      const pos = prev.find(p => p.id === id)
      if (!pos) return prev
      const pnl = calcPnl(pos)
      const msg = `Closed ${pos.symbol} × ${Math.abs(pos.qty)} — P&L: ₹${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`
      onSendAlert('INFO', msg)
      return prev.filter(p => p.id !== id)
    })
  }, [onSendAlert])

  const formattedPrice = price
    ? `₹${Number(price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '—'

  return (
    <div className="p-3 pt-0 space-y-3">
      {/* Symbol Display */}
      <div className="flex items-center justify-between bg-[#0d0f14] border border-border rounded px-2.5 py-2">
        <span className="text-xs font-bold text-[#e2e8f0]">{activeSymbol}</span>
        <span className="text-xs font-mono text-accent">{formattedPrice}</span>
      </div>

      {/* Order Form */}
      <div>
        <div className="text-[10px] font-bold tracking-widest text-muted uppercase mb-1.5">Order Form</div>
        <div className="space-y-1.5">
          <div>
            <div className="text-[10px] text-muted mb-0.5">Quantity</div>
            <input type="number" value={qty} onChange={e => setQty(e.target.value)}
              className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none" />
          </div>
          <div>
            <div className="text-[10px] text-muted mb-0.5">Order Type</div>
            <select value={orderType} onChange={e => setOrderType(e.target.value)}
              className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none">
              <option value="Market">Market</option>
              <option value="Limit">Limit</option>
              <option value="SL">SL</option>
              <option value="SL-M">SL-M</option>
            </select>
          </div>
          <div>
            <div className="text-[10px] text-muted mb-0.5">Price</div>
            <input type="number" value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
              disabled={priceDisabled}
              className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none disabled:opacity-40"
              placeholder={priceDisabled ? 'Auto (Market)' : 'Enter price'} />
          </div>
          <div>
            <div className="text-[10px] text-muted mb-0.5">Trigger Price</div>
            <input type="number" value={triggerPrice} onChange={e => setTriggerPrice(e.target.value)}
              disabled={triggerDisabled}
              className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none disabled:opacity-40"
              placeholder={triggerDisabled ? 'N/A' : 'Enter trigger'} />
          </div>
          <div>
            <div className="text-[10px] text-muted mb-0.5">Product</div>
            <select value={product} onChange={e => setProduct(e.target.value)}
              className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none">
              <option value="MIS">MIS (Intraday)</option>
              <option value="CNC">CNC (Delivery)</option>
              <option value="NRML">NRML (Normal)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Risk Management */}
      <div>
        <div className="text-[10px] font-bold tracking-widest text-muted uppercase mb-1.5">Risk Management</div>
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <div className="text-[10px] text-muted mb-0.5">Stop Loss</div>
            <input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)}
              className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none"
              placeholder="pts" />
          </div>
          <div>
            <div className="text-[10px] text-muted mb-0.5">Target</div>
            <input type="number" value={target} onChange={e => setTarget(e.target.value)}
              className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none"
              placeholder="pts" />
          </div>
        </div>
        {rr && (
          <div className="mt-1 text-[10px] font-mono text-accent">
            Risk/Reward: 1:{rr}
          </div>
        )}
      </div>

      {/* BUY / SELL Buttons */}
      <div className="flex gap-1.5">
        <button onClick={placeBuyOrder}
          className="flex-1 py-2 rounded font-bold text-xs bg-green text-white hover:opacity-85 transition-opacity">
          BUY {tradingMode === 'paper' ? '(Paper)' : ''}
        </button>
        <button onClick={placeSellOrder}
          className="flex-1 py-2 rounded font-bold text-xs bg-red text-white hover:opacity-85 transition-opacity">
          SELL {tradingMode === 'paper' ? '(Paper)' : ''}
        </button>
      </div>

      {/* Open Positions (Paper only) */}
      {tradingMode === 'paper' && (
        <OpenPositions positions={positions} onClose={closePosition} />
      )}
    </div>
  )
}

/* ================================================================== */
/*  OPEN POSITIONS TABLE                                                */
/* ================================================================== */
function OpenPositions({ positions, onClose }) {
  if (!positions || positions.length === 0) {
    return <div className="text-[11px] text-muted pt-1">No open positions</div>
  }

  return (
    <div>
      <div className="text-[10px] font-bold tracking-widest text-muted uppercase mb-1.5 pt-1">
        Open Positions
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-muted border-b border-border">
              <th className="text-left pr-1 pb-1 font-medium">Symbol</th>
              <th className="text-right px-1 pb-1 font-medium">Qty</th>
              <th className="text-right px-1 pb-1 font-medium">Avg</th>
              <th className="text-right px-1 pb-1 font-medium">LTP</th>
              <th className="text-right px-1 pb-1 font-medium">P&amp;L</th>
              <th className="text-right pl-1 pb-1 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {positions.map(pos => {
              const pnl = calcPnl(pos)
              return (
                <tr key={pos.id} className="border-b border-border/50">
                  <td className="pr-1 py-1.5 text-[#e2e8f0] truncate max-w-[60px]">{pos.symbol}</td>
                  <td className="px-1 py-1.5 text-right font-mono">{pos.qty}</td>
                  <td className="px-1 py-1.5 text-right font-mono">{pos.avgPrice.toFixed(1)}</td>
                  <td className="px-1 py-1.5 text-right font-mono">{pos.ltp?.toFixed(1) ?? '—'}</td>
                  <td className={`px-1 py-1.5 text-right font-mono ${pnl >= 0 ? 'text-green' : 'text-red'}`}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}
                  </td>
                  <td className="pl-1 py-1.5 text-right">
                    <button onClick={() => onClose(pos.id)}
                      className="text-[10px] text-muted hover:text-red transition-colors">
                      Close
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ================================================================== */
/*  HELPERS                                                             */
/* ================================================================== */
function calcPnl(pos) {
  const ltp = pos.ltp ?? pos.avgPrice
  if (pos.qty > 0) return (ltp - pos.avgPrice) * pos.qty
  return (pos.avgPrice - ltp) * Math.abs(pos.qty)
}

function calcRR(sl, target, price) {
  const slNum     = parseFloat(sl)
  const targetNum = parseFloat(target)
  const priceNum  = parseFloat(price)
  if (!slNum || !targetNum || !priceNum) return null
  const risk   = Math.abs(slNum)
  const reward = Math.abs(targetNum)
  if (risk === 0) return null
  return (reward / risk).toFixed(1)
}

function useMemoRR(sl, target, price) {
  const [rr, setRr] = useState(null)
  useEffect(() => { setRr(calcRR(sl, target, price)) }, [sl, target, price])
  return rr
}

/* ================================================================== */
/*  PLACE ORDER                                                         */
/* ================================================================== */
async function placeOrder({ side, tradingMode, qty, orderType, limitPrice, triggerPrice, product, stopLoss, target, activeSymbol, price, positions, setPositions, onSendAlert, prices, tick }) {
  const qtyNum = parseInt(qty, 10)
  if (!qtyNum || qtyNum <= 0) {
    onSendAlert('INFO', `[${side}] Invalid quantity`)
    return
  }

  let fillPrice = parseFloat(price) || 0
  if (!fillPrice && prices && prices[activeSymbol]) fillPrice = parseFloat(prices[activeSymbol])
  if (!fillPrice && tick && (tick.symbol === activeSymbol || tick.instrumentKey === activeSymbol)) fillPrice = parseFloat(tick.ltp)

  if (tradingMode === 'paper') {
    const pos = {
      id: nextId(),
      symbol: activeSymbol,
      qty: side === 'BUY' ? qtyNum : -qtyNum,
      avgPrice: fillPrice,
      ltp: fillPrice,
      product,
      timestamp: new Date().toISOString(),
      stopLoss,
      target,
    }
    setPositions(prev => [...prev, pos])
    onSendAlert(side, `${side} ${qtyNum} ${activeSymbol} @ ₹${fillPrice.toFixed(2)} (Paper)`)
    return
  }

  const body = {
    symbol: activeSymbol,
    side,
    quantity: qtyNum,
    orderType,
    product,
    price: orderType === 'Limit' || orderType === 'SL' ? parseFloat(limitPrice) || 0 : 0,
    triggerPrice: orderType === 'SL' || orderType === 'SL-M' ? parseFloat(triggerPrice) || 0 : 0,
    stopLoss: parseFloat(stopLoss) || 0,
    target: parseFloat(target) || 0,
  }

  onSendAlert('INFO', `[LIVE] Placing ${side} order…`)

  try {
    const res    = await fetch('/api/order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const result = await res.json()
    const msg    = result.success
      ? `[LIVE] ${side} ${qtyNum} ${activeSymbol} — ${result.orderId ? 'Order #' + result.orderId : 'Placed'}`
      : `[LIVE] ${side} failed: ${result.error || 'Unknown error'}`
    onSendAlert(result.success ? side : 'INFO', msg)
  } catch (err) {
    onSendAlert('INFO', `[LIVE] ${side} error: ${err.message}`)
  }
}

/* ================================================================== */
/*  ALERT LOG                                                           */
/* ================================================================== */
function parseAlertTradeDetails(message) {
  const regex = /\[(?:Paper|Live)\s+(BUY|SELL)\]\s+(\d+)\s+([A-Z0-9]+)?\s*@\s*₹?([\d.]+)/i;
  const match = message.match(regex);
  if (match) {
    return {
      side: match[1].toUpperCase(),
      qty: parseInt(match[2], 10),
      price: parseFloat(match[4])
    };
  }
  return null;
}

function calculateGroupPnL(alerts) {
  // Sort oldest first
  const sorted = [...alerts].sort((a, b) => new Date(a.timestamp || a.time) - new Date(b.timestamp || b.time));
  
  let position = 0;
  let avgPrice = 0;
  let totalRealizedPnL = 0;
  
  for (const al of sorted) {
    const trade = parseAlertTradeDetails(al.message);
    if (!trade) continue;
    
    const { side, qty, price } = trade;
    
    if (position === 0) {
      position = side === 'BUY' ? qty : -qty;
      avgPrice = price;
    } else if (position > 0) {
      if (side === 'BUY') {
        avgPrice = (avgPrice * position + price * qty) / (position + qty);
        position += qty;
      } else {
        const closedQty = Math.min(qty, position);
        totalRealizedPnL += closedQty * (price - avgPrice);
        position -= qty;
        if (position < 0) {
          avgPrice = price;
        }
      }
    } else {
      if (side === 'SELL') {
        avgPrice = (avgPrice * Math.abs(position) + price * qty) / (Math.abs(position) + qty);
        position -= qty;
      } else {
        const closedQty = Math.min(qty, Math.abs(position));
        totalRealizedPnL += closedQty * (avgPrice - price);
        position += qty;
        if (position > 0) {
          avgPrice = price;
        }
      }
    }
  }
  return totalRealizedPnL;
}

function AlertLog({ alerts }) {
  const [expandedGroups, setExpandedGroups] = useState({});

  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Grouping logic
  const grouped = {};
  alerts.forEach(a => {
    const dateStr = a.timestamp ? new Date(a.timestamp).toLocaleDateString() : 'System';
    const key = a.tradeId || `nogroup-${dateStr}-${a.symbol || 'SYSTEM'}`;
    
    if (!grouped[key]) {
      grouped[key] = {
        key,
        tradeId: a.tradeId || null,
        symbol: a.symbol || 'SYSTEM',
        primarySignal: 'INFO',
        alerts: [],
        latestTime: a.timestamp || a.time || ''
      };
    }
    grouped[key].alerts.push(a);

    const sigUpper = a.signal?.toUpperCase();
    if (sigUpper === 'BUY' || sigUpper === 'SELL') {
      grouped[key].primarySignal = sigUpper;
    }
  });

  const groupList = Object.values(grouped).sort((a, b) => {
    return new Date(b.latestTime) - new Date(a.latestTime);
  });

  const pillMap = {
    BUY:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    SELL: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    INFO: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  };

  if (alerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 p-6 text-muted text-xs">
        <span>No alerts triggered.</span>
      </div>
    );
  }

  // Calculate Today's Total realized PnL
  const todayStr = new Date().toDateString();
  const todayPnL = groupList.reduce((sum, g) => {
    const isToday = new Date(g.latestTime).toDateString() === todayStr;
    return sum + (isToday ? calculateGroupPnL(g.alerts) : 0);
  }, 0);

  return (
    <div className="p-2 space-y-2 select-none">
      {/* Today's PnL Dashboard Widget */}
      <div className="bg-[#0b0d15] border border-[#1b1f2e] rounded-lg p-3 flex items-center justify-between shadow-sm">
        <div className="space-y-0.5">
          <span className="text-[10px] text-[#808290] font-bold uppercase tracking-wider block">Today's Realized P&L</span>
          <span className="text-[9px] text-[#4f5260] block">Real-time matching from alert logs</span>
        </div>
        <div className={`text-sm font-extrabold font-mono px-2.5 py-1 rounded border ${
          todayPnL > 0 
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
            : todayPnL < 0 
              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' 
              : 'bg-[#181b28] text-slate-400 border-[#242838]'
        }`}>
          {todayPnL > 0 ? '+' : ''}₹{todayPnL.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
      {groupList.map(group => {
        const groupPnL = calculateGroupPnL(group.alerts);
        const isExpanded = !!expandedGroups[group.key];
        const hasTradeId = !!group.tradeId;
        const totalAlerts = group.alerts.length;
        
        return (
          <div 
            key={group.key}
            className="border border-[#1f2332] rounded-lg overflow-hidden bg-[#0d0f17] transition-all duration-200"
          >
            {/* Accordion Header */}
            <div 
              onClick={() => toggleGroup(group.key)}
              className="flex items-center justify-between px-3 py-2.5 cursor-pointer bg-[#10121e] hover:bg-[#151928] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${pillMap[group.primarySignal] || pillMap.INFO}`}>
                  {group.primarySignal}
                </span>
                <span className="text-xs font-bold text-[#e2e8f0]">
                  {group.symbol}
                </span>
                {groupPnL !== 0 && (
                  <span className={`text-[9px] font-extrabold font-mono px-1.5 py-0.5 rounded ${
                    groupPnL > 0 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {groupPnL > 0 ? '+' : ''}₹{groupPnL.toFixed(2)}
                  </span>
                )}
                <span className="text-[10px] text-muted font-mono">
                  {hasTradeId ? `(${totalAlerts} updates)` : `(${totalAlerts} logs)`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-[#5b5e70] font-mono">
                  {group.latestTime ? new Date(group.latestTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
                <svg 
                  width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={`text-muted transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>

            {/* Accordion Body */}
            {isExpanded && (
              <div className="px-3 py-2 border-t border-[#181a26]/50 bg-[#08090f]/50 space-y-2 relative">
                {/* Timeline vertical bar */}
                <div className="absolute left-[20px] top-3 bottom-3 w-[1.5px] bg-[#1d2133]" />
                
                {group.alerts.map((al, idx) => {
                  const isTradeAlert = al.signal === 'BUY' || al.signal === 'SELL';
                  
                  return (
                    <div key={idx} className="flex gap-3 text-[11px] leading-relaxed relative pl-1">
                      {/* Timeline dot */}
                      <div className="w-[10px] h-[10px] rounded-full bg-[#181a26] border-2 border-[#30364d] mt-1 shrink-0 z-10 flex items-center justify-center">
                        {isTradeAlert && <div className="w-1.5 h-1.5 rounded-full bg-[#7c6af7]" />}
                      </div>
                      
                      {/* Alert message body */}
                      <div className="flex-1 min-w-0">
                        <div className="text-slate-300 font-mono text-[10.5px]">
                          {al.message}
                        </div>
                        <div className="text-[9px] text-muted/60 mt-0.5 font-mono">
                          {al.timestamp ? new Date(al.timestamp).toLocaleTimeString() : al.time || ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  WEBHOOK PANEL                                                       */
/* ================================================================== */
function WebhookPanel({ status }) {
  return (
    <div className="p-3 border-t border-border shrink-0">
      <div className="text-[10px] font-bold tracking-widest text-muted uppercase mb-2">Make.com Webhook</div>
      <input
        type="text"
        placeholder="Set MAKE_WEBHOOK_URL in .env"
        readOnly
        className="w-full bg-[#0d0f14] border border-border text-muted px-2 py-1.5 rounded font-mono text-xs"
      />
      <div className={`text-[10px] mt-1.5 ${status.includes('Sent') || status.includes('Configure') ? 'text-green' : 'text-red'}`}>
        {status}
      </div>
    </div>
  )
}
