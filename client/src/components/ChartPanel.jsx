import { useEffect, useRef, useState, useCallback } from 'react'
import { createChart } from 'lightweight-charts'
import CandleSelector from './CandleSelector'

const TF_SECONDS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1d': 86400 }
const MIN_PANEL_HEIGHT = 28
const MAX_PANEL_HEIGHT = 150

function aggregateCandles(candles, tfSec) {
  if (tfSec === 60) return candles
  const result = []
  let current = null
  for (const c of candles) {
    const bucket = Math.floor(c.time / tfSec) * tfSec
    if (!current || current.time !== bucket) {
      if (current) result.push(current)
      current = { time: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }
    } else {
      current.high = Math.max(current.high, c.high)
      current.low = Math.min(current.low, c.low)
      current.close = c.close
      current.volume += c.volume
    }
  }
  if (current) result.push(current)
  return result
}

function computeHeikinAshi(candles) {
  const ha = []
  let prev = null
  for (const c of candles) {
    const haClose = (c.open + c.high + c.low + c.close) / 4
    const haOpen = prev ? (prev.haOpen + prev.haClose) / 2 : (c.open + c.close) / 2
    const haHigh = Math.max(c.high, haOpen, haClose)
    const haLow = Math.min(c.low, haOpen, haClose)
    const item = { time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose, volume: c.volume, haOpen, haClose }
    ha.push(item)
    prev = item
  }
  return ha
}

function transformData(candles, style) {
  if (style === 'heikin_ashi') {
    const ha = computeHeikinAshi(candles)
    return ha.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }))
  }
  if (style === 'line' || style === 'line_markers' || style === 'step_line' || style === 'area' || style === 'hlc_area' || style === 'baseline') {
    return candles.map(c => ({ time: c.time, value: c.close }))
  }
  if (style === 'columns' || style === 'high_low') {
    return candles.map(c => ({ time: c.time, value: c.close }))
  }
  return candles
}

function transformTick(candle, style) {
  if (style === 'heikin_ashi') {
    const haClose = (candle.open + candle.high + candle.low + candle.close) / 4
    return { time: candle.time, value: haClose }
  }
  if (style === 'line' || style === 'line_markers' || style === 'step_line' || style === 'area' || style === 'hlc_area' || style === 'baseline') {
    return { time: candle.time, value: candle.close }
  }
  if (style === 'columns' || style === 'high_low') {
    return { time: candle.time, value: candle.close }
  }
  return candle
}

