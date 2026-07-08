import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createChart } from 'lightweight-charts'
import CandleSelector from './CandleSelector'
import TickerStrip from './TickerStrip'
import DrawingTools from './DrawingTools'
import {
  sma, ema, vwap, atr, supertrend, rsi, macd,
  stochastic, bollingerBands, obv, volumeMa,
} from '../utils/indicators'
import { transformHeikinAshi, transformRenko, transformLineBreak } from '../utils/candleTransformer'
import { run as runStrategy } from '../utils/strategyRunner'

// --- Constants ------------------------------
const TF_SECONDS = {
  '1m': 60, '3m': 180, '5m': 300, '10m': 600,
  '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200,
  '4h': 14400, '1d': 86400, '1w': 604800, '1month': 2592000,
}
const TIMEFRAMES = ['1m', '3m', '5m', '10m', '15m', '30m', '1h', '2h', '4h', '1d', '1w', '1month']
const MIN_PANEL_HEIGHT = 28
const MAX_PANEL_HEIGHT = 150

// --- Helper functions ----------------------
function getMarketOpenOffset(symbol, instrumentKey) {
  const sym = (symbol || '').toUpperCase()
  const key = (instrumentKey || '').toUpperCase()
  // Crypto (24/7) -> aligns to midnight 00:00
  if (key.includes('BINANCE') || sym === 'BTCUSD') {
    return 0
  }
  // MCX Commodities, NCDEX, and Currency (CDS) -> opens at 09:00 AM
  if (
    key.includes('MCX') ||
    key.includes('NCD') ||
    key.includes('CDS') ||
    key.includes('_CD') ||
    sym.includes('CRUDE')
  ) {
    return 9 * 3600 // 9:00 AM (32400 seconds)
  }
  // Standard Indian Equity/Index (NSE/BSE) -> opens at 09:15 AM
  return 9 * 3600 + 15 * 60 // 9:15 AM (33300 seconds)
}

function aggregateCandles(candles, tfSec, symbol = '', instrumentKey = '') {
  if (tfSec === 60) return candles
  const result = []
  let current = null
  const marketOpen = getMarketOpenOffset(symbol, instrumentKey)
  for (const c of candles) {
    let bucket
    if (tfSec < 86400) {
      const date = new Date(c.time * 1000)
      const midnight = Math.floor(date.setUTCHours(0, 0, 0, 0) / 1000)
      const elapsed = c.time - midnight
      const bucketElapsed = marketOpen + Math.floor((elapsed - marketOpen) / tfSec) * tfSec
      bucket = midnight + bucketElapsed
    } else {
      // Daily/Weekly/Monthly: align to midnight UTC
      const date = new Date(c.time * 1000)
      bucket = Math.floor(date.setUTCHours(0, 0, 0, 0) / 1000)
    }

    if (!current || current.time !== bucket) {
      if (current) result.push(current)
      current = {
        time: bucket, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume,
      }
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
    const item = {
      time: c.time, open: haOpen, high: haHigh, low: haLow, close: haClose,
      volume: c.volume, haOpen, haClose,
    }
    ha.push(item)
    prev = item
  }
  return ha
}

function transformData(candles, style, renkoBrickSize = 10) {
  if (style === 'heikin_ashi') {
    return transformHeikinAshi(candles)
  }
  if (style === 'renko') {
    return transformRenko(candles, renkoBrickSize)
  }
  if (style === 'line_break') {
    return transformLineBreak(candles, 3)
  }
  if (style === 'high_low') {
    return {
      highs: candles.map(c => ({ time: c.time, value: c.high })),
      lows: candles.map(c => ({ time: c.time, value: c.low })),
    }
  }
  if (['line', 'line_markers', 'step_line', 'area', 'baseline'].includes(style)) {
    return candles.map(c => ({ time: c.time, value: c.close }))
  }
  if (style === 'hlc_area') {
    return candles.map(c => ({ time: c.time, value: c.close }))
  }
  if (style === 'columns') {
    return candles.map(c => ({
      time: c.time, value: c.close,
      color: c.close >= c.open ? '#26a69a' : '#ef5350',
    }))
  }
  return candles
}

function transformTick(candle, style) {
  if (style === 'heikin_ashi') {
    const haClose = (candle.open + candle.high + candle.low + candle.close) / 4
    return { time: candle.time, value: haClose }
  }
  if (['line', 'line_markers', 'step_line', 'area', 'baseline'].includes(style)) {
    return { time: candle.time, value: candle.close }
  }
  if (style === 'hlc_area') {
    return { time: candle.time, value: candle.close }
  }
  if (style === 'columns') {
    return {
      time: candle.time, value: candle.close,
      color: candle.close >= candle.open ? '#26a69a' : '#ef5350',
    }
  }
  if (style === 'high_low') {
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
  switch (style) {
    case 'candles':
      return {
        upColor: '#26a69a', downColor: '#ef5350',
        borderUpColor: '#26a69a', borderDownColor: '#ef5350',
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      }
    case 'hollow_candles':
      return {
        upColor: '#26a69a', downColor: '#ef5350',
        borderUpColor: '#26a69a', borderDownColor: '#ef5350',
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
        hollowRealBody: true,
      }
    case 'volume_candles':
      return {
        upColor: '#26a69a', downColor: '#ef5350',
        borderUpColor: '#26a69a', borderDownColor: '#ef5350',
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      }
    case 'heikin_ashi':
      return {
        upColor: '#26a69a', downColor: '#ef5350',
        borderUpColor: '#26a69a', borderDownColor: '#ef5350',
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      }
    case 'bars':
      return { upColor: '#26a69a', downColor: '#ef5350' }
    case 'line':
    case 'line_markers':
      return { color: '#4f9cf9', lineWidth: 2 }
    case 'step_line':
      return { color: '#4f9cf9', lineWidth: 2, lineType: 2 }
    case 'area':
      return { topColor: '#4f9cf940', bottomColor: '#4f9cf905', lineColor: '#4f9cf9', lineWidth: 2 }
    case 'hlc_area':
      return { topColor: '#26a69a20', bottomColor: '#ef535005', lineColor: '#f5b342', lineWidth: 2 }
    case 'baseline':
      return { baseValue: { type: 'price', price: 0 }, topColor: '#26a69a40', bottomColor: '#ef535040', lineColor: '#4f9cf9', lineWidth: 2 }
    case 'columns':
      return { color: '#26a69a', base: 0 }
    case 'high_low':
      return { color: '#4f9cf9', lineWidth: 1 }
    default:
      return {}
  }
}

function isCandleSeries(style) { return ['candles', 'hollow_candles', 'volume_candles', 'heikin_ashi', 'renko', 'line_break'].includes(style) }
function isBarSeries(style) { return style === 'bars' }
function isLineSeries(style) { return ['line', 'line_markers', 'step_line'].includes(style) }
function isAreaSeries(style) { return ['area', 'hlc_area'].includes(style) }
function isColumnSeries(style) { return style === 'columns' }
function isBaselineSeries(style) { return style === 'baseline' }
function isHighLowSeries(style) { return style === 'high_low' }

// --- Indicator computation ----------------
function computeIndicatorData(indicator, candles) {
  const opt = indicator.options || {}
  switch (indicator.type) {
    case 'sma': return sma(candles, opt.period || 20)
    case 'ema': return ema(candles, opt.period || 20)
    case 'vwap': return vwap(candles)
    case 'atr': return atr(candles, opt.period || 14)
    case 'supertrend': return supertrend(candles, opt.factor || 3, opt.period || 10)
    case 'rsi': return rsi(candles, opt.period || 14)
    case 'stochastic': return stochastic(candles, opt.kPeriod || 14, opt.dPeriod || 3)
    case 'macd': return macd(candles, opt.fast || 12, opt.slow || 26, opt.signal || 9)
    case 'bollinger': return bollingerBands(candles, opt.period || 20, opt.stddev || 2)
    case 'obv': return obv(candles)
    case 'volume_ma': return volumeMa(candles, opt.period || 20)
    default: return []
  }
}

function getIndicatorColor(index) {
  const colors = ['#4f9cf9', '#f5b342', '#e06b6b', '#6bbf6b', '#b366ff', '#ff9933', '#33cccc', '#ff66b2']
  return colors[index % colors.length]
}

// --- Drawing hit testing --------------------
function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - x1, py - y1)
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}

function hitTestDrawing(mx, my, drawing, chart, series, cw, ch) {
  const pts = drawing.points.map(p => ({
    x: chart.timeScale().timeToCoordinate(p.time),
    y: series.priceToCoordinate(p.price),
  }))
  if (pts.some(p => p.x === null || p.y === null)) return false
  const r = 7
  switch (drawing.tool) {
    case 'trend_line':
      return distanceToSegment(mx, my, pts[0].x, pts[0].y, pts[1].x, pts[1].y) < r
    case 'horizontal_line':
      return Math.abs(my - pts[0].y) < r
    case 'horizontal_ray':
      return Math.abs(my - pts[0].y) < r && mx >= pts[0].x - r
    case 'vertical_line':
      return Math.abs(mx - pts[0].x) < r
    case 'rectangle': {
      const x = Math.min(pts[0].x, pts[1].x)
      const y = Math.min(pts[0].y, pts[1].y)
      const w = Math.abs(pts[1].x - pts[0].x)
      const h = Math.abs(pts[1].y - pts[0].y)
      return mx >= x - r && mx <= x + w + r && my >= y - r && my <= y + h + r
    }
    case 'fibonacci': {
      const topY = pts[0].y
      const bottomY = pts[1]?.y ?? (topY + 100)
      return mx >= 0 && mx <= cw && my >= Math.min(topY, bottomY) - r && my <= Math.max(topY, bottomY) + r
    }
    case 'text_label':
      return Math.hypot(mx - pts[0].x, my - pts[0].y) < r * 2
    default:
      return false
  }
}

