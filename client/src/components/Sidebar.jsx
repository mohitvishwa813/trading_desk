import { useState, useEffect, useCallback } from 'react'

const LS_KEY = 'upstox_paper_positions'

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

export default function Sidebar({
  activeSymbol,
  price,
  alerts,
  webhookStatus,
  onSendAlert,
  prices,
  tick,
  instrumentKey,
}) {
  return (
    <div className="w-full bg-surface flex flex-col shrink-0 overflow-hidden">
      <TradingPanel
        activeSymbol={activeSymbol}
        price={price}
        prices={prices}
        tick={tick}
        instrumentKey={instrumentKey}
        onSendAlert={onSendAlert}
      />
      <div className="text-[10px] font-bold tracking-widest text-muted uppercase px-3.5 py-2.5 border-b border-border bg-[#0d0f14]">
        Alert Log
      </div>
      <AlertLog alerts={alerts} />
      <WebhookPanel status={webhookStatus} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  TRADING PANEL                                                     */
/* ------------------------------------------------------------------ */
function TradingPanel({ activeSymbol, price, prices, tick, instrumentKey, onSendAlert }) {
  const [tradingMode, setTradingMode] = useState(null) // 'paper' | 'live' | null

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

/* ------------------------------------------------------------------ */
/*  MODE TOGGLE                                                        */
/* ------------------------------------------------------------------ */
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
      {btn('LIVE TRADE', 'live')}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  TRADING FORM                                                       */
/* ------------------------------------------------------------------ */
function TradingForm({ tradingMode, activeSymbol, price, prices, tick, instrumentKey, onSendAlert }) {
  // Order form state
  const [qty, setQty] = useState('25')
  const [orderType, setOrderType] = useState('Market')
  const [limitPrice, setLimitPrice] = useState('')
  const [triggerPrice, setTriggerPrice] = useState('')
  const [product, setProduct] = useState('MIS')

  // Risk management
  const [stopLoss, setStopLoss] = useState('')
  const [target, setTarget] = useState('')

  // Paper positions
  const [positions, setPositions] = useState(loadPositions)

  // Persist & update LTP from prices stream
  useEffect(() => {
    savePositions(positions)
  }, [positions])

  // Update LTP of all positions from live prices
  useEffect(() => {
    if (!prices || Object.keys(prices).length === 0) return
    setPositions(prev =>
      prev.map(p => ({
        ...p,
        ltp: prices[p.symbol] ?? p.ltp,
      }))
    )
  }, [prices])

  const priceDisabled = orderType === 'Market' || orderType === 'SL-M'
  const triggerDisabled = orderType === 'Market' || orderType === 'Limit'

  const rr = useMemoRR(stopLoss, target, price)

  const placeBuyOrder = useCallback(() => {
    placeOrder({
      side: 'BUY',
      tradingMode,
      qty,
      orderType,
      limitPrice,
      triggerPrice,
      product,
      stopLoss,
      target,
      activeSymbol,
      price,
      positions,
      setPositions,
      onSendAlert,
      prices,
      tick,
    })
  }, [tradingMode, qty, orderType, limitPrice, triggerPrice, product, stopLoss, target, activeSymbol, price, positions, onSendAlert, prices, tick])

  const placeSellOrder = useCallback(() => {
    placeOrder({
      side: 'SELL',
      tradingMode,
      qty,
      orderType,
      limitPrice,
      triggerPrice,
      product,
      stopLoss,
      target,
      activeSymbol,
      price,
      positions,
      setPositions,
      onSendAlert,
      prices,
      tick,
    })
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

  const formattedPrice = price ? `₹${Number(price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

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
          {/* Quantity */}
          <div>
            <div className="text-[10px] text-muted mb-0.5">Quantity</div>
            <input
              type="number"
              value={qty}
              onChange={e => setQty(e.target.value)}
              className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none"
            />
          </div>

          {/* Order Type */}
          <div>
            <div className="text-[10px] text-muted mb-0.5">Order Type</div>
            <select
              value={orderType}
              onChange={e => setOrderType(e.target.value)}
              className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none"
            >
              <option value="Market">Market</option>
              <option value="Limit">Limit</option>
              <option value="SL">SL</option>
              <option value="SL-M">SL-M</option>
            </select>
          </div>

          {/* Limit Price */}
          <div>
            <div className="text-[10px] text-muted mb-0.5">Price</div>
            <input
              type="number"
              value={limitPrice}
              onChange={e => setLimitPrice(e.target.value)}
              disabled={priceDisabled}
              className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none disabled:opacity-40"
              placeholder={priceDisabled ? 'Auto (Market)' : 'Enter price'}
            />
          </div>

          {/* Trigger Price */}
          <div>
            <div className="text-[10px] text-muted mb-0.5">Trigger Price</div>
            <input
              type="number"
              value={triggerPrice}
              onChange={e => setTriggerPrice(e.target.value)}
              disabled={triggerDisabled}
              className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none disabled:opacity-40"
              placeholder={triggerDisabled ? 'N/A' : 'Enter trigger'}
            />
          </div>

          {/* Product */}
          <div>
            <div className="text-[10px] text-muted mb-0.5">Product</div>
            <select
              value={product}
              onChange={e => setProduct(e.target.value)}
              className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none"
            >
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
            <input
              type="number"
              value={stopLoss}
              onChange={e => setStopLoss(e.target.value)}
              className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none"
              placeholder="pts"
            />
          </div>
          <div>
            <div className="text-[10px] text-muted mb-0.5">Target</div>
            <input
              type="number"
              value={target}
              onChange={e => setTarget(e.target.value)}
              className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none"
              placeholder="pts"
            />
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
        <button
          onClick={placeBuyOrder}
          className="flex-1 py-2 rounded font-bold text-xs bg-green text-white hover:opacity-85 transition-opacity"
        >
          BUY {tradingMode === 'paper' ? '(Paper)' : ''}
        </button>
        <button
          onClick={placeSellOrder}
          className="flex-1 py-2 rounded font-bold text-xs bg-red text-white hover:opacity-85 transition-opacity"
        >
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

/* ------------------------------------------------------------------ */
/*  OPEN POSITIONS TABLE                                               */
/* ------------------------------------------------------------------ */
function OpenPositions({ positions, onClose }) {
  if (!positions || positions.length === 0) {
    return (
      <div className="text-[11px] text-muted pt-1">No open positions</div>
    )
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
                    <button
                      onClick={() => onClose(pos.id)}
                      className="text-[10px] text-muted hover:text-red transition-colors"
                    >
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

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */
function calcPnl(pos) {
  const ltp = pos.ltp ?? pos.avgPrice
  if (pos.qty > 0) return (ltp - pos.avgPrice) * pos.qty
  return (pos.avgPrice - ltp) * Math.abs(pos.qty)
}

function calcRR(sl, target, price) {
  const slNum = parseFloat(sl)
  const targetNum = parseFloat(target)
  const priceNum = parseFloat(price)
  if (!slNum || !targetNum || !priceNum) return null
  const risk = Math.abs(slNum)
  const reward = Math.abs(targetNum)
  if (risk === 0) return null
  return (reward / risk).toFixed(1)
}

function useMemoRR(sl, target, price) {
  const [rr, setRr] = useState(null)
  useEffect(() => {
    setRr(calcRR(sl, target, price))
  }, [sl, target, price])
  return rr
}

/* ------------------------------------------------------------------ */
/*  PLACE ORDER                                                        */
/* ------------------------------------------------------------------ */
async function placeOrder({
  side,
  tradingMode,
  qty,
  orderType,
  limitPrice,
  triggerPrice,
  product,
  stopLoss,
  target,
  activeSymbol,
  price,
  positions,
  setPositions,
  onSendAlert,
  prices,
  tick,
}) {
  const qtyNum = parseInt(qty, 10)
  if (!qtyNum || qtyNum <= 0) {
    onSendAlert('INFO', `[${side}] Invalid quantity`)
    return
  }

  // Fallback price detection to ensure we never get 0 or NaN fill prices
  let fillPrice = parseFloat(price) || 0
  if (!fillPrice && prices && prices[activeSymbol]) {
    fillPrice = parseFloat(prices[activeSymbol])
  }
  if (!fillPrice && tick && (tick.symbol === activeSymbol || tick.instrumentKey === activeSymbol)) {
    fillPrice = parseFloat(tick.ltp)
  }

  if (tradingMode === 'paper') {
    // Paper trading — add local position
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
    const msg = `${side} ${qtyNum} ${activeSymbol} @ ₹${fillPrice.toFixed(2)} (Paper)`
    onSendAlert(side, msg)
    return
  }

  // Live trading — POST /api/order
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
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await res.json()
    const msg = result.success
      ? `[LIVE] ${side} ${qtyNum} ${activeSymbol} — ${result.orderId ? 'Order #' + result.orderId : 'Placed'}`
      : `[LIVE] ${side} failed: ${result.error || 'Unknown error'}`
    onSendAlert(result.success ? side : 'INFO', msg)
  } catch (err) {
    onSendAlert('INFO', `[LIVE] ${side} error: ${err.message}`)
  }
}

/* ------------------------------------------------------------------ */
/*  ALERT LOG                                                          */
/* ------------------------------------------------------------------ */
function AlertLog({ alerts }) {
  const colorMap = {
    BUY: 'border-l-green bg-green/5',
    SELL: 'border-l-red bg-red/5',
    INFO: 'border-l-accent bg-accent/5',
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
      {alerts.map((a, i) => (
        <div key={i} className={`p-2 rounded border-l-[3px] text-[11px] leading-relaxed ${colorMap[a.signal] || colorMap.INFO}`}>
          <strong>{a.signal} {a.symbol && `— ${a.symbol}`}</strong><br />
          {a.message}
          {a.signal !== 'INFO' && (
            <span className="text-accent"> ₹{Number(priceFromAlert(a)).toFixed(2)}</span>
          )}
          <div className="text-[9px] text-muted mt-0.5">{a.time || ''}</div>
        </div>
      ))}
    </div>
  )
}

function priceFromAlert(a) {
  return a.message.match(/₹([\d.]+)/)?.[1] || 0
}

/* ------------------------------------------------------------------ */
/*  WEBHOOK PANEL                                                      */
/* ------------------------------------------------------------------ */
function WebhookPanel({ status }) {
  return (
    <div className="p-3 border-t border-border">
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
