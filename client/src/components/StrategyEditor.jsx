import { useState, useEffect, useCallback, useRef } from 'react'
import { run, validateCode } from '../utils/strategyRunner'

const DEFAULT_CODE = `// ─── Trade Desk Strategy Editor ────────────────────────────────
// Available globals (no imports needed):
//   bars[], open[], high[], low[], close[], volume[]
//
// TA functions:
//   ta.sma(src, period)          ta.ema(src, period)
//   ta.rsi(src, period)          ta.atr(period)
//   ta.macd(src, f, s, sig)  →  [macd[], signal[], histogram[]]
//   ta.bb(src, period, mult)  →  [upper[], middle[], lower[]]
//   ta.supertrend(f, p)       →  [value[], direction[]]
//   ta.vwap()                    ta.stoch(k, d)  → [k[], d[]]
//   ta.obv()                     ta.volumeMa(period)
//   ta.crossover(a, b, i)        ta.crossunder(a, b, i)
//
// Strategy:
//   strategy.buy(barIndex, label)
//   strategy.sell(barIndex, label)
//   strategy.close(barIndex, label)
//
// Chart output:
//   plot(series, name, color)
// ────────────────────────────────────────────────────────────────

const ma  = ta.sma(close, 14)
const rsi = ta.rsi(close, 14)

for (let i = 1; i < bars.length; i++) {
  if (ta.crossover(close, ma, i) && rsi[i] < 70) {
    strategy.buy(i, 'Long Entry')
  }
  if (ta.crossunder(close, ma, i) && rsi[i] > 30) {
    strategy.sell(i, 'Short Exit')
  }
}

plot(ma, 'SMA 14', '#7c6af7')
`

const TIMEFRAMES = ['1m','3m','5m','10m','15m','30m','1h','2h','4h','1d']

