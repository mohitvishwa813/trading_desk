import { useState, useEffect, useCallback, useRef } from 'react'
import TopBar from './components/TopBar'
import ChartPanel from './components/ChartPanel'
import Sidebar from './components/Sidebar'
import SymbolSearch from './components/SymbolSearch'

export default function App() {
  const [wsConnected, setWsConnected] = useState(false)
  const [mode, setMode] = useState('live')
  const [prices, setPrices] = useState({})
  const [activeSymbol, setActiveSymbol] = useState('NIFTY50')
  const [tick, setTick] = useState(null)
  const [alerts, setAlerts] = useState([{ signal: 'INFO', symbol: '', message: 'Dashboard started — Waiting for market data...' }])
  const [webhookStatus, setWebhookStatus] = useState('Configure in .env file')
  const [searchOpen, setSearchOpen] = useState(false)

  const wsRef = useRef(null)

  const toggleMode = async (newMode) => {
    try {
      await fetch('/api/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: newMode }),
      })
      setMode(newMode)
      if (newMode === 'live') {
        setPrices({})
        setTick(null)
      }
    } catch {}
  }

  const connectWS = useCallback(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const host = import.meta.env.DEV ? 'localhost:3000' : location.host
    const ws = new WebSocket(`${proto}://${host}`)

    ws.onopen = () => {
      setWsConnected(true)
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'tick') {
          const data = msg.data
          setPrices(prev => ({ ...prev, [data.symbol]: data.ltp }))
          setTick(data)
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
    fetch('/api/mode').then(r => r.json()).then(({ mode: m }) => {
      setMode(m)
    }).catch(() => {})
    connectWS()
    return () => wsRef.current?.close()
  }, [connectWS])

  const sendAlert = async (signal) => {
    const msg = `${signal} signal on ${activeSymbol}`
    setAlerts(prev => [{ signal, symbol: activeSymbol, message: msg, time: new Date().toLocaleTimeString() }, ...prev])

    try {
      const res = await fetch('/api/alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: activeSymbol, strategy: 'manual', price: prices[activeSymbol] || 0, signal, message: msg })
      })
      const result = await res.json()
      setWebhookStatus(result.success ? `Sent at ${new Date().toLocaleTimeString()}` : result.error)
    } catch (err) {
      setWebhookStatus(err.message)
    }
  }

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [searchOpen])

  const selectSymbol = (symbol) => {
    setActiveSymbol(symbol)
  }

  return (
    <div className="h-screen flex flex-col">
      <TopBar
        mode={mode}
        wsConnected={wsConnected}
        activeSymbol={activeSymbol}
        onToggleMode={toggleMode}
        onOpenSearch={() => setSearchOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <ChartPanel
          activeSymbol={activeSymbol}
          tick={tick}
        />
        <Sidebar
          activeSymbol={activeSymbol}
          price={prices[activeSymbol] || 0}
          alerts={alerts}
          webhookStatus={webhookStatus}
          onSendAlert={sendAlert}
        />
      </div>

      <SymbolSearch
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(symbol) => {
          selectSymbol(symbol)
          setSearchOpen(false)
        }}
      />
    </div>
  )
}
