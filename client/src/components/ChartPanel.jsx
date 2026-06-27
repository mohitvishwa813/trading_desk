import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createChart } from 'lightweight-charts'
import CandleSelector from './CandleSelector'
import DrawingTools from './DrawingTools'
import {
  sma, ema, vwap, atr, supertrend, rsi, macd,
  stochastic, bollingerBands, obv, volumeMa,
} from '../utils/indicators'

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
function aggregateCandles(candles, tfSec) {
  if (tfSec === 60) return candles
  const result = []
  let current = null
  for (const c of candles) {
    const bucket = Math.floor(c.time / tfSec) * tfSec
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

function transformData(candles, style) {
  if (style === 'heikin_ashi') {
    const ha = computeHeikinAshi(candles)
    return ha.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }))
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

function isCandleSeries(style) { return ['candles', 'hollow_candles', 'volume_candles', 'heikin_ashi'].includes(style) }
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
  onFocus = () => {},
  onSymbolChange = () => {},
  drawings = [],
  onDrawingsChange = () => {},
  activeDrawingTool = 'cursor',
  onDrawingToolChange = () => {},
  indicators = [],
  onIndicatorsChange = () => {},
  replayMode = false,
  replayIndex = 0,
  onReplayUpdate = () => {},
  onReplayEnd = () => {},
}) {
  // --- State ----------------------------------
  const [tf, setTF] = useState('5m')
  const [chartStyle, setChartStyle] = useState(() => localStorage.getItem('chartStyle') || 'candles')
  const [loading, setLoading] = useState(false)
  const [visibleRange, setVisibleRange] = useState(null)
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
  const priceScaleMarginsRef = useRef({ top: 0.05, bottom: 0.05 })
  const svgRef = useRef(null)
  const mousePosRef = useRef(null)
  const dragStartRef = useRef(null) // { drawingId, startPoints, mouseX, mouseY }
  const activeDrawingToolRef = useRef(activeDrawingTool)
  activeDrawingToolRef.current = activeDrawingTool
  const drawingsRef = useRef(drawings)
  drawingsRef.current = drawings
  const onDrawingsChangeRef = useRef(onDrawingsChange)
  onDrawingsChangeRef.current = onDrawingsChange

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
          time: d.time, position: 'abovePrice',
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
    const tfSec = TF_SECONDS[tf] || 60
    const aggregated = aggregateCandles(candles, tfSec)
    loadedDataRef.current = aggregated
    setDataVersion(v => v + 1)

    const transformed = transformData(aggregated, style)
    updateActiveSeries(transformed, style)

    chartRef.current?.timeScale().fitContent()
  }, [tf, updateActiveSeries])

  // --- Initialize charts --------------------
  useEffect(() => {
    if (!mainChartContainerRef.current) return

    // --- Main chart --------------------------
    const mainChart = createChart(mainChartContainerRef.current, {
      layout: { background: { color: '#0d0f14' }, textColor: '#e2e8f0', attributionLogo: false },
      grid: { vertLines: { color: '#1e2330' }, horzLines: { color: '#1e2330' } },
      crosshair: { mode: 0 },
      rightPriceScale: { borderColor: '#252a36' },
      timeScale: { borderColor: '#252a36', timeVisible: true, secondsVisible: false, visible: false },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: false,
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
      const priceFactor = 0.03 * direction
      const margins = priceScaleMarginsRef.current

      const newTop = Math.max(0.01, Math.min(0.49, margins.top - priceFactor))
      const newBottom = Math.max(0.01, Math.min(0.49, margins.bottom - priceFactor))
      priceScaleMarginsRef.current = { top: newTop, bottom: newBottom }

      chart.applyOptions({
        rightPriceScale: {
          scaleMargins: { top: newTop, bottom: newBottom },
        },
      })

      if (!isOverPriceScale) {
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

    const ONE_CLICK_TOOLS = ['horizontal_line', 'horizontal_ray', 'vertical_line', 'text_label']
    const TWO_CLICK_TOOLS = ['trend_line', 'rectangle', 'fibonacci']
    const DRAWING_TOOLS = [...ONE_CLICK_TOOLS, ...TWO_CLICK_TOOLS]

    const getCoords = (clientX, clientY) => {
      const rect = container.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
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
      const rect = container.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      mousePosRef.current = { x: mx, y: my }
      const currentDrawings = curDrawings()

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

  // --- Fetch history ------------------------
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
          baseCandlesRef.current = candles
          refreshChart(candles, chartStyle)
        }
      } catch {
        // silently fail
      } finally {
        if (id === fetchIdRef.current) setLoading(false)
      }
    })()
  }, [activeSymbol, chartStyle, tf, refreshChart])

  // --- Style change -> refresh ---------------
  useEffect(() => {
    if (loadedDataRef.current.length) {
      refreshChart(loadedDataRef.current, chartStyle)
    }
  }, [chartStyle, refreshChart])

  // --- Real-time tick -----------------------
  useEffect(() => {
    if (!tick || tick.symbol !== activeSymbol) return
    if (replayMode) return // pause during replay

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
    const style = chartStyle

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
  }, [tick, activeSymbol, tf, chartStyle, replayMode])

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
    setChartStyle(styleId)
  }, [])

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

  // --- Preview line for two-click drawings ---
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
    return (
      <line
        x1={p1x} y1={p1y} x2={p2x} y2={p2y}
        stroke="#4f9cf9" strokeWidth={1} strokeDasharray="4 3" opacity={0.6}
      />
    )
  }, [drawingState.mode, drawingState.pendingPoint, visibleRange, previewBump])

  // --- JSX -----------------------------------
  return (
    <div
      className={`flex-1 flex flex-col overflow-hidden ${focusedClass}`}
      onClick={onFocus}
    >
      {/* -- Toolbar --------------------------- */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border-b border-border shrink-0 overflow-x-auto">
        {TIMEFRAMES.map(t => (
          <button
            key={t}
            className={`px-2 py-0.5 rounded text-[11px] border transition-colors whitespace-nowrap ${
              tf === t
                ? 'bg-accent border-accent text-white'
                : 'bg-transparent border-border text-muted hover:border-accent'
            }`}
            onClick={() => handleTFChange(t)}
          >
            {t}
          </button>
        ))}
        <div className="w-px h-4 bg-border shrink-0" />
        <CandleSelector value={chartStyle} onChange={handleCandleStyle} />
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

        {/* Drawing mode hint */}
        {activeDrawingTool !== 'cursor' && (
          <div className="absolute top-1 left-12 z-20 pointer-events-none">
            <span className="text-[10px] px-2 py-0.5 rounded bg-accent/20 text-accent border border-accent/40 font-mono">
              {drawingState.mode === 'placing'
                ? `Place second point (Esc to cancel)`
                : `Draw: ${activeDrawingTool.replace(/_/g, ' ')} (Esc to exit)`}
            </span>
          </div>
        )}

        <svg
          ref={svgRef}
          className={`absolute left-10 top-0 right-0 bottom-0 z-10 transition-none ${
            activeDrawingTool !== 'cursor' ? 'pointer-events-auto' : 'pointer-events-none'
          } ${activeDrawingTool !== 'cursor' ? 'cursor-crosshair' : ''}`}
          style={{ width: 'calc(100% - 40px)', height: '100%' }}
        >
          {drawingSvgElements}
          {previewElements}
        </svg>

        <div
          ref={mainChartContainerRef}
          className={`absolute left-10 top-0 right-0 bottom-0 ${
            activeDrawingTool !== 'cursor' ? 'pointer-events-none' : ''
          } ${activeDrawingTool === 'eraser' ? 'cursor-crosshair' : ''} ${
            activeDrawingTool === 'trend_line' || activeDrawingTool === 'horizontal_line' || activeDrawingTool === 'horizontal_ray' || activeDrawingTool === 'vertical_line' || activeDrawingTool === 'rectangle' || activeDrawingTool === 'fibonacci' || activeDrawingTool === 'text_label' ? 'cursor-crosshair' : ''
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
