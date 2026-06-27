export default function TickerStrip({ instruments, prices, openPrices, activeSymbol, onSelect }) {
  return (
    <div className="flex bg-surface border-b border-border shrink-0 overflow-x-auto">
      {instruments.map(sym => {
        const price = prices[sym]
        const open = openPrices[sym] || price
        const change = price ? price - open : 0
        const changePct = open ? ((change / open) * 100).toFixed(2) : '0.00'
        const dir = change >= 0 ? 'text-green' : 'text-red'

        return (
          <div
            key={sym}
            className={`px-4 py-1.5 cursor-pointer border-r border-border whitespace-nowrap select-none transition-colors hover:bg-accent/5 ${
              activeSymbol === sym ? 'border-b-2 border-accent bg-accent/5' : ''
            }`}
            onClick={() => onSelect(sym)}
          >
            <div className="text-[11px] font-bold">{sym}</div>
            <div className={`text-sm font-bold ${dir}`}>
              {price !== undefined ? price.toFixed(2) : '--'}
            </div>
            <div className={`text-[10px] ${dir}`}>
              {price !== undefined ? `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePct}%)` : '--'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