function hitTestDrawings(mx, my, drawings, chart, series, cw, ch) {
  for (let i = drawings.length - 1; i >= 0; i--) {
    if (hitTestDrawing(mx, my, drawings[i], chart, series, cw, ch)) {
      return drawings[i].id
    }
  }
  return null
}

// --- Drawing SVG renderer ------------------
function renderDrawingElement(drawing, chart, series, cw, ch, selectedId, hoveredId) {
  if (!chart || !series) return null
  const points = drawing.points.map(p => {
    const x = chart.timeScale().timeToCoordinate(p.time)
    const y = series.priceToCoordinate(p.price)
    return { x, y }
  })
  if (points.some(p => p.x === null || p.y === null)) return null

  const isSelected = drawing.id === selectedId
  const isHovered = drawing.id === hoveredId
  const color = isSelected ? '#ffffff' : drawing.color || '#4f9cf9'
  const sw = isSelected ? 2.5 : isHovered ? 2 : 1.5
  const attrs = { 'data-drawing-id': drawing.id, style: { cursor: 'pointer' } }
  const hitAttrs = { ...attrs, pointerEvents: 'stroke' }

  const selCircle = (x, y) =>
    isSelected ? <circle cx={x} cy={y} r={5} fill="none" stroke="#fff" strokeWidth={1} opacity={0.6} /> : null

  switch (drawing.tool) {
    case 'trend_line': {
      if (points.length < 2) return null
      return (
        <g key={drawing.id}>
          <line {...hitAttrs} x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y} stroke={color} strokeWidth={sw} />
          {selCircle(points[0].x, points[0].y)}
          {selCircle(points[1].x, points[1].y)}
        </g>
      )
    }
    case 'horizontal_line': {
      if (!points[0]) return null
      return (
        <g key={drawing.id}>
          <line {...hitAttrs} x1={0} y1={points[0].y} x2={cw} y2={points[0].y} stroke={color} strokeWidth={sw} />
          {selCircle(0, points[0].y)}
          {selCircle(cw, points[0].y)}
        </g>
      )
    }
    case 'horizontal_ray': {
      if (!points[0]) return null
      const dir = drawing.direction || 1
      const x2 = dir > 0 ? cw : 0
      return (
        <g key={drawing.id}>
          <line {...hitAttrs} x1={points[0].x} y1={points[0].y} x2={x2} y2={points[0].y} stroke={color} strokeWidth={sw} />
          {selCircle(points[0].x, points[0].y)}
        </g>
      )
    }
    case 'vertical_line': {
      if (!points[0]) return null
      return (
        <g key={drawing.id}>
          <line {...hitAttrs} x1={points[0].x} y1={0} x2={points[0].x} y2={ch} stroke={color} strokeWidth={sw} />
          {selCircle(points[0].x, 0)}
          {selCircle(points[0].x, ch)}
        </g>
      )
    }
    case 'rectangle': {
      if (points.length < 2) return null
      const x = Math.min(points[0].x, points[1].x)
      const y = Math.min(points[0].y, points[1].y)
      const w = Math.abs(points[1].x - points[0].x)
      const h = Math.abs(points[1].y - points[0].y)
      return (
        <g key={drawing.id}>
          <rect {...hitAttrs} x={x} y={y} width={w} height={h} stroke={color} strokeWidth={sw} fill="none" />
          {selCircle(x, y)}
          {selCircle(x + w, y + h)}
        </g>
      )
    }
    case 'fibonacci': {
      if (!points[0]) return null
      const levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
      const topY = points[0].y
      const bottomY = points[1]?.y ?? (topY + 100)
      const range = bottomY - topY
      const fibColor = isSelected ? '#ffffff' : color
      return (
        <g key={drawing.id} {...attrs}>
          {levels.map((level, i) => (
            <line key={i} x1={0} y1={topY + range * level} x2={cw} y2={topY + range * level}
              stroke={fibColor} strokeWidth={sw * 0.4} opacity={0.6} strokeDasharray="4 2"
              pointerEvents="stroke" data-drawing-id={drawing.id} />
          ))}
          {selCircle(0, topY)}
          {selCircle(0, bottomY)}
        </g>
      )
    }
    case 'text_label': {
      if (!points[0]) return null
      return (
        <g key={drawing.id} {...attrs}>
          <text x={points[0].x} y={points[0].y} fill={color} fontSize="13" fontFamily="monospace" dominantBaseline="hanging"
            pointerEvents="visible" data-drawing-id={drawing.id}>{drawing.text || ''}</text>
          {selCircle(points[0].x, points[0].y)}
        </g>
      )
    }
    default:
      return null
  }
}