export default function StrategyEditor({ activeSymbol, onStrategyResult }) {
  const [code, setCode]               = useState(DEFAULT_CODE)
  const [strategies, setStrategies]   = useState([])  // list from backend
  const [currentId, setCurrentId]     = useState(null)
  const [currentName, setCurrentName] = useState('Untitled Strategy')
  const [tf, setTf]                   = useState('5m')
  const [running, setRunning]         = useState(false)
  const [stats, setStats]             = useState(null)
  const [logs, setLogs]               = useState([])
  const [syntaxErr, setSyntaxErr]     = useState(null)
  const [showNameEdit, setShowNameEdit] = useState(false)
  const [dirty, setDirty]             = useState(false)

  const outputRef   = useRef(null)
  const debounceRef = useRef(null)

  // ── Load strategy list on mount ──────────────────────────────────────────────
  useEffect(() => {
    fetchStrategies()
  }, [])

  async function fetchStrategies() {
    try {
      const r = await fetch('/api/strategies')
      if (r.ok) setStrategies(await r.json())
    } catch {}
  }

  // ── Live syntax validation (debounced 400ms) ─────────────────────────────────
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const result = validateCode(code)
      setSyntaxErr(result.valid ? null : result)
    }, 400)
    return () => clearTimeout(debounceRef.current)
  }, [code])

  // ── Auto-scroll output ───────────────────────────────────────────────────────
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [logs])

  // ── Run strategy ─────────────────────────────────────────────────────────────
  const runStrategy = useCallback(async () => {
    if (!activeSymbol) {
      setLogs(['[ERROR] No symbol selected on chart'])
      return
    }
    setRunning(true)
    setLogs([`[INFO] Fetching ${tf} candles for ${activeSymbol}…`])
    setStats(null)

    try {
      // Fetch candle data from existing /api/history endpoint
      const params = new URLSearchParams({ tf })
      const r = await fetch(`/api/history/${encodeURIComponent(activeSymbol)}?${params}`)
      const json = await r.json()
      const candles = json.candles || json  // handle both wrapped and raw formats

      if (!Array.isArray(candles) || candles.length === 0) {
        setLogs(['[ERROR] No candle data returned from server'])
        setRunning(false)
        return
      }

      // Aggregate if needed (server returns 1m, we may need higher TF)
      const aggregated = aggregateCandles(candles, tf)

      setLogs([`[INFO] Running strategy on ${aggregated.length} bars…`])

      // Run strategy (synchronous)
      const result = run(aggregated, code)
      setLogs(result.logs)
      setStats(result.stats)
      onStrategyResult(result)
    } catch (err) {
      setLogs([`[ERROR] ${err.message}`])
    } finally {
      setRunning(false)
    }
  }, [activeSymbol, tf, code, onStrategyResult])

  // ── Clear signals ────────────────────────────────────────────────────────────
  const clearSignals = useCallback(() => {
    setStats(null)
    setLogs([])
    onStrategyResult({ plots: [], signals: [], stats: null, logs: [], lines: [], labels: [], dashboard: {}, alerts: [] })
  }, [onStrategyResult])

  // ── Save strategy ────────────────────────────────────────────────────────────
  const saveStrategy = useCallback(async () => {
    try {
      const body = { id: currentId || undefined, name: currentName, code }
      const r = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const saved = await r.json()
      setCurrentId(saved.id)
      setDirty(false)
      await fetchStrategies()
      setLogs(prev => [`[INFO] Saved as "${saved.name}"`, ...prev])
    } catch (err) {
      setLogs(prev => [`[ERROR] Save failed: ${err.message}`, ...prev])
    }
  }, [currentId, currentName, code])

  // ── Load strategy ────────────────────────────────────────────────────────────
  const loadStrategy = useCallback(async (id) => {
    try {
      const r = await fetch(`/api/strategies/${id}`)
      const s = await r.json()
      setCode(s.code)
      setCurrentId(s.id)
      setCurrentName(s.name)
      setDirty(false)
      setStats(null)
      setLogs([`[INFO] Loaded "${s.name}"`])
    } catch (err) {
      setLogs([`[ERROR] Load failed: ${err.message}`])
    }
  }, [])

  // ── Delete strategy ──────────────────────────────────────────────────────────
  const deleteStrategy = useCallback(async () => {
    if (!currentId) return
    if (!confirm(`Delete "${currentName}"?`)) return
    try {
      await fetch(`/api/strategies/${currentId}`, { method: 'DELETE' })
      setCurrentId(null)
      setCurrentName('Untitled Strategy')
      setCode(DEFAULT_CODE)
      setDirty(false)
      await fetchStrategies()
      setLogs([`[INFO] Strategy deleted`])
    } catch (err) {
      setLogs([`[ERROR] Delete failed: ${err.message}`])
    }
  }, [currentId, currentName])

  // ── New strategy ─────────────────────────────────────────────────────────────
  const newStrategy = () => {
    setCurrentId(null)
    setCurrentName('Untitled Strategy')
    setCode(DEFAULT_CODE)
    setStats(null)
    setLogs([])
    setDirty(false)
    onStrategyResult({ plots: [], signals: [], stats: null, logs: [], lines: [], labels: [], dashboard: {}, alerts: [] })
  }

  // ── Code change ──────────────────────────────────────────────────────────────
  const handleCodeChange = (e) => {
    setCode(e.target.value)
    setDirty(true)
  }

  // ── Tab key in editor ────────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      const el = e.target
      const s = el.selectionStart
      const end = el.selectionEnd
      const next = code.substring(0, s) + '  ' + code.substring(end)
      setCode(next)
      requestAnimationFrame(() => { el.selectionStart = s + 2; el.selectionEnd = s + 2 })
    }
    if (e.shiftKey && e.key === 'Enter') {
      e.preventDefault()
      runStrategy()
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ fontFamily: 'inherit' }}>

      {/* ── Toolbar ── */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-border bg-[#0d0f14]">
        {/* Strategy selector */}
        <div className="relative flex-1 min-w-0">
          <select
            value={currentId || ''}
            onChange={e => e.target.value ? loadStrategy(e.target.value) : newStrategy()}
            className="w-full bg-[#1a1d24] border border-border text-[#e2e8f0] px-2 py-1 rounded text-[11px] focus:border-accent focus:outline-none truncate"
          >
            <option value="">— {currentName}{dirty ? ' *' : ''} —</option>
            {strategies.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* New */}
        <button
          id="strategy-new-btn"
          onClick={newStrategy}
          title="New strategy"
          className="shrink-0 px-1.5 py-1 rounded text-[10px] text-muted hover:text-[#e2e8f0] bg-[#1a1d24] border border-border hover:border-accent transition-colors"
        >+ New</button>

        {/* Save */}
        <button
          id="strategy-save-btn"
          onClick={() => { if (!currentId || dirty) saveStrategy(); else saveStrategy() }}
          title="Save strategy (Ctrl+S)"
          className={`shrink-0 px-1.5 py-1 rounded text-[10px] font-bold border transition-colors ${
            dirty ? 'text-white bg-accent border-accent' : 'text-muted bg-[#1a1d24] border-border hover:border-accent hover:text-[#e2e8f0]'
          }`}
        >Save</button>

        {/* Delete */}
        {currentId && (
          <button
            id="strategy-delete-btn"
            onClick={deleteStrategy}
            title="Delete strategy"
            className="shrink-0 px-1.5 py-1 rounded text-[10px] text-red-400 bg-[#1a1d24] border border-border hover:border-red-500 transition-colors"
          >Del</button>
        )}
      </div>

      {/* ── Strategy name edit ── */}
      <div className="shrink-0 flex items-center px-2 py-1 border-b border-border bg-[#080a0e]">
        <input
          type="text"
          value={currentName}
          onChange={e => { setCurrentName(e.target.value); setDirty(true) }}
          className="flex-1 bg-transparent text-[11px] text-[#94a3b8] focus:text-[#e2e8f0] focus:outline-none border-b border-transparent focus:border-accent/50 transition-colors"
          placeholder="Strategy name…"
        />
        {dirty && <span className="text-[9px] text-amber-400 ml-1">unsaved</span>}
      </div>

      {/* ── Code Editor ── */}
      <div className="relative flex-shrink-0" style={{ minHeight: 200, maxHeight: '45%' }}>
        <textarea
          id="strategy-code-editor"
          value={code}
          onChange={handleCodeChange}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          className="w-full h-full resize-none bg-[#080a0e] text-[#e2e8f0] px-3 py-3 focus:outline-none leading-relaxed"
          style={{
            minHeight: 200,
            maxHeight: '45vh',
            fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code','Consolas',monospace",
            fontSize: 11.5,
            lineHeight: 1.7,
            tabSize: 2,
            caretColor: '#7c6af7',
            border: 'none',
          }}
        />
        {/* Syntax error indicator */}
        {syntaxErr && (
          <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1.5 px-3 py-1.5 bg-red-950/80 border-t border-red-800/50 text-[10px] text-red-300">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5.5" stroke="currentColor" strokeWidth="1"/>
              <path d="M6 3.5v3M6 8v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            {syntaxErr.line ? `Line ${syntaxErr.line}: ` : ''}{syntaxErr.error}
          </div>
        )}
      </div>

      <div className="h-px bg-border shrink-0" />

      {/* ── Run Bar ── */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1.5 border-b border-border bg-[#0d0f14]">
        <button
          id="strategy-run-btn"
          onClick={runStrategy}
          disabled={running || !!syntaxErr}
          title="Run on chart (Shift+Enter)"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold text-white bg-accent hover:opacity-85 disabled:opacity-40 transition-opacity"
        >
          {running ? (
            <svg width="10" height="10" viewBox="0 0 10 10" className="animate-spin">
              <circle cx="5" cy="5" r="4" stroke="white" strokeWidth="1.5" fill="none" strokeDasharray="14" strokeDashoffset="7"/>
            </svg>
          ) : '▶'}
          Run
        </button>

        <button
          id="strategy-clear-btn"
          onClick={clearSignals}
          className="px-2 py-1 rounded text-[11px] text-muted bg-[#1a1d24] border border-border hover:text-[#e2e8f0] hover:border-accent/50 transition-colors"
        >■ Clear</button>

        {/* Timeframe */}
        <select
          value={tf}
          onChange={e => setTf(e.target.value)}
          className="ml-auto bg-[#1a1d24] border border-border text-[#e2e8f0] px-1.5 py-1 rounded text-[11px] focus:border-accent focus:outline-none"
        >
          {TIMEFRAMES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <span className="text-[10px] text-muted">
          {activeSymbol ? activeSymbol : 'No symbol'}
        </span>
      </div>

      {/* ── Stats Bar ── */}
      {stats && (
        <div className="shrink-0 flex items-center gap-3 px-3 py-1.5 border-b border-border bg-[#0a0c10] text-[10px]">
          <span className="text-muted">{stats.totalTrades} trades</span>
          {stats.totalTrades > 0 && (
            <>
              <span className="text-[#34d399]">Win {stats.winRate}</span>
              <span className={stats.totalPnL >= 0 ? 'text-[#34d399]' : 'text-red-400'}>
                P&amp;L {stats.totalPnL >= 0 ? '+' : ''}₹{stats.totalPnL.toLocaleString('en-IN')}
              </span>
              {stats.maxDrawdown < 0 && (
                <span className="text-amber-400">DD ₹{stats.maxDrawdown.toLocaleString('en-IN')}</span>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Output Log ── */}
      <div
        ref={outputRef}
        id="strategy-output"
        className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 bg-[#060810] min-h-[100px]"
        style={{ fontFamily: "'JetBrains Mono','Fira Code','Consolas',monospace", fontSize: 10.5 }}
      >
        {logs.length === 0 && (
          <div className="text-muted italic text-[11px] pt-1">Run a strategy to see output here.</div>
        )}
        {logs.map((line, i) => (
          <LogLine key={i} line={line} />
        ))}
      </div>

      {/* ── Footer hint ── */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1 border-t border-border bg-[#0d0f14]">
        <span className="text-[9px] text-muted">Shift+Enter to run · Tab to indent</span>
        <span className="text-[9px] text-muted">{logs.length} lines</span>
      </div>
    </div>
  )
}

// ── Log line component ────────────────────────────────────────────────────────
function LogLine({ line }) {
  let color = '#64748b'
  if (line.startsWith('[BUY]'))   color = '#34d399'
  if (line.startsWith('[SELL]'))  color = '#f87171'
  if (line.startsWith('[CLOSE]')) color = '#94a3b8'
  if (line.startsWith('[ERROR]')) color = '#f87171'
  if (line.startsWith('[WARN]'))  color = '#fbbf24'
  if (line.startsWith('[INFO]'))  color = '#7c6af7'
  if (line.startsWith('[LOG]'))   color = '#94a3b8'

  return (
    <div className="flex gap-1.5 items-start py-0.5 leading-relaxed">
      <pre className="flex-1 whitespace-pre-wrap break-all m-0" style={{ color, fontFamily: 'inherit', fontSize: 'inherit' }}>
        {line}
      </pre>
    </div>
  )
}

// ── Aggregate 1m candles to higher timeframe ──────────────────────────────────
function aggregateCandles(candles, tf) {
  const TF_SECONDS = {
    '1m': 60, '3m': 180, '5m': 300, '10m': 600,
    '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200,
    '4h': 14400, '1d': 86400,
  }
  const tfSec = TF_SECONDS[tf] || 60
  if (tfSec === 60) return candles

  const result = []
  let current = null

  for (const c of candles) {
    const bucket = Math.floor(c.time / tfSec) * tfSec
    if (!current || current.time !== bucket) {
      if (current) result.push(current)
      current = { time: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }
    } else {
      current.high   = Math.max(current.high, c.high)
      current.low    = Math.min(current.low, c.low)
      current.close  = c.close
      current.volume += c.volume
    }
  }
  if (current) result.push(current)
  return result
}