function fmtTime(ts) {
  const d = new Date(ts * 1000)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fmtRange(from, to) {
  const f = new Date(from * 1000)
  const t = new Date(to * 1000)
  const pad = n => String(n).padStart(2, '0')
  if (f.getTime() === t.getTime()) return fmtTime(from)
  const sameDay = f.toDateString() === t.toDateString()
  if (sameDay) return `${pad(f.getHours())}:${pad(f.getMinutes())} - ${pad(t.getHours())}:${pad(t.getMinutes())}`
  return `${fmtTime(from)} - ${fmtTime(to)}`
}

function getSeriesOptions(style) {
  if (style === 'bars') return {}
  if (style === 'candles') return {
    upColor: '#26a69a', downColor: '#ef5350',
    borderUpColor: '#26a69a', borderDownColor: '#ef5350',
    wickUpColor: '#26a69a', wickDownColor: '#ef5350',
  }
  if (style === 'hollow_candles') return {
    upColor: '#26a69a', downColor: '#ef5350',
    borderUpColor: '#26a69a', borderDownColor: '#ef5350',
    wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    hollowRealBody: true,
  }
  if (style === 'volume_candles') return {
    upColor: '#26a69a', downColor: '#ef5350',
    borderUpColor: '#26a69a', borderDownColor: '#ef5350',
    wickUpColor: '#26a69a', wickDownColor: '#ef5350',
  }
  if (style === 'heikin_ashi') return {
    upColor: '#26a69a', downColor: '#ef5350',
    borderUpColor: '#26a69a', borderDownColor: '#ef5350',
    wickUpColor: '#26a69a', wickDownColor: '#ef5350',
  }
  if (style === 'step_line') return { color: '#4f9cf9', lineWidth: 2, lineType: 2 }
  if (style === 'line_markers') return { color: '#4f9cf9', lineWidth: 2 }
  if (style === 'line') return { color: '#4f9cf9', lineWidth: 2 }
  if (style === 'area') return { topColor: '#4f9cf940', bottomColor: '#4f9cf905', lineColor: '#4f9cf9', lineWidth: 2 }
  if (style === 'hlc_area') return { topColor: '#4f9cf940', bottomColor: '#4f9cf905', lineColor: '#4f9cf9', lineWidth: 2 }
  if (style === 'baseline') return { topColor: '#4f9cf940', bottomColor: '#4f9cf905', lineColor: '#4f9cf9', lineWidth: 2 }
  if (style === 'columns') return { color: '#26a69a', base: 0 }
  if (style === 'high_low') return { color: '#4f9cf9', lineWidth: 1 }
  return {}
}

function isCandleSeries(style) {
  return ['candles', 'hollow_candles', 'volume_candles', 'heikin_ashi'].includes(style)
}

function isBarSeries(style) {
  return style === 'bars'
}

function isLineSeries(style) {
  return ['line', 'line_markers', 'step_line', 'high_low'].includes(style)
}

function isAreaSeries(style) {
  return ['area', 'hlc_area', 'baseline'].includes(style)
}

function isColumnSeries(style) {
  return style === 'columns'
}

export default function ChartPanel({ activeSymbol, tick }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const barSeriesRef = useRef(null)
  const lineSeriesRef = useRef(null)
  const areaSeriesRef = useRef(null)
  const candleBufferRef = useRef({})
  const contextMenuRef = useRef(null)
  const dragHandleRef = useRef(null)
  const fetchIdRef = useRef(0)
  const loadedDataRef = useRef([])
  const [tf, setTF] = useState('5m')
  const [candleStyle, setCandleStyle] = useState(() => {
    return localStorage.getItem('chartCandleStyle') || 'candles'
  })
  const [ctxMenu, setCtxMenu] = useState({ show: false, x: 0, y: 0 })
  const [visibleRange, setVisibleRange] = useState(null)
  const [bottomPanelHeight, setBottomPanelHeight] = useState(() => {
    const saved = localStorage.getItem('chartTimeScaleHeight')
    return saved ? Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, parseInt(saved, 10))) : 40
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    localStorage.setItem('chartCandleStyle', candleStyle)
  }, [candleStyle])

  const applyToSeries = useCallback((series, data, style) => {
    if (!series) return
    const opts = getSeriesOptions(style)
    series.applyOptions(opts)
    series.setData(data)

    if (style === 'line_markers') {
      series.setMarkers(
        data.filter((_, i) => i % 10 === 0).map(d => ({
          time: d.time, position: 'abovePrice', color: '#4f9cf9',
          shape: 'circle', size: 0.5,
        }))
      )
    } else {
      series.setMarkers([])
    }
  }, [])

  const refreshChart = useCallback((candles, style) => {
    if (!candleSeriesRef.current || !candles.length) return

    const tfSec = TF_SECONDS[tf] || 60
    const aggregated = aggregateCandles(candles, tfSec)
    loadedDataRef.current = aggregated

    const transformed = transformData(aggregated, style)

    candleSeriesRef.current.applyOptions({ visible: isCandleSeries(style) })
    barSeriesRef.current?.applyOptions({ visible: isBarSeries(style) })
    lineSeriesRef.current.applyOptions({ visible: isLineSeries(style) || isColumnSeries(style) })
    areaSeriesRef.current.applyOptions({ visible: isAreaSeries(style) })

    if (isCandleSeries(style)) {
      applyToSeries(candleSeriesRef.current, transformed, style)
    } else if (isBarSeries(style)) {
      barSeriesRef.current?.setData(transformed)
    } else if (isLineSeries(style) || isColumnSeries(style)) {
      applyToSeries(lineSeriesRef.current, transformed, style)
    } else if (isAreaSeries(style)) {
      applyToSeries(areaSeriesRef.current, transformed, style)
    }

    chartRef.current?.timeScale().fitContent()
  }, [tf, applyToSeries])

  useEffect(() => {
    if (!containerRef.current) return

    const chart = createChart(containerRef.current, {
      layout: { background: { color: '#0d0f14' }, textColor: '#e2e8f0', attributionLogo: false },
      grid: { vertLines: { color: '#1e2330' }, horzLines: { color: '#1e2330' } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#252a36' },
      timeScale: { borderColor: '#252a36', timeVisible: true, secondsVisible: false },
      width: containerRef.current.offsetWidth,
      height: containerRef.current.offsetHeight,
    })

    const candleSeries = chart.addCandlestickSeries(getSeriesOptions('candles'))
    const barSeries = chart.addBarSeries({ visible: false })
    const lineSeries = chart.addLineSeries(getSeriesOptions('line'))
    const areaSeries = chart.addAreaSeries(getSeriesOptions('area'))

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    barSeriesRef.current = barSeries
    lineSeriesRef.current = lineSeries
    areaSeriesRef.current = areaSeries

    chart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (range) setVisibleRange(range)
    })

    const handleContextMenu = (e) => {
      e.preventDefault()
      setCtxMenu({ show: true, x: e.clientX, y: e.clientY })
    }

    const handleClickOutside = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setCtxMenu(prev => ({ ...prev, show: false }))
      }
    }

    const el = containerRef.current
    el.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('click', handleClickOutside)

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      chart.applyOptions({ width, height })
    })
    observer.observe(el)

    return () => {
      observer.disconnect()
      chart.remove()
      el.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    const id = ++fetchIdRef.current
    candleBufferRef.current = {}
    setLoading(true)
    const symbol = activeSymbol

    ;(async () => {
      try {
        const res = await fetch(`/api/history/${encodeURIComponent(symbol)}`)
        const { candles } = await res.json()
        if (id !== fetchIdRef.current) return

        if (candles?.length) {
          refreshChart(candles, candleStyle)
        }
      } catch {} finally {
        if (id === fetchIdRef.current) setLoading(false)
      }
    })()
  }, [activeSymbol, candleStyle, tf, refreshChart])

  useEffect(() => {
    if (!tick || tick.symbol !== activeSymbol) return

    const tfSec = TF_SECONDS[tf] || 300
    const nowSec = tick.timestamp || Math.floor(Date.now() / 1000)
    const candleTime = Math.floor(nowSec / tfSec) * tfSec

    const buf = candleBufferRef.current
    if (!buf[tick.symbol] || buf[tick.symbol].time !== candleTime) {
      buf[tick.symbol] = {
        time: candleTime, open: tick.ltp, high: tick.ltp, low: tick.ltp, close: tick.ltp,
      }
    } else {
      const c = buf[tick.symbol]
      c.high = Math.max(c.high, tick.ltp)
      c.low = Math.min(c.low, tick.ltp)
      c.close = tick.ltp
    }

    const candle = buf[tick.symbol]
    const transformed = transformTick(candle, candleStyle)
    const updater = (series) => series && series.update(transformed)

    if (isCandleSeries(candleStyle)) updater(candleSeriesRef.current)
    else if (isBarSeries(candleStyle)) updater(barSeriesRef.current)
    else if (isLineSeries(candleStyle) || isColumnSeries(candleStyle)) updater(lineSeriesRef.current)
    else if (isAreaSeries(candleStyle)) updater(areaSeriesRef.current)
  }, [tick, activeSymbol, tf, candleStyle])

  useEffect(() => {
    localStorage.setItem('chartTimeScaleHeight', bottomPanelHeight.toString())
  }, [bottomPanelHeight])

  useEffect(() => {
    if (loadedDataRef.current.length) {
      refreshChart(loadedDataRef.current, candleStyle)
    }
  }, [candleStyle, refreshChart])

  const resetChart = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent()
    }
    setCtxMenu(prev => ({ ...prev, show: false }))
  }, [])

  const startResize = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = bottomPanelHeight

    const onMove = (ev) => {
      const delta = ev.clientY - startY
      const newHeight = Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, startHeight + delta))
      setBottomPanelHeight(newHeight)
    }

    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [bottomPanelHeight])

  const handleCandleStyle = useCallback((styleId) => {
    setCandleStyle(styleId)
  }, [])

  const timeframes = ['1m', '5m', '15m', '1h', '1d']

  const rangeText = visibleRange
    ? fmtRange(visibleRange.from, visibleRange.to)
    : null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border-b border-border shrink-0">
        {timeframes.map(t => (
          <button
            key={t}
            className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
              tf === t
                ? 'bg-accent border-accent text-white'
                : 'bg-transparent border-border text-muted hover:border-accent'
            }`}
            onClick={() => setTF(t)}
          >
            {t}
          </button>
        ))}
        <div className="w-px h-4 bg-border" />
        <CandleSelector value={candleStyle} onChange={handleCandleStyle} />
        <div className="ml-auto flex gap-1" />
      </div>
      <div ref={containerRef} className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0d0f14]/70 pointer-events-none">
            <div className="flex items-center gap-2.5">
              <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="#252a36" strokeWidth="3" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="#4f9cf9" strokeWidth="3" strokeLinecap="round" />
              </svg>
              <span className="text-[11px] text-muted font-mono">{activeSymbol}</span>
            </div>
          </div>
        )}
      </div>
      <div
        ref={dragHandleRef}
        className="h-2 cursor-row-resize bg-surface border-t border-border hover:bg-accent/10 shrink-0 relative group"
        onMouseDown={startResize}
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-0.5 rounded bg-muted/60 group-hover:bg-accent/60 transition-colors" />
      </div>
      <div
        className="bg-surface border-t border-border shrink-0 overflow-hidden flex items-center px-3 gap-3 select-none"
        style={{ height: `${bottomPanelHeight}px` }}
      >
        <span className="text-[11px] text-muted font-mono whitespace-nowrap">
          {activeSymbol}
        </span>
        <span className="text-[11px] text-muted/60 font-mono whitespace-nowrap">
          {tf}
        </span>
        {rangeText && (
          <span className="text-[11px] text-muted font-mono ml-auto whitespace-nowrap">
            {rangeText}
          </span>
        )}
      </div>
      {ctxMenu.show && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-surface border border-border rounded shadow-lg py-1 min-w-[130px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-sm text-muted hover:bg-accent hover:text-white transition-colors"
            onClick={resetChart}
          >
            Reset Chart
          </button>
        </div>
      )}
    </div>
  )
}
