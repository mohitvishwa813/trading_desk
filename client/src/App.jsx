import { useState, useEffect, useCallback, useRef } from 'react'
import TopBar from './components/TopBar'
import ChartPanel from './components/ChartPanel'
import Sidebar from './components/Sidebar'
import SymbolSearch from './components/SymbolSearch'
import TickerStrip from './components/TickerStrip'
import Watchlist from './components/Watchlist'
import OptionChain from './components/OptionChain'
import AutoTradeModal from './components/AutoTradeModal'
import StrategyGuideModal from './components/StrategyGuideModal'
import TradeHistoryModal from './components/TradeHistoryModal'
import { run } from './utils/strategyRunner'
import { transformHeikinAshi } from './utils/candleTransformer'

// ─── Login Screen Component (Glassmorphism & Rich Aesthetics) ────────────────
function LoginScreen({ onLoginSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const apiBase = import.meta.env.VITE_API_URL || ''
      const response = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed')
      }

      localStorage.setItem('token', data.token)
      onLoginSuccess()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#070913] overflow-hidden font-sans">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />

      <div className="relative w-full max-w-md p-8 mx-4 bg-[#0d1127]/60 backdrop-blur-xl border border-[#1e2345] rounded-2xl shadow-2xl z-10 text-slate-100">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-500 mb-4 shadow-lg shadow-indigo-500/25">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-white">
            Welcome Back
          </h2>
          <p className="text-sm text-[#8c9fc2] mt-2">
            Secure login to your Trading Terminal
          </p>
        </div>

        {error && (
          <div className="p-3 mb-6 bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs rounded-lg flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8c9fc2] mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-[#050711]/90 border border-[#1e2345] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white rounded-lg outline-none transition-all placeholder:text-slate-600 text-sm animate-none"
              placeholder="name@tradingdesk.com"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8c9fc2] mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-[#050711]/90 border border-[#1e2345] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-white rounded-lg outline-none transition-all placeholder:text-slate-600 text-sm animate-none"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-indigo-500 to-emerald-500 hover:from-indigo-600 hover:to-emerald-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-indigo-500/20 outline-none transition-all transform hover:-translate-y-[1px] disabled:opacity-50 disabled:pointer-events-none text-sm mt-8 flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Authenticating...</span>
              </>
            ) : (
              <span>Access Terminal</span>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'))
  const handleLogout = () => {
    localStorage.removeItem('token')
    setIsAuthenticated(false)
    setWsConnected(false)
  }

  // ── Existing state ──
  const [wsConnected, setWsConnected] = useState(false)
  const [mode, setMode] = useState('live') // 'live' | 'demo' — synced from server
  const [prices, setPrices] = useState({})
  const [openPrices, setOpenPrices] = useState({})
  const [tick, setTick] = useState(null)
  const [alerts, setAlerts] = useState([
    { signal: 'INFO', symbol: '', message: 'Dashboard started — Waiting for market data...' },
  ])
  const [webhookStatus, setWebhookStatus] = useState('Configure in .env file')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchKey, setSearchKey] = useState(0)
  const [tradesRefreshKey, setTradesRefreshKey] = useState(0)
  const wsRef = useRef(null)

  // ── Lifted states for live strategy updates & auto-refresh ──
  const [candlesMap, setCandlesMap] = useState({}) // chartIndex -> candles array
  const [chartTimeframes, setChartTimeframes] = useState(() => {
    try {
      const saved = localStorage.getItem('chartTimeframes')
      return saved ? JSON.parse(saved) : { 0: '5m', 1: '5m', 2: '5m', 3: '5m' }
    } catch {
      return { 0: '5m', 1: '5m', 2: '5m', 3: '5m' }
    }
  })

  // Refs to avoid stale closures in the WebSocket handler
  const chartConfigsRef = useRef([])
  const chartStrategiesRef = useRef({})
  const chartTimeframesRef = useRef(chartTimeframes)
  const candlesMapRef = useRef(candlesMap)
  const chartStylesRef = useRef(null)
  const lastStrategyRunTimeRef = useRef({}) // chartIndex -> timestamp ms

  // ── Auto-trading state ──
  const [autoTradeModalOpen, setAutoTradeModalOpen] = useState(false)
  const [strategyGuideOpen, setStrategyGuideOpen] = useState(false)
  const [tradeHistoryOpen, setTradeHistoryOpen] = useState(false)
  const [autoTradeState, setAutoTradeState] = useState({
    active: false,
    mode: 'PAPER', // 'PAPER' | 'LIVE'
    strategyId: '',
    qty: 10,
    timeframe: '5m',
    symbol: '',
    sessionId: null // unique ID per auto trade session for alert grouping
  })

  // ── Risk Manager Settings State ──
  const [riskManager, setRiskManager] = useState({ enabled: false, maxLoss: 100 })

  const handleSaveRiskManager = useCallback(async (settings) => {
    setRiskManager(settings)
    if (isAuthenticated) {
      const token = localStorage.getItem('token')
      try {
        await fetch('/api/user/settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ risk_manager: settings })
        })
      } catch (err) {
        console.error('Error saving risk manager settings:', err)
      }
    }
  }, [isAuthenticated])
  const lastExecutedSignalTimeRef = useRef(null)

  // ── Symbol map from API ──
  const [symbolMap, setSymbolMap] = useState({})
  const [symbolsReady, setSymbolsReady] = useState(false)

  // Fetch symbol map and user settings on mount
  useEffect(() => {
    if (!isAuthenticated) return
    
    // Fetch symbols mapping
    fetch('/api/instruments/symbols')
      .then(r => r.json())
      .then(data => {
        setSymbolMap(data || {})
        setSymbolsReady(true)
      })
      .catch(() => {})

    // Fetch synced user settings
    fetch('/api/user/settings', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.watchlist && data.watchlist.length > 0) {
          setWatchlistItems(data.watchlist)
        }
        if (data.ticker && data.ticker.length > 0) {
          setTickerItems(data.ticker)
        }
        if (data.risk_manager) {
          setRiskManager(data.risk_manager)
        }
      })
      .catch(err => console.error('Error fetching user settings:', err))
  }, [isAuthenticated])

  // Sync mode from server on mount
  useEffect(() => {
    if (!isAuthenticated) return
    fetch('/api/mode')
      .then(r => r.json())
      .then(d => setMode(d.mode || 'live'))
      .catch(() => {})
  }, [isAuthenticated])

  // Sync persistent auto trade status from backend on mount
  useEffect(() => {
    if (!isAuthenticated) return
    const token = localStorage.getItem('token')
    fetch('/api/autotrade/status', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (data.active) {
          setAutoTradeState({
            active: true,
            sessionId: data.sessionId,
            strategyId: data.strategyId,
            symbol: data.symbol,
            qty: data.qty,
            timeframe: data.timeframe,
            mode: data.mode,
            startTime: data.startTime,
            endTime: data.endTime,
            candleStyle: data.candleStyle
          })

          // Sync chart timeframe, symbol & candle style to match active auto trade
          setChartTimeframes(prev => ({ ...prev, [focusedChart]: data.timeframe }))
          if (data.candleStyle) {
            setChartStyles(prev => {
              const next = [...prev]
              next[focusedChart] = data.candleStyle
              return next
            })
          }
          setChartConfigs(prev => {
            const next = [...prev]
            const key = symbolMap[data.symbol.toUpperCase()] || data.symbol
            next[focusedChart] = { symbol: data.symbol, instrumentKey: key }
            return next
          })

          // Fetch strategy code to apply overlay to live chart
          fetch(`/api/strategies/${data.strategyId}`, {
            headers: { Authorization: `Bearer ${token}` }
          })
            .then(res => res.json())
            .then(strat => {
              // Run strategy runner locally on whatever candles are currently loaded
              const currentCandles = candlesMapRef.current[focusedChart] || []
              const activeStyle = chartStylesRef.current[focusedChart] || 'candles'
              const finalCandles = activeStyle === 'heikin_ashi' ? transformHeikinAshi(currentCandles) : currentCandles
              const result = finalCandles.length > 0 ? run(finalCandles, strat.code) : { signals: [], plots: [], lines: [], labels: [], dashboard: {} }
              setChartStrategies(prev => ({
                ...prev,
                [focusedChart]: {
                  ...result,
                  strategyId: strat.id,
                  strategyName: strat.name,
                  code: strat.code,
                  timeframe: data.timeframe
                }
              }))
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
  }, [isAuthenticated, symbolsReady])

  // Load historical alerts helper
  const fetchAlerts = useCallback(() => {
    if (!isAuthenticated) return
    const token = localStorage.getItem('token')
    fetch('/api/alerts', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          // Since server returns them DESC, reverse it so oldest is first or just set them!
          // Wait, actually our Accordion handles ordering itself. So let's keep latest at index 0.
          setAlerts(data)
        }
      })
      .catch(() => {})
  }, [isAuthenticated])

  useEffect(() => {
    fetchAlerts()
  }, [fetchAlerts])

  // Helper function to aggregate new ticks locally (matches ChartPanel.jsx logic)
  function appendTickToCandles(candles, tick, timeframe, symbol, instrumentKey) {
    if (!candles || candles.length === 0) return []
    
    // Timeframe seconds constants
    const TF_SECONDS = {
      '1m': 60, '3m': 180, '5m': 300, '10m': 600,
      '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200,
      '4h': 14400, '1d': 86400, '1w': 604800, '1month': 2592000,
    }

    const getMarketOpenOffset = (sym, instKey) => {
      const s = (sym || '').toUpperCase()
      const k = (instKey || '').toUpperCase()
      if (k.includes('BINANCE') || s === 'BTCUSD') return 0
      if (k.includes('MCX') || k.includes('NCD') || k.includes('CDS') || k.includes('_CD') || s.includes('CRUDE')) {
        return 9 * 3600
      }
      return 9 * 3600 + 15 * 60
    }

    const tfSec = TF_SECONDS[timeframe] || 300
    const offset = -new Date().getTimezoneOffset() * 60
    const nowSec = Math.floor((tick.timestamp || Date.now()) / 1000) + offset

    let candleTime
    if (tfSec < 86400) {
      const date = new Date(nowSec * 1000)
      const midnight = Math.floor(date.setUTCHours(0, 0, 0, 0) / 1000)
      const elapsed = nowSec - midnight
      const marketOpen = getMarketOpenOffset(symbol, instrumentKey)
      const bucketElapsed = marketOpen + Math.floor((elapsed - marketOpen) / tfSec) * tfSec
      candleTime = midnight + bucketElapsed
    } else {
      const date = new Date(nowSec * 1000)
      candleTime = Math.floor(date.setUTCHours(0, 0, 0, 0) / 1000)
    }

    const nextCandles = candles.map(c => ({ ...c }))
    const lastCandle = nextCandles[nextCandles.length - 1]

    if (lastCandle.time !== candleTime) {
      nextCandles.push({
        time: candleTime,
        open: tick.ltp,
        high: tick.ltp,
        low: tick.ltp,
        close: tick.ltp,
        volume: tick.v || tick.volume || 0
      })
    } else {
      lastCandle.high = Math.max(lastCandle.high, tick.ltp)
      lastCandle.low = Math.min(lastCandle.low, tick.ltp)
      lastCandle.close = tick.ltp
      lastCandle.volume += (tick.v || tick.volume || 0)
    }
    return nextCandles
  }

  // Auto-select first available symbol when map loads (no hardcoded defaults)
  useEffect(() => {
    if (!symbolsReady) return
    const keys = Object.keys(symbolMap)
    if (keys.length === 0) return

    setChartConfigs(prev => {
      if (prev[0].symbol) return prev // already has a symbol
      const next = [...prev]
      next[0] = { symbol: 'BTCUSD', instrumentKey: 'BINANCE|BTCUSD' }
      return next
    })

    setWatchlistItems(prev => {
      // If we already have items, ensure BTCUSD is prepended if not present
      if (prev.length > 0) {
        const migrated = prev.map(sym => {
          let s = sym.toUpperCase().replace(/[\s_-]/g, '')
          if (s === 'NIFTY50') return 'NIFTY'
          if (s === 'STATEBANK' || s === 'STATEBANKOFINDIA') return 'SBIN'
          return sym
        })
        if (migrated.includes('BTCUSD')) return migrated
        return ['BTCUSD', ...migrated]
      }
      // Otherwise populate from loaded symbols but put BTCUSD first
      const remaining = keys.filter(k => k !== 'BTCUSD').slice(0, 5)
      return ['BTCUSD', ...remaining]
    })
  }, [symbolsReady, symbolMap])

  const getInstrumentKey = useCallback((symbol) => symbolMap[symbol] || symbol, [symbolMap])

  // ── Tick cache for multi-chart ──
  const [tickCache, setTickCache] = useState({})

  // ── Multi-chart layout ──
  const [layoutMode, setLayoutMode] = useState(() => {
    try {
      return localStorage.getItem('layoutMode_v1') || 'single'
    } catch {
      return 'single'
    }
  }) // 'single' | 'side_by_side' | 'stacked' | 'grid'
  const [focusedChart, setFocusedChart] = useState(0)
  const [chartConfigs, setChartConfigs] = useState(() => {
    try {
      const saved = localStorage.getItem('chartConfigs_v2')
      if (saved) return JSON.parse(saved)
    } catch {}
    return [
      { symbol: '', instrumentKey: '' },
      { symbol: '', instrumentKey: '' },
      { symbol: '', instrumentKey: '' },
      { symbol: '', instrumentKey: '' },
    ]
  })

  // ── Subscribe chart instrument keys to Upstox feed ──
  const chartSubKeysRef = useRef(new Set())

  // ── Replay state (per chart) ──
  const [chartReplay, setChartReplay] = useState({})

  // ── Watchlist ──
  const [watchlistOpen, setWatchlistOpen] = useState(false)
  const [watchlistItems, setWatchlistItems] = useState(() => {
    try {
      const saved = localStorage.getItem('watchlistItems')
      if (saved) {
        const parsed = JSON.parse(saved)
        // Auto-migrate legacy alias symbols to real exchange trading symbols
        return parsed.map(sym => {
          let s = sym.toUpperCase().replace(/[\s_-]/g, '')
          if (s === 'NIFTY50') return 'NIFTY'
          if (s === 'STATEBANK' || s === 'STATEBANKOFINDIA') return 'SBIN'
          return sym
        })
      }
      return []
    } catch {
      return []
    }
  })

  // ── Ticker Items (max 6) ──
  const [tickerItems, setTickerItems] = useState(() => {
    try {
      const saved = localStorage.getItem('tickerItems_v4')
      if (saved) {
        return JSON.parse(saved)
      }
    } catch {}
    return [{ symbol: 'NIFTY', key: 'NSE_INDEX|Nifty 50' }]
  })

  useEffect(() => {
    localStorage.setItem('tickerItems_v4', JSON.stringify(tickerItems))
    if (isAuthenticated) {
      const token = localStorage.getItem('token')
      fetch('/api/user/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ ticker: tickerItems })
      }).catch(err => console.error('Error saving ticker items:', err))
    }
  }, [tickerItems, isAuthenticated])

  // ── Styles (lifted from ChartPanel to control globally in header) ──
  const [chartStyles, setChartStyles] = useState(() => {
    try {
      const saved = localStorage.getItem('chartStyles')
      return saved ? JSON.parse(saved) : ['candles', 'candles', 'candles', 'candles']
    } catch {
      return ['candles', 'candles', 'candles', 'candles']
    }
  })

  useEffect(() => {
    localStorage.setItem('chartStyles', JSON.stringify(chartStyles))
  }, [chartStyles])

  useEffect(() => {
    localStorage.setItem('chartConfigs_v2', JSON.stringify(chartConfigs))
  }, [chartConfigs])

  useEffect(() => {
    localStorage.setItem('layoutMode_v1', layoutMode)
  }, [layoutMode])

  useEffect(() => {
    localStorage.setItem('chartTimeframes', JSON.stringify(chartTimeframes))
  }, [chartTimeframes])

  // Subscribe whenever a chart, watchlist, or ticker changes, or WebSocket connects
  useEffect(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN || !wsConnected) return

    const keysToSub = new Set()

    // 1. Chart keys
    for (const config of chartConfigs) {
      if (config.instrumentKey) {
        keysToSub.add(config.instrumentKey)
        chartSubKeysRef.current.add(config.instrumentKey)
      }
    }

    // 2. Watchlist keys
    for (const sym of watchlistItems) {
      let resolvedSymbol = sym.toUpperCase().replace(/[\s_-]/g, '')
      if (resolvedSymbol === 'NIFTY50') resolvedSymbol = 'NIFTY'
      if (resolvedSymbol === 'STATEBANK' || resolvedSymbol === 'STATEBANKOFINDIA') resolvedSymbol = 'SBIN'

      const key = getInstrumentKey(resolvedSymbol) || getInstrumentKey(sym)
      if (key) keysToSub.add(key)
    }

    // 3. Ticker keys
    for (const item of tickerItems) {
      const sym = typeof item === 'string' ? item : item.symbol
      const key = typeof item === 'string'
        ? (getInstrumentKey(sym.toUpperCase().replace(/[\s_-]/g, '')) || getInstrumentKey(sym))
        : item.key
      if (key) keysToSub.add(key)
    }

    if (keysToSub.size > 0) {
      ws.send(JSON.stringify({ type: 'subscribe_all', keys: Array.from(keysToSub) }))
    }
  }, [chartConfigs, watchlistItems, tickerItems, getInstrumentKey, wsConnected])

  // ── Indicators per chart ──
  const [chartIndicators, setChartIndicators] = useState({})

  // ── Strategy runs per chart ──
  const [chartStrategies, setChartStrategies] = useState({})

  // ── Drawings per chart ──
  const [chartDrawings, setChartDrawings] = useState({})
  const [chartDrawingTools, setChartDrawingTools] = useState({})

  // ── Option Chain ──
  const [optionChainOpen, setOptionChainOpen] = useState(false)
  const [hasOptions, setHasOptions] = useState(false)
  const optionChainKeysRef = useRef([])
  const subscribedRef = useRef(new Set())

  // Keep references synced with current render state to avoid stale closure in WebSocket
  chartConfigsRef.current = chartConfigs
  chartStrategiesRef.current = chartStrategies
  chartTimeframesRef.current = chartTimeframes
  candlesMapRef.current = candlesMap
  chartStylesRef.current = chartStyles

  // ── Active symbol derived from focused chart ──
  const activeSymbol = chartConfigs[focusedChart]?.symbol || ''

  // Check if options exist for active symbol
  useEffect(() => {
    if (!activeSymbol) { setHasOptions(false); return }
    const upper = activeSymbol.toUpperCase()
    if (upper.endsWith('CE') || upper.endsWith('PE') || upper.includes('FUT')) {
      setHasOptions(false)
      return
    }
    fetch(`/api/optionchain/check/${encodeURIComponent(activeSymbol)}`)
      .then(r => r.json())
      .then(data => setHasOptions(data.hasOptions || false))
      .catch(() => setHasOptions(false))
  }, [activeSymbol])

  // Subscribe option chain instrument keys for live LTP
  const subscribeOptionKeys = useCallback((keys) => {
    optionChainKeysRef.current = keys
    if (keys.length === 0) return
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'subscribe_options', keys }))
  }, [])

  // ── Persist watchlist ──
  useEffect(() => {
    localStorage.setItem('watchlistItems', JSON.stringify(watchlistItems))
    if (isAuthenticated) {
      const token = localStorage.getItem('token')
      fetch('/api/user/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ watchlist: watchlistItems })
      }).catch(err => console.error('Error saving watchlist:', err))
    }
  }, [watchlistItems, isAuthenticated])

  // ── Resizable sidebar ──
  const SIDEBAR_MIN = 220
  const SIDEBAR_MAX = 600
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try { return parseInt(localStorage.getItem('sidebarWidth') || '300', 10) } catch { return 300 }
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true')
  const [sidebarResizing, setSidebarResizing] = useState(false)
  const sidebarSavedRef = useRef(sidebarWidth)

  useEffect(() => { localStorage.setItem('sidebarWidth', sidebarWidth.toString()) }, [sidebarWidth])
  useEffect(() => { localStorage.setItem('sidebarCollapsed', sidebarCollapsed.toString()) }, [sidebarCollapsed])

  const toggleSidebar = useCallback(() => {
    if (sidebarCollapsed) {
      const restore = sidebarSavedRef.current
      setSidebarWidth(restore)
      setSidebarCollapsed(false)
    } else {
      sidebarSavedRef.current = sidebarWidth
      setSidebarWidth(0)
      setSidebarCollapsed(true)
    }
  }, [sidebarCollapsed, sidebarWidth])

  const startSidebarResize = useCallback((e) => {
    e.preventDefault()
    setSidebarResizing(true)
  }, [])

  useEffect(() => {
    if (!sidebarResizing) return
    const onMove = (e) => {
      const cx = e.touches ? e.touches[0].clientX : e.clientX
      const w = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, window.innerWidth - cx))
      setSidebarWidth(w)
      if (sidebarCollapsed) setSidebarCollapsed(false)
    }
    const onUp = () => setSidebarResizing(false)
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
  }, [sidebarResizing, sidebarCollapsed])

  // ── WebSocket ──
  const connectWS = useCallback(() => {
    const getWsUrl = () => {
      const api = import.meta.env.VITE_API_URL || '';
      const token = localStorage.getItem('token') || '';
      let wsUrl = '';
      if (api) {
        const proto = api.startsWith('https') ? 'wss' : 'ws';
        const host = api.replace(/^https?:\/\//, '');
        wsUrl = `${proto}://${host}`;
      } else {
        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const devHost = import.meta.env.VITE_BACKEND_URL
          ? import.meta.env.VITE_BACKEND_URL.replace(/^https?:\/\//, '')
          : `${window.location.hostname || '127.0.0.1'}:3000`;
        const host = import.meta.env.DEV ? devHost : location.host;
        wsUrl = `${proto}://${host}`;
      }
      return `${wsUrl}?token=${token}`;
    };

    const ws = new WebSocket(getWsUrl())

    ws.onopen = () => {
      setWsConnected(true)
      // Re-subscribe chart instrument keys on reconnect
      const chartKeys = chartSubKeysRef.current
      if (chartKeys.size > 0) {
        ws.send(JSON.stringify({ type: 'subscribe_all', keys: Array.from(chartKeys) }))
      }
      // Re-subscribe option chain keys on reconnect
      const optKeys = optionChainKeysRef.current
      if (optKeys.length > 0) {
        ws.send(JSON.stringify({ type: 'subscribe_options', keys: optKeys }))
      }
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'tick') {
          const data = msg.data
          setPrices(prev => ({ ...prev, [data.symbol]: data.ltp }))
          setTick(data)
          // Build tick cache keyed by BOTH instrumentKey AND symbol (for absolute mapping resilience)
          setTickCache(prev => {
            const next = { ...prev }
            if (data.instrumentKey) next[data.instrumentKey] = data
            if (data.symbol) next[data.symbol.toUpperCase()] = data
            return next
          })
          // Track opening price (first tick per symbol)
          setOpenPrices(prev => {
            const baseOpen = data.close || data.open || data.ltp
            return prev[data.symbol] !== undefined ? prev : { ...prev, [data.symbol]: baseOpen }
          })

          // Real-time strategy auto-refresh: append tick and re-run active strategy
          setCandlesMap(prevMap => {
            const nextMap = { ...prevMap }
            const currentConfigs = chartConfigsRef.current || []
            const currentTimeframes = chartTimeframesRef.current || {}
            const currentStrategies = chartStrategiesRef.current || {}

            currentConfigs.forEach((config, idx) => {
              const tickKey = data.instrumentKey || data.symbol
              const chartKey = config.instrumentKey || config.symbol
              if (tickKey === chartKey) {
                const currentCandles = prevMap[idx] || []
                if (currentCandles.length > 0) {
                  const updatedCandles = appendTickToCandles(currentCandles, data, currentTimeframes[idx] || '5m', config.symbol, config.instrumentKey)
                  nextMap[idx] = updatedCandles

                  // Re-run active strategy if applied to this chart (with throttling to prevent lagging)
                  const activeStrat = currentStrategies[idx]
                  if (activeStrat && activeStrat.code) {
                    try {
                      const oldLastCandle = currentCandles[currentCandles.length - 1]
                      const newLastCandle = updatedCandles[updatedCandles.length - 1]
                      const isNewCandleBoundary = oldLastCandle && newLastCandle && (oldLastCandle.time !== newLastCandle.time)

                      const nowMs = Date.now()
                      const lastRunMs = lastStrategyRunTimeRef.current[idx] || 0
                      const timeElapsed = nowMs - lastRunMs

                      if (isNewCandleBoundary || timeElapsed >= 5000) {
                        lastStrategyRunTimeRef.current[idx] = nowMs
                        const activeStyle = chartStylesRef.current[idx] || 'candles'
                        const finalCandles = activeStyle === 'heikin_ashi' ? transformHeikinAshi(updatedCandles) : updatedCandles
                        const result = run(finalCandles, activeStrat.code)
                        setChartStrategies(prevStrats => ({
                          ...prevStrats,
                          [idx]: {
                            ...prevStrats[idx],
                            ...result
                          }
                        }))
                      }
                    } catch (err) {
                      console.error('Failed to run strategy on tick:', err)
                    }
                  }
                }
              }
            })
            return nextMap
          })
        }
        if (msg.type === 'mode_change') {
          // Update mode state so charts guard against cross-mode ticks
          setMode(msg.mode || 'live')
          // Clear stale prices so P&L doesn't show wrong values
          setOpenPrices({})
          setPrices({})
          // Re-subscribe chart instrument keys when mode toggles on server
          const chartKeys = chartSubKeysRef.current
          if (chartKeys.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'subscribe_all', keys: Array.from(chartKeys) }))
          }
        }
        if (msg.type === 'webhook_trade_update' || msg.type === 'autotrade_update') {
          setTradesRefreshKey(prev => prev + 1)
          fetchAlerts()
        }
      } catch {}
    }

    ws.onclose = () => {
      setWsConnected(false)
      setTimeout(connectWS, 3000)
    }

    wsRef.current = ws
  }, [])

  useEffect(() => {
    connectWS()
    return () => wsRef.current?.close()
  }, [connectWS])

  // ── Send alert ──
  const sendAlert = useCallback(async (signal, customMsg) => {
    const msg = customMsg || `${signal} signal on ${activeSymbol}`
    setAlerts(prev => [
      { signal, symbol: activeSymbol, message: msg, time: new Date().toLocaleTimeString() },
      ...prev,
    ])

    try {
      const res = await fetch('/api/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: activeSymbol,
          strategy: 'manual',
          price: prices[activeSymbol] || 0,
          signal,
          message: msg,
        }),
      })
      const result = await res.json()
      setWebhookStatus(
        result.success ? `Sent at ${new Date().toLocaleTimeString()}` : result.error
      )
    } catch (err) {
      setWebhookStatus(err.message)
    }
  }, [activeSymbol, prices])

  const handleStrategyResult = useCallback((result) => {
    setChartStrategies(prev => ({
      ...prev,
      [focusedChart]: result
    }))

    // Forward strategy alert events to the main Alert Log and webhooks
    if (result && Array.isArray(result.alerts)) {
      result.alerts.forEach(al => {
        sendAlert('INFO', `[Strategy Alert] ${al.message}`)
      })
    }
  }, [focusedChart, sendAlert])

  // ── Keyboard shortcut: Ctrl+K / Escape ──
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
        setSearchKey(k => k + 1)
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [searchOpen])

  // ── Select symbol (updates focused chart) ──
  const selectSymbol = (symbol, instrumentKey) => {
    setChartConfigs(prev => {
      const next = [...prev]
      let resolvedSymbol = (symbol || '').trim()
      const norm = resolvedSymbol.toUpperCase().replace(/[\s_-]/g, '')
      if (norm === 'NIFTY50') resolvedSymbol = 'NIFTY'
      if (norm === 'STATEBANK' || norm === 'STATEBANKOFINDIA') resolvedSymbol = 'SBIN'

      const key = instrumentKey || getInstrumentKey(norm) || getInstrumentKey(symbol)
      next[focusedChart] = { symbol: resolvedSymbol, instrumentKey: key }
      return next
    })
  }

  // ── Load option contract into focused chart ──
  const loadOptionContract = useCallback((tradingsymbol, instrumentKey) => {
    setChartConfigs(prev => {
      const next = [...prev]
      next[focusedChart] = { symbol: tradingsymbol, instrumentKey }
      return next
    })
  }, [focusedChart])

  // ── Quick buy from option chain ──
  const quickBuyOption = useCallback((tradingsymbol, instrumentKey) => {
    setOptionChainOpen(false)
    setChartConfigs(prev => {
      const next = [...prev]
      next[focusedChart] = { symbol: tradingsymbol, instrumentKey }
      return next
    })
  }, [focusedChart])

  // ── Helper: get tick by instrumentKey (preferred) or symbol from cache ──
  const getTickForSymbol = (symbol, instrumentKey) => {
    if (instrumentKey && tickCache[instrumentKey]) return tickCache[instrumentKey]
    if (symbol) {
      if (tickCache[symbol]) return tickCache[symbol]
      if (tickCache[symbol.toUpperCase()]) return tickCache[symbol.toUpperCase()]
    }
    return null
  }

  // ── Render chart panels based on layout mode ──
  function renderCharts() {
    const numCharts =
      layoutMode === 'single' ? 1 : layoutMode === 'grid' ? 4 : 2

    const panels = []
    for (let i = 0; i < numCharts; i++) {
      const config = chartConfigs[i] || { symbol: '', instrumentKey: '' }
      const chartTick = getTickForSymbol(config.symbol, config.instrumentKey)

      panels.push(
        <ChartPanel
          key={i}
          activeSymbol={config.symbol}
          instrumentKey={config.instrumentKey}
          tick={chartTick}
          chartLayoutMode={layoutMode}
          chartIndex={i}
          isFocused={focusedChart === i}
          liveCandles={candlesMap[i] || []}
          onFocus={() => setFocusedChart(i)}
          mode={mode}
          onSymbolChange={(symbol, instrumentKey) => {
            setChartConfigs(prev => {
              const next = [...prev]
              next[i] = { symbol, instrumentKey }
              return next
            })
          }}
          drawings={chartDrawings[i] || []}
          onDrawingsChange={(d) =>
            setChartDrawings(prev => ({ ...prev, [i]: d }))
          }
          activeDrawingTool={chartDrawingTools[i] || 'cursor'}
          onDrawingToolChange={(t) =>
            setChartDrawingTools(prev => ({ ...prev, [i]: t }))
          }
          indicators={chartIndicators[i] || []}
          onIndicatorsChange={(iList) =>
            setChartIndicators(prev => ({ ...prev, [i]: iList }))
          }
          replayMode={chartReplay[i]?.active || false}
          replayIndex={chartReplay[i]?.index || 0}
          onReplayUpdate={(idx) =>
            setChartReplay(prev => ({
              ...prev,
              [i]: { ...prev[i], index: idx },
            }))
          }
          onReplayEnd={() =>
            setChartReplay(prev => ({ ...prev, [i]: undefined }))
          }
          chartStyle={chartStyles[i]}
          onChartStyleChange={(styleVal) => setChartStyles(prev => { const next = [...prev]; next[i] = styleVal; return next })}
          // Ticker Strip props
          tickerItems={tickerItems}
          prices={prices}
          openPrices={openPrices}
          onTickerItemsChange={setTickerItems}
          strategySignals={chartStrategies[i]?.signals}
          strategyPlots={chartStrategies[i]?.plots}
          strategyLines={chartStrategies[i]?.lines}
          strategyLabels={chartStrategies[i]?.labels}
          strategyDashboard={chartStrategies[i]?.dashboard}
          strategyName={chartStrategies[i]?.strategyName}
          onClearStrategy={() => {
            setChartStrategies(prev => {
              const next = { ...prev }
              delete next[i]
              return next
            })
          }}
          tf={chartTimeframes[i]}
          onTimeframeChange={(newTf) => setChartTimeframes(prev => ({ ...prev, [i]: newTf }))}
          onCandlesLoaded={(loadedCandles) => {
            setCandlesMap(prev => ({ ...prev, [i]: loadedCandles }))

            // If a strategy is applied, evaluate it on the loaded candles
            const activeStrat = chartStrategiesRef.current[i] || chartStrategies[i]
            console.log('onCandlesLoaded index:', i, 'activeStrat:', activeStrat, 'candles count:', loadedCandles.length)
            if (activeStrat && activeStrat.code) {
              try {
                const activeStyle = chartStylesRef.current[i] || 'candles'
                const finalCandles = activeStyle === 'heikin_ashi' ? transformHeikinAshi(loadedCandles) : loadedCandles
                const result = run(finalCandles, activeStrat.code)
                console.log('Strategy run result signals:', result?.signals?.length)
                setChartStrategies(prevStrats => ({
                  ...prevStrats,
                  [i]: {
                    ...prevStrats[i],
                    ...result
                  }
                }))
              } catch (err) {
                console.error('Strategy run error:', err)
              }
            }
          }}
        />
      )
    }

    if (layoutMode === 'single') {
      return panels[0]
    }

    if (layoutMode === 'side_by_side') {
      return (
        <div className="flex flex-row flex-1 overflow-hidden">
          {panels.slice(0, 2)}
        </div>
      )
    }

    if (layoutMode === 'stacked') {
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          {panels.slice(0, 2)}
        </div>
      )
    }

    if (layoutMode === 'grid') {
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-row flex-1 overflow-hidden">
            {panels.slice(0, 2)}
          </div>
          <div className="flex flex-row flex-1 overflow-hidden border-t border-border">
            {panels.slice(2, 4)}
          </div>
        </div>
      )
    }

    return panels[0]
  }

  if (!isAuthenticated) {
    return <LoginScreen onLoginSuccess={() => setIsAuthenticated(true)} />;
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Top Bar */}
      <TopBar
        wsConnected={wsConnected}
        activeSymbol={activeSymbol}
        onOpenSearch={() => { setSearchOpen(true); setSearchKey(k => k + 1) }}
        onLogout={handleLogout}
        onOpenStrategyGuide={() => setStrategyGuideOpen(true)}
        onOpenHistory={() => setTradeHistoryOpen(true)}
        // Layout
        layoutMode={layoutMode}
        onLayoutModeChange={setLayoutMode}
        // Replay
        replayState={chartReplay[focusedChart]}
        onReplayToggle={() => {
          const chartIdx = focusedChart
          setChartReplay(prev => {
            const current = prev[chartIdx]
            if (current?.active) {
              return { ...prev, [chartIdx]: undefined }
            }
            return {
              ...prev,
              [chartIdx]: { active: true, index: 0, speed: 1, playing: false },
            }
          })
        }}
        onReplaySpeedChange={(speed) => {
          setChartReplay(prev => ({
            ...prev,
            [focusedChart]: { ...prev[focusedChart], speed },
          }))
        }}
        onReplayPlayPause={() => {
          setChartReplay(prev => ({
            ...prev,
            [focusedChart]: {
              ...prev[focusedChart],
              playing: !prev[focusedChart]?.playing,
            },
          }))
        }}
        onReplayStep={(dir) => {
          setChartReplay(prev => ({
            ...prev,
            [focusedChart]: {
              ...prev[focusedChart],
              index: (prev[focusedChart]?.index || 0) + dir,
            },
          }))
        }}
        onReplayJump={(count) => {
          setChartReplay(prev => ({
            ...prev,
            [focusedChart]: {
              ...prev[focusedChart],
              index: (prev[focusedChart]?.index || 0) + count,
            },
          }))
        }}
        // Watchlist
        watchlistOpen={watchlistOpen}
        onWatchlistToggle={() => setWatchlistOpen(o => !o)}
        // Option Chain
        hasOptions={hasOptions}
        onOpenOptionChain={() => setOptionChainOpen(true)}
        // Style (Stitched next to Option Chain)
        chartStyle={chartStyles[focusedChart]}
        onChartStyleChange={(styleVal) => setChartStyles(prev => { const next = [...prev]; next[focusedChart] = styleVal; return next })}
        // Auto Trade
        autoTradeActive={autoTradeState.active}
        onOpenAutoTradeSettings={() => setAutoTradeModalOpen(true)}
        // Risk Manager
        riskManager={riskManager}
        onSaveRiskManager={handleSaveRiskManager}
      />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Watchlist panel (left) */}
        {watchlistOpen && (
          <Watchlist
            isOpen={watchlistOpen}
            onClose={() => setWatchlistOpen(false)}
            items={watchlistItems}
            onItemsChange={setWatchlistItems}
            prices={prices}
            onSelectSymbol={(symbol) => {
              selectSymbol(symbol)
              setWatchlistOpen(false)
            }}
          />
        )}

        {/* Chart area */}
        <div className="flex-1 flex overflow-hidden min-w-0">
          {renderCharts()}
        </div>

        {/* Sidebar splitter + always-visible toggle handle */}
        <div
          className={`shrink-0 relative flex items-center transition-colors duration-150
            ${sidebarResizing ? 'bg-accent/20' : 'bg-surface hover:bg-accent/10'}
          `}
          style={{ width: 14, cursor: 'col-resize' }}
          onMouseDown={startSidebarResize}
          onTouchStart={startSidebarResize}
        >
          {/* thin border lines */}
          <div className="absolute inset-y-0 left-0 w-px bg-border" />
          {/* Always-visible expand/collapse button */}
          <button
            id="sidebar-toggle-handle"
            onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2
              w-4 h-10 rounded flex items-center justify-center
              bg-[#1a1d24] border border-border text-muted
              hover:text-accent hover:border-accent hover:bg-[#1e2130]
              transition-all duration-150 z-10"
            style={{ fontSize: 10 }}
          >
            <svg
              width="8" height="14" viewBox="0 0 8 14" fill="none"
              style={{
                transform: sidebarCollapsed ? 'rotate(180deg)' : 'none',
                transition: 'transform 200ms ease',
              }}
            >
              <path d="M6 2L2 7L6 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Sidebar (right) */}
        <div
          className="shrink-0 overflow-y-auto"
          style={{
            width: sidebarWidth,
            transition: sidebarResizing ? 'none' : 'width 180ms ease',
          }}
        >
          <Sidebar
            activeSymbol={activeSymbol}
            price={prices[activeSymbol] || 0}
            alerts={alerts}
            webhookStatus={webhookStatus}
            onSendAlert={sendAlert}
            prices={prices}
            tick={tick}
            instrumentKey={getInstrumentKey(activeSymbol)}
            sidebarCollapsed={sidebarCollapsed}
            onToggleCollapse={toggleSidebar}
            onStrategyResult={handleStrategyResult}
            tradesRefreshKey={tradesRefreshKey}
            chartTimeframe={chartTimeframes[focusedChart] || '5m'}
            onTimeframeChange={(newTf) => {
              setChartTimeframes(prev => ({ ...prev, [focusedChart]: newTf }))
            }}
            chartStyle={chartStyles[focusedChart] || 'candles'}
          />
        </div>
      </div>

      {/* Symbol Search Modal */}
      <SymbolSearch
        key={searchKey}
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(tradingsymbol, instrumentKey) => {
          selectSymbol(tradingsymbol, instrumentKey)
          setSearchOpen(false)
        }}
      />
      <OptionChain
        isOpen={optionChainOpen}
        onClose={() => setOptionChainOpen(false)}
        activeSymbol={activeSymbol}
        tickCache={tickCache}
        onLoadContract={loadOptionContract}
        onSubscribeKeys={subscribeOptionKeys}
        onQuickBuy={quickBuyOption}
      />
      <AutoTradeModal
        isOpen={autoTradeModalOpen}
        onClose={() => setAutoTradeModalOpen(false)}
        activeSymbol={activeSymbol}
        autoTradeState={autoTradeState}
        chartStyle={chartStyles[focusedChart] || 'candles'}
        onStartAutoTrade={async (config) => {
          try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/autotrade/start', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify(config)
            })
            const data = await res.json()
            if (data.success) {
              setAutoTradeState({
                active: true,
                ...config,
                sessionId: data.sessionId
              })
              setAutoTradeModalOpen(false)

              // Sync chart timeframe & symbol to match active auto trade
              setChartTimeframes(prev => ({ ...prev, [focusedChart]: config.timeframe }))
              setChartConfigs(prev => {
                const next = [...prev]
                const key = symbolMap[config.symbol.toUpperCase()] || config.symbol
                next[focusedChart] = { symbol: config.symbol, instrumentKey: key }
                return next
              })

              // Load active strategy overlay
              fetch(`/api/strategies/${config.strategyId}`, {
                headers: { Authorization: `Bearer ${token}` }
              })
                .then(res => res.json())
                .then(strat => {
                  const currentCandles = candlesMapRef.current[focusedChart] || []
                  const activeStyle = chartStylesRef.current[focusedChart] || 'candles'
                  const finalCandles = activeStyle === 'heikin_ashi' ? transformHeikinAshi(currentCandles) : currentCandles
                  const result = finalCandles.length > 0 ? run(finalCandles, strat.code) : { signals: [], plots: [], lines: [], labels: [], dashboard: {} }
                  setChartStrategies(prev => ({
                    ...prev,
                    [focusedChart]: {
                      ...result,
                      strategyId: strat.id,
                      strategyName: strat.name,
                      code: strat.code,
                      timeframe: config.timeframe
                    }
                  }))
                })
                .catch(() => {})

              // Reload alert logs immediately
              fetchAlerts()
            }
          } catch (err) {
            console.error('Failed to start auto trade:', err)
          }
        }}
        onStopAutoTrade={async () => {
          try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/autotrade/stop', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` }
            })
            const data = await res.json()
            if (data.success) {
              setAutoTradeState(prev => ({ ...prev, active: false, sessionId: null }))
              setAutoTradeModalOpen(false)
              fetchAlerts()
            }
          } catch (err) {
            console.error('Failed to stop auto trade:', err)
          }
        }}
      />
      <StrategyGuideModal
        isOpen={strategyGuideOpen}
        onClose={() => setStrategyGuideOpen(false)}
      />
      <TradeHistoryModal
        isOpen={tradeHistoryOpen}
        onClose={() => setTradeHistoryOpen(false)}
        prices={prices}
      />
    </div>
  )
}
