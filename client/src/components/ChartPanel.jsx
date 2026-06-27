import { useEffect, useRef, useState, useCallback } from 'react'
import { createChart } from 'lightweight-charts'

const TF_SECONDS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '1d': 86400 }

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

export default function ChartPanel({ activeSymbol, tick }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const lineSeriesRef = useRef(null)
  const areaSeriesRef = useRef(null)
  const candleBufferRef = useRef({})
  const [tf, setTF] = useState('5m')
  const [chartType, setChartType] = useState('candle')

  const loadHistory = useCallback(async (symbol, timeframe) => {
    try {
      const res = await fetch(`/api/history/${encodeURIComponent(symbol)}`)
      const { candles } = await res.json()
      if (candles?.length && candleSeriesRef.current) {
        const tfSec = TF_SECONDS[timeframe] || 60
        const aggregated = aggregateCandles(candles, tfSec)
        candleSeriesRef.current.setData(aggregated)
        lineSeriesRef.current.setData(aggregated.map(c => ({ time: c.time, value: c.close })))
        areaSeriesRef.current.setData(aggregated.map(c => ({ time: c.time, value: c.close })))
        chartRef.current.timeScale().fitContent()
        candleBufferRef.current = {}
      }
    } catch {}
  }, [])

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

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a', downColor: '#ef5350',
      borderUpColor: '#26a69a', borderDownColor: '#ef5350',
      wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    })
    const lineSeries = chart.addLineSeries({ color: '#4f9cf9', lineWidth: 2, visible: false })
    const areaSeries = chart.addAreaSeries({
      topColor: '#4f9cf940', bottomColor: '#4f9cf905',
      lineColor: '#4f9cf9', lineWidth: 2, visible: false,
    })

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    lineSeriesRef.current = lineSeries
    areaSeriesRef.current = areaSeries

    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      chart.applyOptions({ width, height })
    })
    observer.observe(containerRef.current)

    return () => {
      observer.disconnect()
      chart.remove()
    }
  }, [])

  useEffect(() => {
    loadHistory(activeSymbol, tf)
  }, [activeSymbol, tf, loadHistory])

  useEffect(() => {
    if (candleSeriesRef.current) {
      candleSeriesRef.current.applyOptions({ visible: chartType === 'candle' })
      lineSeriesRef.current.applyOptions({ visible: chartType === 'line' })
      areaSeriesRef.current.applyOptions({ visible: chartType === 'area' })
    }
  }, [chartType])

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
    if (candleSeriesRef.current) {
      candleSeriesRef.current.update(candle)
      lineSeriesRef.current.update({ time: candle.time, value: candle.close })
      areaSeriesRef.current.update({ time: candle.time, value: candle.close })
    }
  }, [tick, activeSymbol, tf])

  const timeframes = ['1m', '5m', '15m', '1h', '1d']
  const chartTypes = [
    { key: 'candle', label: 'Candles' },
    { key: 'line', label: 'Line' },
    { key: 'area', label: 'Area' },
  ]

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
        <div className="ml-auto flex gap-1">
          {chartTypes.map(ct => (
            <button
              key={ct.key}
              className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
                chartType === ct.key
                  ? 'bg-surface border-accent text-accent'
                  : 'bg-transparent border-border text-muted'
              }`}
              onClick={() => setChartType(ct.key)}
            >
              {ct.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="flex-1 relative" />
    </div>
  )
}