// --- ChartPanel component ------------------
export default function ChartPanel({
  activeSymbol,
  tick,
  instrumentKey,
  chartLayoutMode = 'single',
  chartIndex = 0,
  isFocused = true,
  onFocus = () => { },
  onSymbolChange = () => { },
  drawings = [],
  onDrawingsChange = () => { },
  activeDrawingTool = 'cursor',
  onDrawingToolChange = () => { },
  indicators = [],
  onIndicatorsChange = () => { },
  replayMode = false,
  replayIndex = 0,
  onReplayUpdate = () => { },
  onReplayEnd = () => { },
  mode = 'live',
  chartStyle = 'candles',
  onChartStyleChange = () => { },
  // Ticker Strip props (rendered locally next to timeframes)
  tickerItems = [],
  prices = {},
  openPrices = {},
  onTickerItemsChange = () => { },
  strategySignals = [],
  strategyPlots = [],
  strategyLines = [],
  strategyLabels = [],
  strategyDashboard = {},
  strategyName = '',
  onClearStrategy = () => { },
  tf = '5m',
  onTimeframeChange = () => { },
  onCandlesLoaded = () => { },
}) {
  // --- State ----------------------------------
  const setTF = onTimeframeChange
  const [loading, setLoading] = useState(false)
  const [visibleRange, setVisibleRange] = useState(null)
  const [showPlots, setShowPlots] = useState(true)
  const [showSignals, setShowSignals] = useState(true)
  const [showLabels, setShowLabels] = useState(true)
  const [showStats, setShowStats] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ctxMenu, setCtxMenu] = useState({ show: false, x: 0, y: 0 })
  const [bottomPanelHeight, setBottomPanelHeight] = useState(() => {
    const saved = localStorage.getItem('chartTimeScaleHeight')
    return saved ? Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, parseInt(saved, 10))) : 40
  })
  const [dataVersion, setDataVersion] = useState(0)
  const [drawingState, setDrawingState] = useState({ mode: 'idle', pendingPoint: null, selectedId: null, hoveredId: null })
  const drawingStateRef = useRef(drawingState)
  drawingStateRef.current = drawingState
  const [previewBump, setPreviewBump] = useState(0)
  const [countdown, setCountdown] = useState('0:00')
  const [isLive, setIsLive] = useState(false)
  const lastTickTimeRef = useRef(0)
  const [priceLabelY, setPriceLabelY] = useState(null)

  // Candle countdown timer — based on current candle's open time + duration
  useEffect(() => {
    const update = () => {
      const dur = TF_SECONDS[tfRef.current] || 60
      const nowSec = Math.floor(Date.now() / 1000)
      // Epoch-aligned candle start (works for all standard TF durations)
      const candleStart = Math.floor(nowSec / dur) * dur
      const candleEnd = candleStart + dur
      const remain = Math.max(0, candleEnd - nowSec)

      let formatted = ''
      if (remain >= 86400) {
        // Daily/weekly charts: remaining days & hours (e.g., "4d 18h")
        const days = Math.floor(remain / 86400)
        const hours = Math.floor((remain % 86400) / 3600)
        formatted = `${days}d ${hours}h`
      } else if (remain >= 3600) {
        // Hourly charts: remaining hours, minutes, seconds (e.g., "1:24:05")
        const hours = Math.floor(remain / 3600)
        const mins = Math.floor((remain % 3600) / 60)
        const secs = remain % 60
        formatted = `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      } else {
        // Intraday charts (<1h): minutes and seconds (e.g., "4:32")
        const mins = Math.floor(remain / 60)
        const secs = remain % 60
        formatted = `${mins}:${String(secs).padStart(2, '0')}`
      }

      setCountdown(formatted)
    }
    update()
    // Sync to wall-clock seconds so the countdown ticks exactly on the second
    const msToNextSec = 1000 - (Date.now() % 1000)
    let id
    const firstTick = setTimeout(() => {
      update()
      id = setInterval(update, 1000)
    }, msToNextSec)
    return () => { clearTimeout(firstTick); clearInterval(id) }
  }, [tf])

  // --- Refs -----------------------------------
  const containerRef = useRef(null)
  const mainChartContainerRef = useRef(null)
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const barSeriesRef = useRef(null)
  const lineSeriesRef = useRef(null)
  const areaSeriesRef = useRef(null)
  const baselineSeriesRef = useRef(null)
  const histogramSeriesRef = useRef(null)
  const highLineRef = useRef(null)
  const lowLineRef = useRef(null)
  const indicatorSeriesRefs = useRef(new Map())
  const candleBufferRef = useRef({})
  const contextMenuRef = useRef(null)
  const dragHandleRef = useRef(null)
  const fetchIdRef = useRef(0)
  const loadedDataRef = useRef([])
  const baseCandlesRef = useRef([])
  const priceScaleMarginsRef = useRef({ top: 0.12, bottom: 0.3 })
  const svgRef = useRef(null)
  const mousePosRef = useRef(null)
  const dragStartRef = useRef(null) // { drawingId, startPoints, mouseX, mouseY }
  const activeDrawingToolRef = useRef(activeDrawingTool)
  activeDrawingToolRef.current = activeDrawingTool
  const drawingsRef = useRef(drawings)
  drawingsRef.current = drawings
  const onDrawingsChangeRef = useRef(onDrawingsChange)
  onDrawingsChangeRef.current = onDrawingsChange

  // Stable refs so effects/callbacks always read latest value without recreating
  const tfRef = useRef(tf)
  tfRef.current = tf
  const chartStyleRef = useRef(chartStyle)
  chartStyleRef.current = chartStyle
  const modeRef = useRef(mode)
  modeRef.current = mode

  // --- Persist style --------------------------
  useEffect(() => { localStorage.setItem('chartStyle', chartStyle) }, [chartStyle])

  // --- Helper: apply data to series -----------
  const applyToSeries = useCallback((series, data, style) => {
    if (!series) return
    const opts = getSeriesOptions(style)
    if (opts && Object.keys(opts).length) {
      series.applyOptions(opts)
    }
    series.setData(data)

    // markers for line_markers
    if (style === 'line_markers' && Array.isArray(data)) {
      series.setMarkers(
        data.filter((_, i) => i % 10 === 0).map(d => ({
          time: d.time, position: 'aboveBar',
          color: '#4f9cf9', shape: 'circle', size: 0.5,
        }))
      )
    } else {
      series.setMarkers([])
    }
  }, [])


  // --- Helper: update active series -----------
  const updateActiveSeries = useCallback((data, style) => {
    const candleVis = isCandleSeries(style)
    const barVis = isBarSeries(style)
    const lineVis = isLineSeries(style)
    const areaVis = isAreaSeries(style)
    const baseVis = isBaselineSeries(style)
    const colVis = isColumnSeries(style)
    const hlVis = isHighLowSeries(style)

    // Clear data of all series that are NOT active to prevent scale distortion
    if (!candleVis) candleSeriesRef.current?.setData([])
    if (!barVis) barSeriesRef.current?.setData([])
    if (!lineVis) lineSeriesRef.current?.setData([])
    if (!areaVis) areaSeriesRef.current?.setData([])
    if (!baseVis) baselineSeriesRef.current?.setData([])
    if (!colVis) histogramSeriesRef.current?.setData([])
    if (!hlVis) {
      highLineRef.current?.setData([])
      lowLineRef.current?.setData([])
    }

    candleSeriesRef.current?.applyOptions({ visible: candleVis })
    barSeriesRef.current?.applyOptions({ visible: barVis })
    lineSeriesRef.current?.applyOptions({ visible: lineVis })
    areaSeriesRef.current?.applyOptions({ visible: areaVis })
    baselineSeriesRef.current?.applyOptions({ visible: baseVis })
    histogramSeriesRef.current?.applyOptions({ visible: colVis })
    highLineRef.current?.applyOptions({ visible: hlVis })
    lowLineRef.current?.applyOptions({ visible: hlVis })

    if (candleVis) { applyToSeries(candleSeriesRef.current, data, style) }
    else if (barVis) { barSeriesRef.current?.setData(data) }
    else if (lineVis) { applyToSeries(lineSeriesRef.current, data, style) }
    else if (areaVis) { applyToSeries(areaSeriesRef.current, data, style) }
    else if (baseVis) { applyToSeries(baselineSeriesRef.current, data, style) }
    else if (colVis) { histogramSeriesRef.current?.setData(data) }
    else if (hlVis) {
      const { highs, lows } = data
      if (highs) { highLineRef.current?.setData(highs) }
      if (lows) { lowLineRef.current?.setData(lows) }
    }
  }, [applyToSeries])

  // --- Helper: refresh chart with new data ---
  const refreshChart = useCallback((candles, style) => {
    const tfSec = TF_SECONDS[tfRef.current] || 60  // use ref — no dep on tf
    const aggregated = aggregateCandles(candles, tfSec, activeSymbol, instrumentKey)
    loadedDataRef.current = aggregated
    setDataVersion(v => v + 1)

    // Initialize candle buffer for real-time ticks using the last aggregated candle
    if (aggregated && aggregated.length > 0) {
      const lastCandle = aggregated[aggregated.length - 1]
      const bufKey = instrumentKey || activeSymbol
      candleBufferRef.current[bufKey] = { ...lastCandle }
    }

    const transformed = transformData(aggregated, style)
    updateActiveSeries(transformed, style)

    // Reset price scale auto-scale so new symbol fits perfectly!
    chartRef.current?.priceScale('right').applyOptions({ autoScale: true })
    chartRef.current?.timeScale().fitContent()
  }, [updateActiveSeries, activeSymbol, instrumentKey])  // stable — tf read via tfRef

  // --- Initialize charts --------------------
  useEffect(() => {
    if (!mainChartContainerRef.current) return

    // --- Main chart --------------------------
    const mainChart = createChart(mainChartContainerRef.current, {
      layout: { background: { color: '#0d0f14' }, textColor: '#e2e8f0', attributionLogo: false },
      grid: { vertLines: { color: '#1e2330' }, horzLines: { color: '#1e2330' } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#252a36', scaleMargins: { top: 0.12, bottom: 0.3 } },
      leftPriceScale: { visible: true, borderColor: '#252a36', scaleMargins: { top: 0.7, bottom: 0.05 } },
      timeScale: { borderColor: '#252a36', timeVisible: true, secondsVisible: false, visible: true },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
      },
      width: mainChartContainerRef.current.offsetWidth || 600,
      height: mainChartContainerRef.current.offsetHeight || 400,
    })

    // Create all series
    const candleSeries = mainChart.addCandlestickSeries(getSeriesOptions('candles'))
    const barSeries = mainChart.addBarSeries({ visible: false })
    const lineSeries = mainChart.addLineSeries(getSeriesOptions('line'))
    const areaSeries = mainChart.addAreaSeries(getSeriesOptions('area'))
    const baselineSeries = mainChart.addBaselineSeries({ ...getSeriesOptions('baseline'), visible: false })
    const histogramSeries = mainChart.addHistogramSeries({ visible: false })
    const highLine = mainChart.addLineSeries({ color: '#26a69a', lineWidth: 1, visible: false })
    const lowLine = mainChart.addLineSeries({ color: '#ef5350', lineWidth: 1, visible: false })

    chartRef.current = mainChart
    candleSeriesRef.current = candleSeries
    barSeriesRef.current = barSeries
    lineSeriesRef.current = lineSeries
    areaSeriesRef.current = areaSeries
    baselineSeriesRef.current = baselineSeries
    histogramSeriesRef.current = histogramSeries
    highLineRef.current = highLine
    lowLineRef.current = lowLine

    // --- Time scale range tracking ---------
    mainChart.timeScale().subscribeVisibleTimeRangeChange((range) => {
      if (range) {
        setVisibleRange(range)
      }
    })

    // --- Price scale vertical zoom (wheel over right axis) --
    const handleWheel = (e) => {
      e.preventDefault()
      const chart = chartRef.current
      if (!chart) return
      const container = mainChartContainerRef.current
      if (!container) return

      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const containerWidth = rect.width
      const priceScaleWidth = chart.priceScale('right').width() || 60
      const isOverPriceScale = mouseX > containerWidth - priceScaleWidth

      const direction = -Math.sign(e.deltaY)

      if (isOverPriceScale) {
        const zoomFactor = 0.04 * direction
        const margins = priceScaleMarginsRef.current

        const newTop = Math.max(0.01, Math.min(0.49, margins.top - zoomFactor))
        const newBottom = Math.max(0.01, Math.min(0.49, margins.bottom + zoomFactor))
        priceScaleMarginsRef.current = { top: newTop, bottom: newBottom }

        chart.applyOptions({
          rightPriceScale: {
            scaleMargins: { top: newTop, bottom: newBottom },
          },
        })
      } else {
        const timeScale = chart.timeScale()
        const logicalRange = timeScale.getVisibleLogicalRange()
        if (logicalRange) {
          const range = logicalRange.to - logicalRange.from
          const zoomFactor = 0.1 * direction
          const newRange = Math.max(2, range * (1 - zoomFactor))
          const center = (logicalRange.from + logicalRange.to) / 2
          timeScale.setVisibleLogicalRange({
            from: center - newRange / 2,
            to: center + newRange / 2,
          })
        }
      }
    }

    // --- Context menu ------------------------
    const handleContextMenu = (e) => {
      e.preventDefault()
      setCtxMenu({ show: true, x: e.clientX, y: e.clientY })
    }

    const handleClickOutside = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setCtxMenu(prev => ({ ...prev, show: false }))
      }
    }

    const mainEl = mainChartContainerRef.current
    mainEl.addEventListener('wheel', handleWheel, { passive: false })
    mainEl.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('click', handleClickOutside)

    // --- ResizeObserver ----------------------
    const resizeMain = () => {
      if (!mainChartContainerRef.current || !chartRef.current) return
      const w = mainChartContainerRef.current.offsetWidth
      const h = mainChartContainerRef.current.offsetHeight
      if (w > 0 && h > 0) {
        chartRef.current.applyOptions({ width: w, height: h })
      }
    }

    const ro = new ResizeObserver(() => { resizeMain() })

    if (mainChartContainerRef.current) ro.observe(mainChartContainerRef.current)

    const parentRo = new ResizeObserver(() => { resizeMain() })
    if (containerRef.current) parentRo.observe(containerRef.current)

    return () => {
      ro.disconnect()
      parentRo.disconnect()
      mainChart.remove()
      mainEl.removeEventListener('wheel', handleWheel)
      mainEl.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('click', handleClickOutside)
    }
  }, [])

  // --- Drawing interaction handlers ---------
  useEffect(() => {
    const container = containerRef.current
    const chart = chartRef.current
    if (!container || !chart) return

    let dragStartCoords = null;

    const ONE_CLICK_TOOLS = ['horizontal_line', 'horizontal_ray', 'vertical_line', 'text_label']
    const TWO_CLICK_TOOLS = ['trend_line', 'rectangle', 'fibonacci']
    const DRAWING_TOOLS = [...ONE_CLICK_TOOLS, ...TWO_CLICK_TOOLS]

    const getCoords = (clientX, clientY) => {
      const chartRect = mainChartContainerRef.current.getBoundingClientRect()
      const x = clientX - chartRect.left
      const y = clientY - chartRect.top
      const time = chart.timeScale().coordinateToTime(x)
      const series = activeSeriesRef.current
      const price = series?.coordinateToPrice(y)
      if (time == null || price == null) return null
      return { time: Math.floor(time), price, x, y }
    }

    const curDrawings = () => drawingsRef.current
    const curTool = () => activeDrawingToolRef.current
    const curOnChange = () => onDrawingsChangeRef.current

    const createNewDrawing = (pointA, pointB) => {
      const tool = curTool()
      if (tool === 'cursor') return
      let text = ''
      if (tool === 'text_label') {
        text = window.prompt('Enter label text:', 'Label') || 'Label'
      }
      const newDrawing = {
        id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        tool,
        points: pointB ? [pointA, pointB] : [pointA],
        color: '#4f9cf9',
        direction: 1,
        text,
      }
      curOnChange()([...curDrawings(), newDrawing])
    }

    const onMouseDown = (e) => {
      const tool = curTool()
      const coords = getCoords(e.clientX, e.clientY)
      if (!coords) return

      const state = drawingStateRef.current
      const cw = container.offsetWidth
      const ch = container.offsetHeight
      const series = activeSeriesRef.current
      const currentDrawings = curDrawings()

      // Check if clicking on an existing drawing
      const hitId = hitTestDrawings(coords.x, coords.y, currentDrawings, chart, series, cw, ch)

      // Cursor tool: select / drag drawings, or let chart handle normally
      if (tool === 'cursor') {
        if (hitId) {
          e.preventDefault()
          e.stopPropagation()
          setDrawingState(prev => ({ ...prev, selectedId: hitId, mode: 'idle', pendingPoint: null }))

          // Start drag on the drawing
          const drawing = currentDrawings.find(d => d.id === hitId)
          if (drawing) {
            dragStartRef.current = {
              drawingId: hitId,
              startPoints: JSON.parse(JSON.stringify(drawing.points)),
              mouseX: coords.x,
              mouseY: coords.y,
            }
            setDrawingState(prev => ({ ...prev, mode: 'dragging' }))
          }
          return
        } else {
          // Clicking empty space with cursor -> deselect
          setDrawingState(prev => ({ ...prev, selectedId: null }))
          dragStartCoords = { x: e.clientX, y: e.clientY }
          // Let the chart handle pan/zoom
          return
        }
      }

      e.preventDefault()
      e.stopPropagation()

      // Eraser mode: delete the clicked drawing
      if (tool === 'eraser') {
        if (hitId) {
          curOnChange()(currentDrawings.filter(d => d.id !== hitId))
        }
        return
      }

      // If clicking on a drawing and we have a drawing tool active, select it
      if (hitId && DRAWING_TOOLS.includes(tool)) {
        setDrawingState(prev => ({ ...prev, selectedId: hitId, mode: 'idle', pendingPoint: null }))
        return
      }

      // Start drag on selected drawing
      if (hitId === state.selectedId) {
        const drawing = currentDrawings.find(d => d.id === hitId)
        if (drawing) {
          dragStartRef.current = {
            drawingId: hitId,
            startPoints: JSON.parse(JSON.stringify(drawing.points)),
            mouseX: coords.x,
            mouseY: coords.y,
          }
          setDrawingState(prev => ({ ...prev, mode: 'dragging' }))
          return
        }
      }

      // Placing new drawing
      if (TWO_CLICK_TOOLS.includes(tool)) {
        if (!state.pendingPoint) {
          setDrawingState(prev => ({ ...prev, mode: 'placing', pendingPoint: coords }))
        } else {
          createNewDrawing(state.pendingPoint, coords)
          setDrawingState(prev => ({ ...prev, mode: 'idle', pendingPoint: null, selectedId: null }))
        }
      } else if (ONE_CLICK_TOOLS.includes(tool)) {
        createNewDrawing(coords)
        setDrawingState(prev => ({ ...prev, mode: 'idle', pendingPoint: null, selectedId: null }))
      }
    }

    const onMouseMove = (e) => {
      const tool = curTool()
      const chartRect = mainChartContainerRef.current.getBoundingClientRect()
      const mx = e.clientX - chartRect.left
      const my = e.clientY - chartRect.top
      mousePosRef.current = { x: mx, y: my }
      const currentDrawings = curDrawings()

      // If user drags the chart vertically, turn off price scale autoScale so it pans freely!
      if (dragStartCoords) {
        const dy = Math.abs(e.clientY - dragStartCoords.y)
        const dx = Math.abs(e.clientX - dragStartCoords.x)
        if (dy > 4 && dy > dx) {
          chart.priceScale('right').applyOptions({ autoScale: false })
          dragStartCoords = null
        }
      }

      // Update hovered drawing for cursor feedback
      const series = activeSeriesRef.current
      if (series && (tool === 'cursor' || DRAWING_TOOLS.includes(tool) || tool === 'eraser')) {
        const cw = container.offsetWidth
        const ch = container.offsetHeight
        const hitId = hitTestDrawings(mx, my, currentDrawings, chart, series, cw, ch)
        if (hitId !== drawingStateRef.current.hoveredId) {
          setDrawingState(prev => ({ ...prev, hoveredId: hitId }))
        }
      }

      // Drag handling
      const drag = dragStartRef.current
      if (drag) {
        const dx = mx - drag.mouseX
        const dy = my - drag.mouseY
        const chartPts = drag.startPoints.map(p => ({
          x: chart.timeScale().timeToCoordinate(p.time),
          y: series?.priceToCoordinate(p.price),
        }))
        const newPoints = drag.startPoints.map((p, i) => {
          const oldPx = chartPts[i]?.x ?? 0
          const oldPy = chartPts[i]?.y ?? 0
          const newX = oldPx + dx
          const newY = oldPy + dy
          const newTime = chart.timeScale().coordinateToTime(newX)
          const newPrice = series?.coordinateToPrice(newY)
          return {
            time: newTime != null ? Math.floor(newTime) : p.time,
            price: newPrice != null ? newPrice : p.price,
          }
        })
        const updated = currentDrawings.map(d =>
          d.id === drag.drawingId ? { ...d, points: newPoints } : d
        )
        curOnChange()(updated)
      }

      // Re-render for preview line (mousemove -> update mousePos)
      if (tool !== 'cursor' && drawingStateRef.current.mode === 'placing') {
        setPreviewBump(n => n + 1)
      }
    }

    const onMouseUp = () => {
      dragStartCoords = null
      if (dragStartRef.current) {
        dragStartRef.current = null
        setDrawingState(prev => ({ ...prev, mode: 'idle' }))
      }
    }

    const onWheel = (e) => {
      if (curTool() !== 'cursor') {
        e.preventDefault()
      }
    }

    container.addEventListener('mousedown', onMouseDown)
    container.addEventListener('mousemove', onMouseMove)
    container.addEventListener('mouseup', onMouseUp)
    container.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      container.removeEventListener('mousedown', onMouseDown)
      container.removeEventListener('mousemove', onMouseMove)
      container.removeEventListener('mouseup', onMouseUp)
      container.removeEventListener('wheel', onWheel)
    }
  }, [])

  // --- Reset drawing state on tool change ---
  useEffect(() => {
    setDrawingState({ mode: 'idle', pendingPoint: null, selectedId: null, hoveredId: null })
  }, [activeDrawingTool])

  // --- Clear candle buffer when mode changes (prevent DEMO/LIVE data mix) ---
  useEffect(() => {
    candleBufferRef.current = {}
  }, [mode])

  // --- Track live data status (LIVE badge) ---
  useEffect(() => {
    if (!tick) return
    const tickKey = tick.instrumentKey || tick.symbol
    const chartKey = instrumentKey || activeSymbol
    if (tickKey !== chartKey) return
    lastTickTimeRef.current = Date.now()
    setIsLive(true)
  }, [tick, activeSymbol, instrumentKey])

  useEffect(() => {
    const id = setInterval(() => {
      if (lastTickTimeRef.current && Date.now() - lastTickTimeRef.current > 5000) {
        setIsLive(false)
      }
    }, 2000)
    return () => clearInterval(id)
  }, [])

  // --- Track Y coordinate of live price for countdown label positioning ---
  useEffect(() => {
    if (!tick?.ltp) return
    try {
      const series = activeSeriesRef.current
      const y = series?.priceToCoordinate?.(tick.ltp)
      if (y != null && Number.isFinite(y)) setPriceLabelY(y)
    } catch { }
  }, [tick])

  // --- Fetch history (runs on symbol or timeframe change) ---
  useEffect(() => {
    if (!activeSymbol) { setLoading(false); return }
    const id = ++fetchIdRef.current
    // Clear stale state before new fetch
    candleBufferRef.current = {}
    baseCandlesRef.current = []
    loadedDataRef.current = []

    // Wipe series to prevent transient timeline update clashes
    candleSeriesRef.current?.setData([])
    barSeriesRef.current?.setData([])
    lineSeriesRef.current?.setData([])
    areaSeriesRef.current?.setData([])
    baselineSeriesRef.current?.setData([])
    histogramSeriesRef.current?.setData([])
    highLineRef.current?.setData([])
    lowLineRef.current?.setData([])

    setLoading(true)

      ; (async () => {
        try {
          const res = await fetch(`/api/history/${encodeURIComponent(activeSymbol)}?tf=${tf}&key=${encodeURIComponent(instrumentKey || '')}`)
          const { candles } = await res.json()
          if (id !== fetchIdRef.current) return

          if (candles?.length) {
            const offset = -new Date().getTimezoneOffset() * 60
            const localCandles = candles.map(c => ({
              ...c,
              time: c.time + offset
            }))
            baseCandlesRef.current = localCandles
            // Use chartStyleRef to avoid stale closure
            refreshChart(localCandles, chartStyleRef.current)
            onCandlesLoaded(localCandles)
          }
        } catch {
          // silently fail
        } finally {
          if (id === fetchIdRef.current) setLoading(false)
        }
      })()
  }, [activeSymbol, tf, refreshChart])  // refreshChart is stable (no tf/style dep)


  // --- Style change -> re-transform already-aggregated data (no fetch, no re-aggregate) ---
  useEffect(() => {
    if (!loadedDataRef.current.length) return
    const transformed = transformData(loadedDataRef.current, chartStyle)
    updateActiveSeries(transformed, chartStyle)
  }, [chartStyle, updateActiveSeries])

  // --- Real-time tick -----------------------
  useEffect(() => {
    if (!tick) return
    if (!loadedDataRef.current || loadedDataRef.current.length === 0) return

    // Match tick to this chart by instrumentKey first, fall back to symbol
    const tickKey = tick.instrumentKey || tick.symbol
    const chartKey = instrumentKey || activeSymbol
    if (tickKey !== chartKey) return

    if (replayMode) return // pause during replay

    // Guard: reject ticks from the wrong mode (prevents DEMO candles on LIVE chart)
    if (tick.mode && tick.mode.toLowerCase() !== modeRef.current.toLowerCase()) return

    const tfSec = TF_SECONDS[tf] || 300
    // Fix: Remove the timezone offset addition so that tick.timestamp (UTC epoch) aligns perfectly with aggregateCandles UTC boundaries
    const nowSec = Math.floor((tick.timestamp || Date.now()) / 1000)

    let candleTime
    if (tfSec < 86400) {
      const date = new Date(nowSec * 1000)
      const midnight = Math.floor(date.setUTCHours(0, 0, 0, 0) / 1000)
      const elapsed = nowSec - midnight
      const marketOpen = getMarketOpenOffset(activeSymbol, instrumentKey)
      const bucketElapsed = marketOpen + Math.floor((elapsed - marketOpen) / tfSec) * tfSec
      candleTime = midnight + bucketElapsed
    } else {
      const date = new Date(nowSec * 1000)
      candleTime = Math.floor(date.setUTCHours(0, 0, 0, 0) / 1000)
    }

    // Use instrumentKey as buffer key (unique across symbols)
    const bufKey = instrumentKey || activeSymbol
    const buf = candleBufferRef.current
    const lastCandle = loadedDataRef.current?.[loadedDataRef.current.length - 1]

    if (!buf[bufKey] || buf[bufKey].time !== candleTime) {
      if (lastCandle && lastCandle.time === candleTime) {
        buf[bufKey] = { ...lastCandle }
        const c = buf[bufKey]
        c.high = Math.max(c.high, tick.ltp)
        c.low = Math.min(c.low, tick.ltp)
        c.close = tick.ltp
      } else {
        buf[bufKey] = {
          time: candleTime, open: tick.ltp, high: tick.ltp, low: tick.ltp, close: tick.ltp,
        }
      }
    } else {
      const c = buf[bufKey]
      c.high = Math.max(c.high, tick.ltp)
      c.low = Math.min(c.low, tick.ltp)
      c.close = tick.ltp
    }

    const rawCandle = buf[bufKey]
    const style = chartStyle

    const lastCandleTime = lastCandle ? lastCandle.time : 0
    if (rawCandle.time < lastCandleTime) {
      return
    }

    // Transform raw candle if style is an alternate type like Heikin Ashi
    let candle = rawCandle
    if (style === 'heikin_ashi') {
      const isNewCandle = !lastCandle || rawCandle.time > lastCandle.time
      let prevHa = null
      if (loadedDataRef.current && loadedDataRef.current.length > 0) {
        const histHA = transformHeikinAshi(
          isNewCandle
            ? loadedDataRef.current
            : loadedDataRef.current.slice(0, -1)
        )
        prevHa = histHA[histHA.length - 1]
      }
      
      const haClose = (rawCandle.open + rawCandle.high + rawCandle.low + rawCandle.close) / 4
      const haOpen = prevHa
        ? (prevHa.open + prevHa.close) / 2
        : (rawCandle.open + rawCandle.close) / 2
      const haHigh = Math.max(rawCandle.high, haOpen, haClose)
      const haLow = Math.min(rawCandle.low, haOpen, haClose)
      
      candle = {
        time: rawCandle.time,
        open: haOpen,
        high: haHigh,
        low: haLow,
        close: haClose,
        volume: rawCandle.volume || 0
      }
    }

    if (isCandleSeries(style)) {
      candleSeriesRef.current?.update(candle)
    } else if (isBarSeries(style)) {
      barSeriesRef.current?.update(candle)
    } else if (isLineSeries(style)) {
      lineSeriesRef.current?.update({ time: candle.time, value: candle.close })
    } else if (isAreaSeries(style)) {
      areaSeriesRef.current?.update({ time: candle.time, value: candle.close })
    } else if (isBaselineSeries(style)) {
      baselineSeriesRef.current?.update({ time: candle.time, value: candle.close })
    } else if (isColumnSeries(style)) {
      histogramSeriesRef.current?.update({
        time: candle.time, value: candle.close,
        color: candle.close >= candle.open ? '#26a69a' : '#ef5350',
      })
    } else if (isHighLowSeries(style)) {
      highLineRef.current?.update({ time: candle.time, value: candle.high })
      lowLineRef.current?.update({ time: candle.time, value: candle.low })
    }
  }, [tick, activeSymbol, instrumentKey, tf, chartStyle, replayMode, mode])

  // --- Replay mode --------------------------
  useEffect(() => {
    if (!replayMode || !loadedDataRef.current.length) return
    const slice = loadedDataRef.current.slice(0, Math.max(1, replayIndex))
    const style = chartStyle
    const transformed = transformData(slice, style)
    updateActiveSeries(transformed, style)

    chartRef.current?.timeScale().fitContent()
  }, [replayMode, replayIndex, chartStyle, updateActiveSeries])

  // --- Indicators ---------------------------
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !loadedDataRef.current.length) return

    // Remove old indicator series
    const oldMap = indicatorSeriesRefs.current
    for (const [, refs] of oldMap) {
      const arr = Array.isArray(refs) ? refs : [refs]
      arr.forEach(s => {
        try { chart.removeSeries(s) } catch { /* ok */ }
      })
    }
    oldMap.clear()

    // Add new indicator series
    const candles = loadedDataRef.current
    indicators.forEach((ind, idx) => {
      if (ind.visible === false) return
      const data = computeIndicatorData(ind, candles)
      if (!data || data.length === 0) return

      const baseColor = ind.options?.color || getIndicatorColor(idx)

      switch (ind.type) {
        case 'sma':
        case 'ema':
        case 'vwap':
        case 'atr':
        case 'supertrend': {
          const series = chart.addLineSeries({
            color: baseColor,
            lineWidth: 1,
            priceScaleId: 'right',
            lastValueVisible: false,
            priceLineVisible: false,
          })
          series.setData(data.map(d => ({ time: d.time, value: d.value })))
          oldMap.set(ind.id, series)
          break
        }
        case 'bollinger': {
          const upper = chart.addLineSeries({ color: baseColor, lineWidth: 1, lastValueVisible: false, priceLineVisible: false })
          const middle = chart.addLineSeries({ color: '#f5b342', lineWidth: 1, lastValueVisible: false, priceLineVisible: false })
          const lower = chart.addLineSeries({ color: baseColor, lineWidth: 1, lastValueVisible: false, priceLineVisible: false })
          upper.setData(data.map(d => ({ time: d.time, value: d.upper })))
          middle.setData(data.map(d => ({ time: d.time, value: d.middle })))
          lower.setData(data.map(d => ({ time: d.time, value: d.lower })))
          oldMap.set(ind.id, [upper, middle, lower])
          break
        }
        case 'rsi':
        case 'stochastic': {
          const series = chart.addLineSeries({
            color: baseColor,
            lineWidth: 1,
            priceScaleId: 'right',
            lastValueVisible: false,
            priceLineVisible: false,
          })
          if (ind.type === 'rsi') {
            series.setData(data.map(d => ({ time: d.time, value: d.value })))
            oldMap.set(ind.id, series)
          } else {
            series.setData(data.map(d => ({ time: d.time, value: d.k })))
            const dSeries = chart.addLineSeries({
              color: '#f5b342', lineWidth: 1,
              priceScaleId: 'right',
              lastValueVisible: false, priceLineVisible: false,
            })
            dSeries.setData(data.map(d => ({ time: d.time, value: d.d })))
            oldMap.set(ind.id, [series, dSeries])
          }
          break
        }
        case 'macd': {
          const macdLine = chart.addLineSeries({
            color: '#4f9cf9', lineWidth: 1,
            priceScaleId: 'right',
            lastValueVisible: false, priceLineVisible: false,
          })
          const signalLine = chart.addLineSeries({
            color: '#f5b342', lineWidth: 1,
            priceScaleId: 'right',
            lastValueVisible: false, priceLineVisible: false,
          })
          const histSeries = chart.addHistogramSeries({
            priceFormat: { type: 'volume' },
            priceScaleId: 'right',
            lastValueVisible: false, priceLineVisible: false,
          })
          macdLine.setData(data.map(d => ({ time: d.time, value: d.macd })))
          signalLine.setData(data.map(d => ({ time: d.time, value: d.signal })))
          histSeries.setData(data.map(d => ({
            time: d.time, value: d.histogram,
            color: d.histogram >= 0 ? '#26a69a' : '#ef5350',
          })))
          oldMap.set(ind.id, [macdLine, signalLine, histSeries])
          break
        }
        case 'obv':
        case 'volume_ma': {
          const series = chart.addLineSeries({
            color: baseColor,
            lineWidth: 1,
            priceScaleId: 'right',
            lastValueVisible: false,
            priceLineVisible: false,
          })
          series.setData(data.map(d => ({ time: d.time, value: d.value })))
          oldMap.set(ind.id, series)
          break
        }
        default:
          break
      }
    })
  }, [indicators, dataVersion])

  // --- Strategy Plots & Signals Rendering --------------------
  const strategySeriesRefs = useRef([])
  const priceLinesRef = useRef([])

  const getActiveSeries = useCallback(() => {
    const style = chartStyleRef.current
    if (isCandleSeries(style)) return candleSeriesRef.current
    if (isBarSeries(style)) return barSeriesRef.current
    if (isLineSeries(style)) return lineSeriesRef.current
    if (isAreaSeries(style)) return areaSeriesRef.current
    if (isBaselineSeries(style)) return baselineSeriesRef.current
    if (isColumnSeries(style)) return histogramSeriesRef.current
    return null
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const activeSeries = getActiveSeries()

    // Remove old price lines from ALL series
    if (priceLinesRef.current) {
      priceLinesRef.current.forEach(item => {
        try {
          if (item && item.series && item.pl) {
            item.series.removePriceLine(item.pl);
          } else if (activeSeries) {
            activeSeries.removePriceLine(item);
          }
        } catch { /* ok */ }
      })
      priceLinesRef.current = []
    }

    // 1. Remove old strategy line plots
    strategySeriesRefs.current.forEach(s => {
      try { chart.removeSeries(s) } catch { /* ok */ }
    })
    strategySeriesRefs.current = []

    // 2. Add new strategy line plots
    if (showPlots && strategyPlots && strategyPlots.length > 0) {
      strategyPlots.forEach(p => {
        if (!p.data || p.data.length === 0) return

        let scaleId = 'right'
        if (loadedDataRef.current && loadedDataRef.current.length > 0) {
          let sumClose = 0
          let countClose = 0
          loadedDataRef.current.forEach(c => {
            if (c.close) { sumClose += c.close; countClose++ }
          })
          const avgClose = countClose > 0 ? sumClose / countClose : 100

          let sumVal = 0
          let countVal = 0
          p.data.forEach(d => {
            if (d.value != null) { sumVal += d.value; countVal++ }
          })
          const avgPlot = countVal > 0 ? sumVal / countVal : 0

          // If main price is high and indicator has low values (e.g. < 150), put on left scale
          if (avgClose > 500 && avgPlot < 150) {
            scaleId = 'left'
          }
        }

        const series = chart.addLineSeries({
          color: p.color || '#4f9cf9',
          lineWidth: p.width || 2,
          priceScaleId: scaleId,
          title: p.name || '',
          priceLineVisible: false,
        })
        series.setData(p.data)
        strategySeriesRefs.current.push(series)
      })
    }

    // 3. Render strategy signals on the active series
    if (activeSeries) {
      if (showSignals && strategySignals && strategySignals.length > 0) {
        const markers = strategySignals.map(sig => {
          const type = sig.type?.toUpperCase()
          const opts = sig.options || {}
          const labelStyle = opts.style || 'arrow'
          const labelIcon = opts.icon || 'check'

          if (type === 'BUY') {
            return {
              time: sig.time,
              position: opts.position === 'above' ? 'aboveBar' : 'belowBar',
              color: opts.bgColor || '#00c853',
              shape: labelStyle === 'label-box' ? 'square' : 'arrowUp',
              text: labelStyle === 'label-box' ? `${labelIcon === 'check' ? '✓ ' : labelIcon === 'circle' ? '● ' : ''}${sig.label || 'BUY'}` : (sig.label || 'BUY'),
              size: 1,
            }
          }
          if (type === 'SELL') {
            return {
              time: sig.time,
              position: opts.position === 'below' ? 'belowBar' : 'aboveBar',
              color: opts.bgColor || '#ef5350',
              shape: labelStyle === 'label-box' ? 'square' : 'arrowDown',
              text: labelStyle === 'label-box' ? `${labelIcon === 'circle' ? '● ' : labelIcon === 'check' ? '✓ ' : ''}${sig.label || 'SELL'}` : (sig.label || 'SELL'),
              size: 1,
            }
          }
          if (type === 'CLOSE') {
            return {
              time: sig.time,
              position: opts.position === 'below' ? 'belowBar' : 'aboveBar',
              color: opts.bgColor || '#94a3b8',
              shape: labelStyle === 'label-box' ? 'square' : 'circle',
              text: sig.label || 'CLOSE',
              size: 0.5,
            }
          }
          return null
        }).filter(Boolean)
        activeSeries.setMarkers(markers)
      } else {
        // Only clear markers if they were set by strategy (or generally clear them if no strategy active)
        activeSeries.setMarkers([])
      }

      // 4. Render horizontal price lines on the axis
      if (showPlots && strategyLines && strategyLines.length > 0) {
        strategyLines.forEach(l => {
          if (l.price !== undefined) {
            const pl = activeSeries.createPriceLine({
              price: l.price,
              color: l.color || '#4f9cf9',
              lineWidth: 1,
              lineStyle: l.style === 'solid' ? 0 : l.style === 'dashed' ? 1 : 2, // 0 = Solid, 1 = Dashed, 2 = Dotted
              axisLabelVisible: true,
              title: l.label || '',
            })
            priceLinesRef.current.push({ series: activeSeries, pl })
          }
        })
      }
    }
  }, [strategySignals, strategyPlots, strategyLines, dataVersion, chartStyle, getActiveSeries, showPlots, showSignals])

  // --- Keyboard handlers for drawings --------
  useEffect(() => {
    const handler = (e) => {
      const state = drawingStateRef.current
      const tool = activeDrawingToolRef.current
      const curDrawings = drawingsRef.current
      if (e.key === 'Escape') {
        if (state.mode === 'placing' && state.pendingPoint) {
          setDrawingState({ mode: 'idle', pendingPoint: null, selectedId: null, hoveredId: null })
        } else if (state.selectedId) {
          setDrawingState(prev => ({ ...prev, selectedId: null }))
        } else if (tool !== 'cursor') {
          onDrawingToolChange('cursor')
        }
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedId && !e.target.closest('input,textarea,select')) {
        e.preventDefault()
        onDrawingsChange(curDrawings.filter(d => d.id !== state.selectedId))
        setDrawingState(prev => ({ ...prev, selectedId: null }))
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onDrawingToolChange, onDrawingsChange])

  // --- Persist bottom panel height -----------
  useEffect(() => {
    localStorage.setItem('chartTimeScaleHeight', bottomPanelHeight.toString())
  }, [bottomPanelHeight])

  // --- Handlers ------------------------------
  const resetChart = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.priceScale('right').applyOptions({ autoScale: true })
      chartRef.current.timeScale().fitContent()
      chartRef.current.applyOptions({
        rightPriceScale: { scaleMargins: { top: 0.12, bottom: 0.3 } },
      })
      priceScaleMarginsRef.current = { top: 0.12, bottom: 0.3 }
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
    onChartStyleChange(styleId)
  }, [onChartStyleChange])

  const handleTFChange = useCallback((t) => {
    setTF(t)
  }, [])

  // --- Computed values -----------------------
  const rangeText = visibleRange
    ? fmtRange(visibleRange.from, visibleRange.to)
    : null

  const replayMaxIndex = loadedDataRef.current.length

  const activeSeriesRef = useMemo(() => {
    if (isCandleSeries(chartStyle)) return candleSeriesRef
    if (isBarSeries(chartStyle)) return barSeriesRef
    if (isLineSeries(chartStyle)) return lineSeriesRef
    if (isAreaSeries(chartStyle)) return areaSeriesRef
    if (isBaselineSeries(chartStyle)) return baselineSeriesRef
    if (isColumnSeries(chartStyle)) return histogramSeriesRef
    if (isHighLowSeries(chartStyle)) return highLineRef
    return candleSeriesRef
  }, [chartStyle])

  const focusedClass = isFocused && chartLayoutMode !== 'single'
    ? 'ring-1 ring-accent/40'
    : ''

  // --- Render drawing SVG elements -----------
  const drawingSvgElements = useMemo(() => {
    if (!chartRef.current) return null
    const chart = chartRef.current
    const series = activeSeriesRef.current
    const container = mainChartContainerRef.current
    const cw = container?.offsetWidth || 800
    const ch = container?.offsetHeight || 400
    const selId = drawingState.selectedId
    const hovId = drawingState.hoveredId
    return drawings.map(d => renderDrawingElement(d, chart, series, cw, ch, selId, hovId))
  }, [drawings, visibleRange, chartStyle, drawingState.selectedId, drawingState.hoveredId])

  // --- Render strategy custom SVG drawings (lines & labels) ---
  const strategySvgElements = useMemo(() => {
    if (!chartRef.current || !activeSeriesRef.current) return null
    const chart = chartRef.current
    const series = activeSeriesRef.current
    const container = mainChartContainerRef.current
    const cw = container?.offsetWidth || 800

    const elements = []

    if (showLabels && strategyLines && strategyLines.length > 0) {
      strategyLines.forEach(l => {
        if (l.x1 === undefined || l.x2 === undefined) return // Skip horizontal priceLines
        const x1 = chart.timeScale().timeToCoordinate(l.x1)
        const y1 = series.priceToCoordinate(l.y1)
        const x2 = chart.timeScale().timeToCoordinate(l.x2)
        const y2 = series.priceToCoordinate(l.y2)

        if (x1 == null || y1 == null || x2 == null || y2 == null) return

        const finalX2 = l.extendRight ? cw : x2
        const isDashed = l.style === 'dashed'

        elements.push(
          <line
            key={`s-line-${l.id}`}
            x1={x1}
            y1={y1}
            x2={finalX2}
            y2={y2}
            stroke={l.color || '#4f9cf9'}
            strokeWidth={l.width || 1.5}
            strokeDasharray={isDashed ? '4 3' : undefined}
            pointerEvents="none"
          />
        )
      })
    }

    if (showLabels && strategyLabels && strategyLabels.length > 0) {
      const ch = container?.offsetHeight || 400
      strategyLabels.forEach(lbl => {
        const x = chart.timeScale().timeToCoordinate(lbl.x)
        const y = series.priceToCoordinate(lbl.y)

        if (x == null || y == null) return

        const padding = 4
        let offsetX = x
        let offsetY = y

        if (lbl.position === 'left') offsetX -= padding
        else if (lbl.position === 'right') offsetX += padding
        else if (lbl.position === 'above') offsetY -= padding
        else if (lbl.position === 'below') offsetY += padding

        // Clamp y-coordinate to stay within the visible container bounds
        offsetY = Math.max(35, Math.min(offsetY, ch - 20))

        // Premium Badge Logic: Estimate width/height, draw filled capsule rect and centered text
        const txt = lbl.text || ''
        const textLen = txt.length
        const rectWidth = textLen * 6.2 + 12
        const rectHeight = 17

        let rectX = offsetX - rectWidth / 2
        let rectY = offsetY - rectHeight / 2

        if (lbl.position === 'above') {
          rectY = offsetY - rectHeight - 2
        } else if (lbl.position === 'below') {
          rectY = offsetY + 2
        } else if (lbl.position === 'left') {
          rectX = offsetX - rectWidth - 2
        } else if (lbl.position === 'right') {
          rectX = offsetX + 2
        }

        const txtUpper = txt.toUpperCase()
        const isBuy = txtUpper.includes('BUY') || txtUpper.includes('TP') || txtUpper.includes('ENTRY')
        const isSell = txtUpper.includes('SELL') || txtUpper.includes('SL') || txtUpper.includes('EXIT')

        const bgColor = isBuy ? '#2e7d32' : isSell ? '#c62828' : '#1e293b'
        const strokeColor = isBuy ? '#81c784' : isSell ? '#e57373' : '#475569'

        elements.push(
          <g key={`s-lbl-${lbl.id}`} pointerEvents="none">
            {/* Capsule Rect */}
            <rect
              x={rectX}
              y={rectY}
              width={rectWidth}
              height={rectHeight}
              rx="4"
              fill={bgColor}
              opacity="0.95"
              stroke={strokeColor}
              strokeWidth="1"
            />
            {/* Center aligned bold text */}
            <text
              x={rectX + rectWidth / 2}
              y={rectY + rectHeight / 2 + 1}
              fill="#ffffff"
              fontSize="9.5"
              fontWeight="700"
              fontFamily="system-ui, -apple-system, sans-serif"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {txt}
            </text>
          </g>
        )
      })
    }

    return elements
  }, [strategyLines, strategyLabels, visibleRange, chartStyle, showLabels])

  // --- Preview for two-click drawings ---
  const previewElements = useMemo(() => {
    if (!chartRef.current || drawingState.mode !== 'placing' || !drawingState.pendingPoint || !mousePosRef.current) return null
    const chart = chartRef.current
    const series = activeSeriesRef.current
    if (!series) return null
    const pp = drawingState.pendingPoint
    const p1x = chart.timeScale().timeToCoordinate(pp.time)
    const p1y = series.priceToCoordinate(pp.price)
    const p2x = mousePosRef.current.x
    const p2y = mousePosRef.current.y
    if (p1x == null || p1y == null) return null
    if (activeDrawingTool === 'rectangle') {
      const x = Math.min(p1x, p2x)
      const y = Math.min(p1y, p2y)
      const w = Math.abs(p2x - p1x)
      const h = Math.abs(p2y - p1y)
      return (
        <rect
          x={x} y={y} width={w} height={h}
          stroke="#4f9cf9" strokeWidth={1} strokeDasharray="4 3" fill="none" opacity={0.6}
        />
      )
    }
    return (
      <line
        x1={p1x} y1={p1y} x2={p2x} y2={p2y}
        stroke="#4f9cf9" strokeWidth={1} strokeDasharray="4 3" opacity={0.6}
      />
    )
  }, [drawingState.mode, drawingState.pendingPoint, visibleRange, previewBump, activeDrawingTool])

  // --- JSX -----------------------------------
  return (
    <div
      className={`flex-1 flex flex-col overflow-hidden ${focusedClass}`}
      onClick={onFocus}
    >
      {/* -- Toolbar (Timeframe, TickerStrip) --------------------------- */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border-b border-border shrink-0 overflow-x-auto select-none">
        {TIMEFRAMES.map(t => (
          <button
            key={t}
            className={`px-2 py-0.5 rounded text-[11px] border transition-colors whitespace-nowrap ${tf === t
                ? 'bg-accent border-accent text-white font-bold'
                : 'bg-transparent border-border text-muted hover:border-accent'
              }`}
            onClick={() => handleTFChange(t)}
          >
            {t}
          </button>
        ))}

        {prices && Object.keys(prices).length > 0 && tickerItems && tickerItems.length > 0 && (
          <>
            <div className="w-px h-4 bg-border shrink-0 mx-1" />
            <TickerStrip
              instruments={tickerItems}
              prices={prices}
              openPrices={openPrices}
              activeSymbol={activeSymbol}
              onSelect={(sym, key) => onSymbolChange(sym, key)}
              onItemsChange={onTickerItemsChange}
            />
          </>
        )}

        <div className="ml-auto flex gap-1" />
      </div>

      {/* -- Replay bar ------------------------ */}
      {replayMode && (
        <div className="flex items-center gap-2 px-3 py-1 bg-accent/10 border-b border-accent/30 shrink-0">
          <span className="text-[11px] text-accent font-mono font-semibold tracking-wider">REPLAY</span>
          <input
            type="range"
            min={0}
            max={Math.max(1, replayMaxIndex - 1)}
            value={replayIndex}
            onChange={e => onReplayUpdate(parseInt(e.target.value, 10))}
            className="flex-1 h-1.5 accent-accent cursor-pointer"
            style={{ accentColor: '#4f9cf9' }}
          />
          <span className="text-[11px] text-muted font-mono min-w-[60px] text-right">
            {replayIndex}/{replayMaxIndex}
          </span>
          <button
            onClick={onReplayEnd}
            className="text-[11px] px-2 py-0.5 rounded bg-accent text-white hover:bg-accent/80 transition-colors"
          >
            Exit
          </button>
        </div>
      )}

      {/* -- Indicator chips ------------------- */}
      {indicators.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1 bg-surface border-b border-border shrink-0 overflow-x-auto">
          {indicators.map(ind => (
            <span
              key={ind.id}
              className="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/30 flex items-center gap-1 whitespace-nowrap"
            >
              {ind.type.toUpperCase()}
              {ind.options?.period && <span className="text-muted">({ind.options.period})</span>}
              <button
                className="ml-0.5 hover:text-white text-muted leading-none"
                onClick={() => onIndicatorsChange(indicators.filter(i => i.id !== ind.id))}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}

      {/* -- Chart area ------------------------ */}
      <div
        ref={containerRef}
        className={`flex-1 relative min-h-0 ${drawingState.hoveredId ? 'cursor-pointer' : ''}`}
      >
        {!activeSymbol && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0d0f14]">
            <div className="text-center">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted/30 mx-auto mb-3">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <div className="text-sm text-muted">Search for a symbol to start</div>
              <div className="text-[10px] text-muted/50 mt-1">Ctrl+K to open search</div>
            </div>
          </div>
        )}
        <DrawingTools
          activeTool={activeDrawingTool}
          onToolSelect={onDrawingToolChange}
          drawings={drawings}
          onClearDrawings={() => onDrawingsChange([])}
        />

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

        {/* Symbol info strip */}
        {activeSymbol && (
          <div className="absolute top-2 left-14 z-20 pointer-events-auto">
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-[#131722]/90 border border-[#2a2e39] shadow-lg">
              <span className="text-sm font-bold text-white tracking-wide">{activeSymbol}</span>
              {tick && (() => {
                const resolvedSymbol = activeSymbol.toUpperCase().replace(/[\s_-]/g, '')
                const openPrice = openPrices[instrumentKey] || openPrices[resolvedSymbol] || openPrices[activeSymbol] || tick.close || tick.open || tick.ltp
                const chg = tick.ltp - openPrice
                const pct = openPrice && openPrice !== 0 ? (chg / openPrice) * 100 : 0
                const color = chg >= 0 ? 'text-green' : 'text-red'
                return (
                  <>
                    <div className="w-px h-4 bg-[#2a2e39]" />
                    <span className="text-sm font-bold text-white font-mono tabular-nums">{tick.ltp?.toFixed(2)}</span>
                    <div className="w-px h-4 bg-[#2a2e39]" />
                    {openPrice && Number.isFinite(openPrice) ? (
                      <span className={`text-[11px] font-semibold font-mono tabular-nums ${color}`}>
                        {chg >= 0 ? '+' : ''}{chg.toFixed(2)}
                        {' '}
                        <span className="opacity-80">({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)</span>
                      </span>
                    ) : (
                      <span className="text-[11px] font-semibold font-mono tabular-nums text-muted/60">
                        0.00 (0.00%)
                      </span>
                    )}
                  </>
                )
              })()}
              {/* Candle countdown timer — only visible when live */}
              {isLive && (
                <>
                  <div className="w-px h-4 bg-[#2a2e39]" />
                  <div className="flex items-center gap-1">
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green/70 shrink-0">
                      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span className={`text-[11px] font-mono font-bold tabular-nums ${countdown.startsWith('0:0') ? 'text-yellow' : 'text-green'
                      }`}>{countdown}</span>
                  </div>
                </>
              )}
              {/* LIVE / HIST — embedded in strip */}
              <div className="w-px h-4 bg-[#2a2e39]" />
              <div className={`flex items-center gap-1 text-[10px] font-bold tracking-widest ${isLive ? 'text-green' : 'text-[#4a5068]'
                }`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isLive ? 'bg-green animate-pulse' : 'bg-[#3a3f52]'
                  }`} />
                {isLive ? 'LIVE' : 'HIST'}
              </div>
            </div>
          </div>
        )}

        {/* Strategy strip - Rendered below symbol strip */}
        {activeSymbol && strategyName && (() => {
          const hasPlots = strategyPlots && strategyPlots.length > 0
          const hasSignals = strategySignals && strategySignals.length > 0
          const hasLabels = (strategyLabels && strategyLabels.length > 0) || (strategyLines && strategyLines.length > 0)
          const hasStats = strategyDashboard && Object.keys(strategyDashboard).length > 0

          return (
            <div className="absolute top-[38px] left-14 z-20 pointer-events-auto">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#131722]/90 border border-[#2a2e39] shadow-lg text-[10.5px] font-semibold text-white">
                <span className="tracking-wide text-gray-300 font-mono">{strategyName}</span>
                
                <div className="w-px h-3 bg-[#2a2e39]" />
                
                {/* Eye Visibility Toggle */}
                <button
                  onClick={() => {
                    const target = !showPlots;
                    setShowPlots(target);
                    setShowSignals(target);
                    setShowLabels(target);
                    setShowStats(target);
                  }}
                  className="p-0.5 rounded text-muted hover:text-white transition-colors cursor-pointer"
                  title={showPlots ? "Hide strategy" : "Show strategy"}
                >
                  {showPlots ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  )}
                </button>
                
                {/* Gear Settings Toggle */}
                <button
                  onClick={() => setSettingsOpen(prev => !prev)}
                  className={`p-0.5 rounded text-muted hover:text-[#4f9cf9] transition-colors cursor-pointer ${settingsOpen ? 'text-[#4f9cf9]' : ''}`}
                  title="Settings"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                </button>
                
                {/* Trash/Remove Button */}
                <button
                  onClick={onClearStrategy}
                  className="p-0.5 rounded text-muted hover:text-[#ef5350] transition-colors cursor-pointer"
                  title="Remove strategy"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                </button>
              </div>

              {/* Settings Dialog Overlay - TV style popup */}
              {settingsOpen && (
                <div className="absolute top-full left-0 mt-1.5 z-50 bg-[#1c2030]/95 border border-[#2a2e39] rounded shadow-2xl p-3 min-w-[200px] font-sans text-[11px] flex flex-col gap-3 select-none text-[#b4c3db]">
                  <div className="flex justify-between items-center border-b border-[#2a2e39] pb-1.5">
                    <span className="font-bold text-white uppercase text-[9px] tracking-wider">{strategyName} Settings</span>
                    <button onClick={() => setSettingsOpen(false)} className="text-muted hover:text-white">✕</button>
                  </div>

                  <div className="flex flex-col gap-2">
                    {hasPlots && (
                      <label className="flex items-center justify-between hover:text-white cursor-pointer py-0.5">
                        <span>Plots / Indicators</span>
                        <input
                          type="checkbox"
                          checked={showPlots}
                          onChange={(e) => setShowPlots(e.target.checked)}
                          className="accent-[#4f9cf9] w-3.5 h-3.5 cursor-pointer"
                        />
                      </label>
                    )}

                    {hasSignals && (
                      <label className="flex items-center justify-between hover:text-white cursor-pointer py-0.5">
                        <span>Signals (Buy/Sell)</span>
                        <input
                          type="checkbox"
                          checked={showSignals}
                          onChange={(e) => setShowSignals(e.target.checked)}
                          className="accent-[#4f9cf9] w-3.5 h-3.5 cursor-pointer"
                        />
                      </label>
                    )}

                    {hasLabels && (
                      <label className="flex items-center justify-between hover:text-white cursor-pointer py-0.5">
                        <span>SL/TP Labels</span>
                        <input
                          type="checkbox"
                          checked={showLabels}
                          onChange={(e) => setShowLabels(e.target.checked)}
                          className="accent-[#4f9cf9] w-3.5 h-3.5 cursor-pointer"
                        />
                      </label>
                    )}

                    {hasStats && (
                      <label className="flex items-center justify-between hover:text-white cursor-pointer py-0.5">
                        <span>Stats Dashboard</span>
                        <input
                          type="checkbox"
                          checked={showStats}
                          onChange={(e) => setShowStats(e.target.checked)}
                          className="accent-[#4f9cf9] w-3.5 h-3.5 cursor-pointer"
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })()}


        {/* Drawing mode hint */}
        {activeDrawingTool !== 'cursor' && (
          <div className="absolute top-7 left-12 z-20 pointer-events-none">
            <span className="text-[10px] px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/40 font-mono">
              {drawingState.mode === 'placing'
                ? `Place second point (Esc to cancel)`
                : `Draw: ${activeDrawingTool.replace(/_/g, ' ')} (Esc to exit)`}
            </span>
          </div>
        )}

        {/* ── TradingView-style candle countdown label (right price axis) ── */}
        {activeSymbol && isLive && (
          <div
            className="absolute z-20 pointer-events-none select-none"
            style={{
              left: '40px',
              right: 0,
              // Track Y of live price; fallback to 40% from top when historical
              top: priceLabelY != null
                ? Math.max(4, Math.min(priceLabelY + 22, 10000))
                : undefined,
              bottom: priceLabelY == null ? '40%' : undefined,
            }}
          >
            <div className="flex justify-end items-center pr-[2px]">
              <div className={`inline-flex items-center justify-center px-2 py-[3px] rounded text-[11px] font-mono font-bold text-white min-w-[46px] shadow ${countdown.startsWith('0:0') ? 'bg-[#c9820a]' : 'bg-[#4f9cf9]'
                }`}>
                {countdown}
              </div>
            </div>
          </div>
        )}

        <svg
          ref={svgRef}
          className={`absolute left-10 top-0 right-0 bottom-0 z-40 transition-none overflow-hidden ${activeDrawingTool !== 'cursor' ? 'pointer-events-auto' : 'pointer-events-none'
            } ${activeDrawingTool !== 'cursor' ? 'cursor-crosshair' : ''}`}
          style={{ width: 'calc(100% - 40px)', height: '100%', overflow: 'hidden' }}
        >
          {drawingSvgElements}
          {strategySvgElements}
          {previewElements}
        </svg>

        {/* Strategy Dashboard Stats Overlay */}
        {showStats && strategyDashboard && Object.keys(strategyDashboard).length > 0 && (
          <div className="absolute top-14 right-14 z-20 bg-[#131722]/90 border border-[#2a2e39] rounded-md p-2.5 shadow-lg min-w-[180px] max-w-[340px] max-h-[70vh] overflow-y-auto font-mono text-[10px] space-y-2 z-30 pointer-events-auto select-none">
            <div className="text-[9px] text-muted uppercase tracking-wider border-b border-[#2a2e39] pb-1 font-bold">
              Strategy Stats
            </div>
            {Object.entries(strategyDashboard).map(([lbl, row]) => {
              if (row && row.type === 'table') {
                return (
                  <div key={lbl} className="border-t border-[#2a2e39] pt-2 mt-2">
                    <div className="text-[9px] text-[#7c6af7] font-extrabold uppercase tracking-wide mb-1">{lbl}</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse border border-[#2a2e39]/60 text-[9px] text-slate-300">
                        {row.headers && row.headers.length > 0 && (
                          <thead>
                            <tr className="bg-[#1f222e]">
                              {row.headers.map((h, i) => (
                                <th key={i} className="px-1.5 py-0.5 border border-[#2a2e39] text-[#94a3b8] font-bold">{h}</th>
                              ))}
                            </tr>
                          </thead>
                        )}
                        <tbody>
                          {row.rows && row.rows.map((r, ri) => (
                            <tr key={ri} className={ri % 2 === 0 ? 'bg-[#0f111a]' : 'bg-[#151722]'}>
                              {Array.isArray(r) ? r.map((c, ci) => (
                                <td key={ci} className="px-1.5 py-0.5 border border-[#2a2e39]">{String(c)}</td>
                              )) : Object.values(r).map((c, ci) => (
                                <td key={ci} className="px-1.5 py-0.5 border border-[#2a2e39]">{String(c)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              }
              return (
                <div key={lbl} className="flex justify-between items-center gap-4 py-0.5">
                  <span className="text-[#94a3b8]">{lbl}</span>
                  <span style={{ color: row.color || '#e2e8f0' }} className="font-bold">
                    {row.value}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        <div
          ref={mainChartContainerRef}
          className={`absolute left-10 top-0 right-0 bottom-0 ${activeDrawingTool !== 'cursor' ? 'pointer-events-none' : ''
            } ${activeDrawingTool === 'eraser' ? 'cursor-crosshair' : ''} ${activeDrawingTool === 'trend_line' || activeDrawingTool === 'horizontal_line' || activeDrawingTool === 'horizontal_ray' || activeDrawingTool === 'vertical_line' || activeDrawingTool === 'rectangle' || activeDrawingTool === 'fibonacci' || activeDrawingTool === 'text_label' ? 'cursor-crosshair' : ''
            }`}
        />
      </div>

      {/* -- Bottom drag handle ----------------- */}
      <div
        ref={dragHandleRef}
        className="h-2 cursor-row-resize bg-surface border-t border-border hover:bg-accent/10 shrink-0 relative group"
        onMouseDown={startResize}
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-0.5 rounded bg-muted/60 group-hover:bg-accent/60 transition-colors" />
      </div>

      {/* -- Bottom info bar ------------------- */}
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
        <span className="text-[11px] text-green font-mono whitespace-nowrap">
          {countdown}
        </span>
        {rangeText && (
          <span className="text-[11px] text-muted font-mono ml-auto whitespace-nowrap">
            {rangeText}
          </span>
        )}
      </div>

      {/* -- Context menu ---------------------- */}
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
