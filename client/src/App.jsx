import { useState, useEffect, useCallback, useRef } from 'react'
import TopBar from './components/TopBar'
import ChartPanel from './components/ChartPanel'
import Sidebar from './components/Sidebar'
import SymbolSearch from './components/SymbolSearch'
import TickerStrip from './components/TickerStrip'
import Watchlist from './components/Watchlist'
import OptionChain from './components/OptionChain'

export default function App() {
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
  const wsRef = useRef(null)

  // ── Symbol map from API ──
  const [symbolMap, setSymbolMap] = useState({})
  const [symbolsReady, setSymbolsReady] = useState(false)

  useEffect(() => {
    fetch('/api/instruments/symbols')
      .then(r => r.json())
      .then(data => {
        setSymbolMap(data || {})
        setSymbolsReady(true)
      })
      .catch(() => {})
  }, [])

  // Sync mode from server on mount
  useEffect(() => {
    fetch('/api/mode')
      .then(r => r.json())
      .then(d => setMode(d.mode || 'live'))
      .catch(() => {})
  }, [])

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
  const [layoutMode, setLayoutMode] = useState('single') // 'single' | 'side_by_side' | 'stacked' | 'grid'
  const [focusedChart, setFocusedChart] = useState(0)
  const [chartConfigs, setChartConfigs] = useState([
    { symbol: '', instrumentKey: '' },
    { symbol: '', instrumentKey: '' },
    { symbol: '', instrumentKey: '' },
    { symbol: '', instrumentKey: '' },
  ])

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

  // Subscribe whenever a chart or watchlist changes, or WebSocket connects
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

    if (keysToSub.size > 0) {
      ws.send(JSON.stringify({ type: 'subscribe_all', keys: Array.from(keysToSub) }))
    }
  }, [chartConfigs, watchlistItems, getInstrumentKey, wsConnected])

  // ── Indicators per chart ──
  const [chartIndicators, setChartIndicators] = useState({})

  // ── Drawings per chart ──
  const [chartDrawings, setChartDrawings] = useState({})
  const [chartDrawingTools, setChartDrawingTools] = useState({})

  // ── Option Chain ──
  const [optionChainOpen, setOptionChainOpen] = useState(false)
  const [hasOptions, setHasOptions] = useState(false)
  const optionChainKeysRef = useRef([])
  const subscribedRef = useRef(new Set())

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
  }, [watchlistItems])

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
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const devHost = import.meta.env.VITE_BACKEND_URL
      ? import.meta.env.VITE_BACKEND_URL.replace(/^https?:\/\//, '')
      : `${window.location.hostname || '127.0.0.1'}:3000`

    const host = import.meta.env.DEV ? devHost : location.host
    const ws = new WebSocket(`${proto}://${host}`)

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
          // Build tick cache keyed by instrumentKey (unique, survives symbol name mismatches)
          const cacheKey = data.instrumentKey || data.symbol
          setTickCache(prev => ({ ...prev, [cacheKey]: data }))
          // Track opening price (first tick per symbol)
          setOpenPrices(prev =>
            prev[data.symbol] !== undefined ? prev : { ...prev, [data.symbol]: data.ltp }
          )
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
  const sendAlert = async (signal, customMsg) => {
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
  }

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
    if (symbol && tickCache[symbol]) return tickCache[symbol]
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

  return (
    <div className="h-screen flex flex-col">
      {/* Top Bar */}
      <TopBar
        wsConnected={wsConnected}
        activeSymbol={activeSymbol}
        onOpenSearch={() => { setSearchOpen(true); setSearchKey(k => k + 1) }}
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
      />

      {/* Ticker Strip */}
      {prices && Object.keys(prices).length > 0 && watchlistItems.length > 0 && (
        <TickerStrip
          instruments={watchlistItems}
          prices={prices}
          openPrices={openPrices}
          activeSymbol={activeSymbol}
          onSelect={(sym) => {
            selectSymbol(sym)
          }}
        />
      )}

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

        {/* Sidebar splitter */}
        <div
          className={`w-[5px] shrink-0 relative cursor-col-resize transition-colors duration-150
            ${sidebarResizing ? 'bg-accent/50' : 'bg-surface hover:bg-accent/30'}
            ${sidebarCollapsed ? 'opacity-60' : ''}`}
          onMouseDown={startSidebarResize}
          onTouchStart={startSidebarResize}
          onDoubleClick={toggleSidebar}
        >
          <div className="absolute inset-y-0 left-0 w-px bg-border" />
          <div className="absolute inset-y-0 right-0 w-px bg-border" />
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
    </div>
  )
}
