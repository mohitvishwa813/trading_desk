import { useState, useEffect, useRef } from 'react'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button
      onClick={handleCopy}
      className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[9px] font-bold transition-all border outline-none opacity-0 group-hover:opacity-100 focus:opacity-100 ${
        copied 
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' 
          : 'bg-[#151922] text-[#808290] border-[#222533] hover:text-white hover:bg-[#1a1f2b]'
      }`}
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  )
}

export default function StrategyGuideModal({ isOpen, onClose }) {
  const [activeSec, setActiveSec] = useState('getting-started')
  const scrollContainerRef = useRef(null)

  const sections = [
    { id: 'getting-started', label: 'Getting Started' },
    { id: 'coding-rules', label: 'Coding Rules' },
    { id: 'starter-template', label: 'Starter Template' },
    { id: 'indicators', label: 'Indicators (ta.*)' },
    { id: 'execution', label: 'Execution (strategy.*)' },
    { id: 'drawings', label: 'Visual Drawings (chart.*)' },
  ]

  // Track active section on scroll
  useEffect(() => {
    if (!isOpen || !scrollContainerRef.current) return

    const container = scrollContainerRef.current
    const sectionElements = sections.map(sec => container.querySelector(`#sec-${sec.id}`)).filter(Boolean)

    const observerOptions = {
      root: container,
      rootMargin: '-10% 0px -70% 0px',
      threshold: 0
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id.replace('sec-', '')
          setActiveSec(id)
        }
      })
    }, observerOptions)

    sectionElements.forEach(el => observer.observe(el))

    return () => {
      sectionElements.forEach(el => observer.unobserve(el))
    }
  }, [isOpen])

  const scrollToSection = (id) => {
    if (!scrollContainerRef.current) return
    const el = scrollContainerRef.current.querySelector(`#sec-${id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveSec(id)
    }
  }

  if (!isOpen) return null

  const starterCode = `// 1. Calculate technical indices
const fast = ta.ema(close, 9);
const slow = ta.ema(close, 21);

// 2. Loop through bars (skip warm-up period)
for (let i = 21; i < bars.length; i++) {
  // Check crossovers
  if (ta.crossover(fast, slow, i)) {
    // Trigger Long Buy entry
    strategy.buy(i, 'EMA Cross Buy', { qty: 10, style: 'label-box' });
  } else if (ta.crossunder(fast, slow, i)) {
    // Close Long position
    strategy.close(i, 'EMA Cross Exit');
  }
}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-5xl h-[85vh] bg-[#0a0d16] border border-[#222533] rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1b1e2a] bg-[#0c0f1b]">
          <div>
            <h3 className="text-sm font-bold text-white tracking-wide uppercase">Strategy Creator Guide</h3>
            <p className="text-[10px] text-muted">Complete references, concepts, and templates for trade desk automation</p>
          </div>
          <button 
            onClick={onClose}
            className="text-muted hover:text-white transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Inner layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left panel navigation */}
          <div className="w-56 border-r border-[#1b1e2a] bg-[#080a11] p-3 space-y-1 overflow-y-auto">
            {sections.map(sec => (
              <button
                key={sec.id}
                onClick={() => scrollToSection(sec.id)}
                className={`w-full text-left px-3 py-2 text-[11px] font-semibold rounded uppercase tracking-wider transition-all duration-150 ${
                  activeSec === sec.id
                    ? 'bg-[#7c6af7]/15 text-[#9181f9] border-l-2 border-[#7c6af7]'
                    : 'text-[#808290] hover:bg-white/5 hover:text-white border-l-2 border-transparent'
                }`}
              >
                {sec.label}
              </button>
            ))}
          </div>

          {/* Right panel scroll container */}
          <div 
            ref={scrollContainerRef}
            className="flex-1 bg-[#090b14] p-6 overflow-y-auto text-xs text-[#a9adc1] leading-relaxed space-y-12 scroll-smooth"
          >
            
            {/* 1. Getting Started */}
            <div id="sec-getting-started" className="space-y-4 pt-2">
              <h4 className="text-sm font-extrabold text-white uppercase tracking-wider border-b border-[#1b1e2a] pb-2">1. Getting Started</h4>
              <p>
                The **Strategy Terminal** utilizes a custom Javascript DSL (Domain Specific Language) execution engine. You write clean Javascript trading code that executes locally in the browser for backtesting, and runs persistently on the backend server for Auto-Trading.
              </p>
              <div className="bg-[#101323]/50 border border-[#212437] rounded-lg p-4 space-y-2">
                <h5 className="font-bold text-[#9181f9]">Core Market Data inputs:</h5>
                <p>
                  Your script has direct access to the global <code className="text-amber-400 bg-black/40 px-1 py-0.5 rounded font-mono">bars</code> array containing OHLCV candle structures in chronological order:
                </p>
                <div className="relative group">
                  <pre className="bg-[#05060b] p-3 rounded text-[11px] font-mono text-emerald-400 overflow-x-auto border border-[#161a29]">
{`bars = [
  { time: 1719890000, open: 62500, high: 62700, low: 62400, close: 62600, volume: 15 },
  ...
]`}
                  </pre>
                  <CopyButton text={`bars = [\n  { time: 1719890000, open: 62500, high: 62700, low: 62400, close: 62600, volume: 15 },\n  ...\n]`} />
                </div>
                <p>
                  You also have helper array variables: <code className="text-white font-mono">open</code>, <code className="text-white font-mono">high</code>, <code className="text-white font-mono">low</code>, <code className="text-white font-mono">close</code>, and <code className="text-white font-mono">volume</code> representing individual numeric values.
                </p>
              </div>
            </div>

            {/* 2. Coding Rules */}
            <div id="sec-coding-rules" className="space-y-4 pt-2">
              <h4 className="text-sm font-extrabold text-white uppercase tracking-wider border-b border-[#1b1e2a] pb-2">2. Crucial Coding Rules</h4>
              <div className="space-y-4">
                <div className="bg-[#141724] border border-[#252a3f] p-3.5 rounded-lg">
                  <span className="font-bold text-amber-400 block mb-1">A. Loop Index Offset (i = 1 or higher)</span>
                  <span>Never start your evaluation loops at index 0. Crossover/crossunder functions inspect index `i - 1`, which will result in index errors and runner crashes if evaluated on index 0.</span>
                  <div className="relative group mt-2">
                    <pre className="bg-[#05060b] p-2.5 rounded text-[11px] font-mono text-emerald-400">for (let i = 1; i &lt; bars.length; i++) &#123; ... &#125;</pre>
                    <CopyButton text="for (let i = 1; i < bars.length; i++) { ... }" />
                  </div>
                </div>

                <div className="bg-[#141724] border border-[#252a3f] p-3.5 rounded-lg">
                  <span className="font-bold text-amber-400 block mb-1">B. Handle Indicator Warm-up Periods</span>
                  <span>Indicators like Simple Moving Averages need warm-up bars to compute. An SMA of length 50 returns null values for the first 49 indices. Guard your logic against evaluating on empty slots:</span>
                  <div className="relative group mt-2">
                    <pre className="bg-[#05060b] p-2.5 rounded text-[11px] font-mono text-emerald-400">{`const ma = ta.sma(close, 50);
for (let i = 50; i < bars.length; i++) {
  if (close[i] > ma[i]) { ... }
}`}</pre>
                    <CopyButton text={`const ma = ta.sma(close, 50);\nfor (let i = 50; i < bars.length; i++) {\n  if (close[i] > ma[i]) { ... }\n}`} />
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Starter Template */}
            <div id="sec-starter-template" className="space-y-4 pt-2">
              <h4 className="text-sm font-extrabold text-white uppercase tracking-wider border-b border-[#1b1e2a] pb-2">3. Starter Crossover Template</h4>
              <p>
                Use this simple moving average crossover starter template to quickly build your strategy scripts:
              </p>
              <div className="relative group">
                <pre className="bg-[#05060b] p-3 rounded text-[11px] font-mono text-indigo-300 overflow-x-auto border border-[#161a29]">
                  {starterCode}
                </pre>
                <CopyButton text={starterCode} />
              </div>
            </div>

            {/* 4. Indicators */}
            <div id="sec-indicators" className="space-y-4 pt-2">
              <h4 className="text-sm font-extrabold text-white uppercase tracking-wider border-b border-[#1b1e2a] pb-2">4. Indicators reference (ta.*)</h4>
              <div className="space-y-3">
                <div className="border-b border-[#1b1e2a]/50 pb-3">
                  <span className="font-bold text-white font-mono block">ta.ema(series, period)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Calculates Exponential Moving Average.</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">const emaVal = ta.ema(close, 14);</pre>
                    <CopyButton text="const emaVal = ta.ema(close, 14);" />
                  </div>
                </div>

                <div className="border-b border-[#1b1e2a]/50 pb-3">
                  <span className="font-bold text-white font-mono block">ta.sma(series, period)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Calculates Simple Moving Average.</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">const smaVal = ta.sma(close, 50);</pre>
                    <CopyButton text="const smaVal = ta.sma(close, 50);" />
                  </div>
                </div>

                <div className="border-b border-[#1b1e2a]/50 pb-3">
                  <span className="font-bold text-white font-mono block">ta.rsi(series, period)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Calculates Relative Strength Index (0 to 100).</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">const rsiVal = ta.rsi(close, 14);</pre>
                    <CopyButton text="const rsiVal = ta.rsi(close, 14);" />
                  </div>
                </div>

                <div className="border-b border-[#1b1e2a]/50 pb-3">
                  <span className="font-bold text-white font-mono block">ta.macd(series, fast, slow, signal)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Calculates MACD, signal line, and histogram arrays.</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">{`const { macd, signal, hist } = ta.macd(close, 12, 26, 9);`}</pre>
                    <CopyButton text="const { macd, signal, hist } = ta.macd(close, 12, 26, 9);" />
                  </div>
                </div>

                <div className="border-b border-[#1b1e2a]/50 pb-3">
                  <span className="font-bold text-white font-mono block">ta.bb(series, period, stddev)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Calculates Bollinger Bands lines.</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">{`const [upper, middle, lower] = ta.bb(close, 20, 2.0);`}</pre>
                    <CopyButton text="const [upper, middle, lower] = ta.bb(close, 20, 2.0);" />
                  </div>
                </div>

                <div className="border-b border-[#1b1e2a]/50 pb-3">
                  <span className="font-bold text-white font-mono block">ta.supertrend(multiplier, period)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Calculates Supertrend bands and trend direction (+1 for bullish, -1 for bearish).</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">{`const [trendLine, direction] = ta.supertrend(3.0, 10);`}</pre>
                    <CopyButton text="const [trendLine, direction] = ta.supertrend(3.0, 10);" />
                  </div>
                </div>

                <div className="pb-2">
                  <span className="font-bold text-white font-mono block">ta.crossover(array1, array2, index) / ta.crossunder(array1, array2, index)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Checks if array1 crossed above/below array2 at the given index index.</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">{`if (ta.crossover(fast, slow, i)) { ... }`}</pre>
                    <CopyButton text="if (ta.crossover(fast, slow, i)) { ... }" />
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Execution */}
            <div id="sec-execution" className="space-y-4 pt-2">
              <h4 className="text-sm font-extrabold text-white uppercase tracking-wider border-b border-[#1b1e2a] pb-2">5. Order Execution reference (strategy.*)</h4>
              <div className="space-y-3">
                <div className="border-b border-[#1b1e2a]/50 pb-3">
                  <span className="font-bold text-white font-mono block">strategy.buy(index, label, options?)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Triggers entry BUY order. Single position rule is enforced automatically.</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">{`strategy.buy(i, 'Long Entry', { qty: 10, style: 'label-box' });`}</pre>
                    <CopyButton text="strategy.buy(i, 'Long Entry', { qty: 10, style: 'label-box' });" />
                  </div>
                </div>

                <div className="border-b border-[#1b1e2a]/50 pb-3">
                  <span className="font-bold text-white font-mono block">strategy.sell(index, label, options?)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Triggers entry SELL (short) order. Single position rule is enforced automatically.</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">{`strategy.sell(i, 'Short Entry', { qty: 10 });`}</pre>
                    <CopyButton text="strategy.sell(i, 'Short Entry', { qty: 10 });" />
                  </div>
                </div>

                <div className="border-b border-[#1b1e2a]/50 pb-3">
                  <span className="font-bold text-white font-mono block">strategy.close(index, label, options?)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Closes active position. Pass <code className="text-white">qty</code> option for partial profit taking exits (e.g. 50% exit).</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">{`strategy.close(i, 'Partial Exit', { qty: 5 });`}</pre>
                    <CopyButton text="strategy.close(i, 'Partial Exit', { qty: 5 });" />
                  </div>
                </div>

                <div className="border-b border-[#1b1e2a]/50 pb-3">
                  <span className="font-bold text-white font-mono block">strategy.exit(index, options)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Registers automated Stop Loss (sl) and Take Profit (tp) bracket order targets.</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">{`strategy.exit(i, { sl: 2540, tp: 2600 });`}</pre>
                    <CopyButton text="strategy.exit(i, { sl: 2540, tp: 2600 });" />
                  </div>
                </div>

                <div className="border-b border-[#1b1e2a]/50 pb-3">
                  <span className="font-bold text-white font-mono block">strategy.trailingStop(options)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Sets trailing stop percent trigger.</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">{`strategy.trailingStop({ trailPercent: 1.5 });`}</pre>
                    <CopyButton text="strategy.trailingStop({ trailPercent: 1.5 });" />
                  </div>
                </div>

                <div className="pb-2">
                  <span className="font-bold text-white font-mono block">strategy.alert(condition, options)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Triggers webhooks and webhook alerts. You **must** pass a unique <code className="text-white">id</code> in the options object to avoid de-duplication filtering. Supports template parameters like <code className="text-white">{"{{close}}"}</code>, <code className="text-white">{"{{time}}"}</code>.</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">{`strategy.alert(true, { id: 'buy_alert_' + i, message: 'Long entry triggered at price {{close}}' });`}</pre>
                    <CopyButton text="strategy.alert(true, { id: 'buy_alert_' + i, message: 'Long entry triggered at price {{close}}' });" />
                  </div>
                </div>
              </div>
            </div>

            {/* 6. Visual Drawings */}
            <div id="sec-drawings" className="space-y-4 pt-2 pb-12">
              <h4 className="text-sm font-extrabold text-white uppercase tracking-wider border-b border-[#1b1e2a] pb-2">6. Visual Drawings reference (chart.* & dashboard.*)</h4>
              <div className="space-y-3">
                <div className="border-b border-[#1b1e2a]/50 pb-3">
                  <span className="font-bold text-white font-mono block">plot(series, name, color)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Draws a continuous line plot on the chart.</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">{`plot(ema9, 'EMA 9', '#ff4a4a');`}</pre>
                    <CopyButton text="plot(ema9, 'EMA 9', '#ff4a4a');" />
                  </div>
                </div>

                <div className="border-b border-[#1b1e2a]/50 pb-3">
                  <span className="font-bold text-white font-mono block">chart.priceLine(id, price, options)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Draws horizontal support or target lines across the scale.</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">{`chart.priceLine("TargetLine", 65200, { label: "Target: 65200", color: "#00c853" });`}</pre>
                    <CopyButton text={`chart.priceLine("TargetLine", 65200, { label: "Target: 65200", color: "#00c853" });`} />
                  </div>
                </div>

                <div className="pb-2">
                  <span className="font-bold text-white font-mono block">dashboard.table(id, rows, options)</span>
                  <span className="text-muted text-[10.5px] block mt-0.5">Renders custom tabular overlays (like multi-timeframe metric summaries) on the chart panel.</span>
                  <div className="relative group mt-1">
                    <pre className="bg-[#05060b] p-2 rounded text-[11px] font-mono text-emerald-400">{`dashboard.table("MTF_Status", [ ["5m", "UPTREND", "BUY"], ["15m", "DOWNTREND", "SELL"] ], { headers: ["TF", "Trend", "Signal"] });`}</pre>
                    <CopyButton text={`dashboard.table("MTF_Status", [ ["5m", "UPTREND", "BUY"], ["15m", "DOWNTREND", "SELL"] ], { headers: ["TF", "Trend", "Signal"] });`} />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#1b1e2a] bg-[#0c0f1b] flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#7c6af7] hover:bg-[#6c58ef] text-white rounded text-xs font-bold transition-all shadow-[0_4px_12px_rgba(124,106,247,0.2)]"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  )
}
