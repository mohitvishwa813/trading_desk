import { useState } from 'react'

export default function Sidebar({ activeSymbol, price, alerts, webhookStatus, onSendAlert }) {
  return (
    <div className="w-[300px] bg-surface border-l border-border flex flex-col shrink-0 overflow-hidden">
      <StrategyPanel activeSymbol={activeSymbol} price={price} onSendAlert={onSendAlert} />
      <div className="text-[10px] font-bold tracking-widest text-muted uppercase px-3.5 py-2.5 border-b border-border bg-[#0d0f14]">
        Alert Log
      </div>
      <AlertLog alerts={alerts} />
      <WebhookPanel status={webhookStatus} />
    </div>
  )
}

function StrategyPanel({ activeSymbol, price, onSendAlert }) {
  const [strategy, setStrategy] = useState('manual')
  const [priceLevel, setPriceLevel] = useState('')
  const [rsiVal, setRsiVal] = useState('70')
  const [customNote, setCustomNote] = useState('')

  return (
    <div className="p-3 border-b border-border">
      <div className="mb-2.5">
        <div className="text-[10px] text-muted mb-1">STRATEGY</div>
        <select
          value={strategy}
          onChange={e => setStrategy(e.target.value)}
          className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none"
        >
          <option value="manual">Manual Signal</option>
          <option value="ema_cross">EMA Crossover (9/21)</option>
          <option value="rsi">RSI Overbought/Oversold</option>
          <option value="breakout">Price Breakout</option>
          <option value="custom">Custom Note</option>
        </select>
      </div>

      {strategy === 'breakout' && (
        <div className="mb-2.5">
          <div className="text-[10px] text-muted mb-1">BREAKOUT PRICE LEVEL</div>
          <input
            type="number"
            placeholder="e.g. 22500"
            value={priceLevel}
            onChange={e => setPriceLevel(e.target.value)}
            className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none"
          />
        </div>
      )}

      {strategy === 'rsi' && (
        <div className="mb-2.5">
          <div className="text-[10px] text-muted mb-1">RSI THRESHOLD</div>
          <input
            type="number"
            placeholder="70 = overbought"
            value={rsiVal}
            onChange={e => setRsiVal(e.target.value)}
            className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none"
          />
        </div>
      )}

      {strategy === 'custom' && (
        <div className="mb-2.5">
          <div className="text-[10px] text-muted mb-1">CUSTOM MESSAGE</div>
          <input
            type="text"
            placeholder="Your alert message..."
            value={customNote}
            onChange={e => setCustomNote(e.target.value)}
            className="w-full bg-[#0d0f14] border border-border text-[#e2e8f0] px-2 py-1.5 rounded font-mono text-xs focus:border-accent focus:outline-none"
          />
        </div>
      )}

      <div className="flex gap-1.5 mt-2">
        <button className="flex-1 py-1.5 rounded font-bold text-xs bg-green text-white hover:opacity-85 transition-opacity" onClick={() => onSendAlert('BUY')}>
          BUY
        </button>
        <button className="flex-1 py-1.5 rounded font-bold text-xs bg-red text-white hover:opacity-85 transition-opacity" onClick={() => onSendAlert('SELL')}>
          SELL
        </button>
      </div>
      <button className="w-full mt-1.5 py-1.5 rounded font-bold text-xs bg-transparent border border-border text-muted hover:bg-border/50 transition-colors" onClick={() => onSendAlert('INFO')}>
        INFO Alert
      </button>
    </div>
  )
}

function AlertLog({ alerts }) {
  const colorMap = {
    BUY: 'border-l-green bg-green/5',
    SELL: 'border-l-red bg-red/5',
    INFO: 'border-l-accent bg-accent/5',
  }
  const iconMap = { BUY: '', SELL: '', INFO: '' }

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
