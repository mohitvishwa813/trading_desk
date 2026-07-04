/**
 * strategyRunner.js
 * Browser-side JS DSL interpreter for trading strategies.
 * All TA functions from indicators.js are injected as globals.
 */

import {
  sma as _sma, ema as _ema, rsi as _rsi,
  macd as _macd, bollingerBands as _bb, atr as _atr,
  supertrend as _supertrend, vwap as _vwap,
  stochastic as _stoch, obv as _obv, volumeMa as _volumeMa,
} from './indicators'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function alignSeries(candles, indicatorOutput) {
  const map = new Map()
  for (const v of indicatorOutput) map.set(v.time, v.value)
  return candles.map(c => map.has(c.time) ? map.get(c.time) : null)
}

function alignMulti(candles, indicatorOutput, keys) {
  const maps = {}
  for (const k of keys) maps[k] = new Map()
  for (const v of indicatorOutput) {
    for (const k of keys) {
      if (v[k] !== undefined) maps[k].set(v.time, v[k])
    }
  }
  const result = {}
  for (const k of keys) {
    result[k] = candles.map(c => maps[k].has(c.time) ? maps[k].get(c.time) : null)
  }
  return result
}

// ─── Validate code (parse-only, no execution) ─────────────────────────────────

export function validateCode(code) {
  try {
    // eslint-disable-next-line no-new-func
    new Function(
      'bars', 'open', 'high', 'low', 'close', 'volume',
      'ta', 'strategy', 'plot', 'chart', 'dashboard',
      code
    )
    return { valid: true, error: null, line: null }
  } catch (err) {
    // Extract line number from error message if available
    const match = err.message.match(/line (\d+)/i) ||
                  err.stack?.match(/<anonymous>:(\d+)/)
    const lineRaw = match ? parseInt(match[1], 10) : null
    const line = lineRaw ? lineRaw - 1 : null
    return { valid: false, error: err.message, line }
  }
}

// ─── Main runner ───────────────────────────────────────────────────────────────

export function run(candles, code) {
  if (!candles || candles.length === 0) {
    return {
      plots: [],
      signals: [],
      stats: null,
      logs: ['[ERROR] No candle data available'],
      lines: [],
      labels: [],
      dashboard: {},
      alerts: [],
    }
  }

  const logs = []
  const plots = []
  const rawSignals = []
  const lineMap = new Map()
  const labelMap = new Map()
  const dashboardMap = new Map()
  const rawAlerts = []

  // ── Build series arrays ──────────────────────────────────────────────────────
  const openArr   = candles.map(c => c.open)
  const highArr   = candles.map(c => c.high)
  const lowArr    = candles.map(c => c.low)
  const closeArr  = candles.map(c => c.close)
  const volumeArr = candles.map(c => c.volume)

  // ── Pre-compute ALL TA series (lazy, cached) ─────────────────────────────────
  const taCache = {}

  const ta = {
    sma: (src, period) => {
      const key = `sma_${period}_${src === closeArr ? 'close' : Math.random()}`
      if (!taCache[key]) {
        const fakeBars = src.map((v, i) => ({ ...candles[i], close: v }))
        taCache[key] = alignSeries(candles, _sma(fakeBars, period))
      }
      return taCache[key]
    },
    ema: (src, period) => {
      const key = `ema_${period}_${src === closeArr ? 'close' : Math.random()}`
      if (!taCache[key]) {
        const fakeBars = src.map((v, i) => ({ ...candles[i], close: v }))
        taCache[key] = alignSeries(candles, _ema(fakeBars, period))
      }
      return taCache[key]
    },
    rsi: (src, period) => {
      const key = `rsi_${period}`
      if (!taCache[key]) {
        const fakeBars = src.map((v, i) => ({ ...candles[i], close: v }))
        taCache[key] = alignSeries(candles, _rsi(fakeBars, period))
      }
      return taCache[key]
    },
    macd: (src, fast = 12, slow = 26, signal = 9) => {
      const key = `macd_${fast}_${slow}_${signal}`
      if (!taCache[key]) {
        const fakeBars = src.map((v, i) => ({ ...candles[i], close: v }))
        const raw = _macd(fakeBars, fast, slow, signal)
        const aligned = alignMulti(candles, raw, ['macd', 'signal', 'histogram'])
        taCache[key] = aligned
      }
      const c = taCache[key]
      return [c.macd, c.signal, c.histogram]
    },
    bb: (src, period = 20, mult = 2) => {
      const key = `bb_${period}_${mult}`
      if (!taCache[key]) {
        const fakeBars = src.map((v, i) => ({ ...candles[i], close: v }))
        const raw = _bb(fakeBars, period, mult)
        const aligned = alignMulti(candles, raw, ['upper', 'middle', 'lower'])
        taCache[key] = aligned
      }
      const c = taCache[key]
      return [c.upper, c.middle, c.lower]
    },
    atr: (period = 14) => {
      const key = `atr_${period}`
      if (!taCache[key]) taCache[key] = alignSeries(candles, _atr(candles, period))
      return taCache[key]
    },
    supertrend: (factor = 3, period = 10) => {
      const key = `st_${factor}_${period}`
      if (!taCache[key]) {
        const raw = _supertrend(candles, factor, period)
        const aligned = alignMulti(candles, raw, ['value', 'direction'])
        taCache[key] = aligned
      }
      const c = taCache[key]
      return [c.value, c.direction]
    },
    vwap: () => {
      if (!taCache['vwap']) taCache['vwap'] = alignSeries(candles, _vwap(candles))
      return taCache['vwap']
    },
    stoch: (kPeriod = 14, dPeriod = 3) => {
      const key = `stoch_${kPeriod}_${dPeriod}`
      if (!taCache[key]) {
        const raw = _stoch(candles, kPeriod, dPeriod)
        const aligned = alignMulti(candles, raw, ['k', 'd'])
        taCache[key] = aligned
      }
      const c = taCache[key]
      return [c.k, c.d]
    },
    obv: () => {
      if (!taCache['obv']) taCache['obv'] = alignSeries(candles, _obv(candles))
      return taCache['obv']
    },
    volumeMa: (period = 20) => {
      const key = `volma_${period}`
      if (!taCache[key]) taCache[key] = alignSeries(candles, _volumeMa(candles, period))
      return taCache[key]
    },
    crossover: (a, b, i) => {
      if (i < 1) return false
      const prev_a = a[i-1], prev_b = b[i-1], cur_a = a[i], cur_b = b[i]
      if (prev_a == null || prev_b == null || cur_a == null || cur_b == null) return false
      return prev_a < prev_b && cur_a >= cur_b
    },
    crossunder: (a, b, i) => {
      if (i < 1) return false
      const prev_a = a[i-1], prev_b = b[i-1], cur_a = a[i], cur_b = b[i]
      if (prev_a == null || prev_b == null || cur_a == null || cur_b == null) return false
      return prev_a > prev_b && cur_a <= cur_b
    },
    adx: (period = 14) => {
      const key = `adx_${period}`
      if (taCache[key]) return taCache[key]

      const tr = []
      const plusDM = []
      const minusDM = []

      // 1. Calculate TR, +DM, -DM
      for (let i = 0; i < candles.length; i++) {
        if (i === 0) {
          tr.push(candles[i].high - candles[i].low)
          plusDM.push(0)
          minusDM.push(0)
          continue
        }

        const prev = candles[i - 1]
        const curr = candles[i]

        const trVal = Math.max(
          curr.high - curr.low,
          Math.abs(curr.high - prev.close),
          Math.abs(curr.low - prev.close)
        )
        tr.push(trVal)

        const upDiff = curr.high - prev.high
        const downDiff = prev.low - curr.low

        let pDM = 0
        let mDM = 0

        if (upDiff > downDiff && upDiff > 0) {
          pDM = upDiff
        }
        if (downDiff > upDiff && downDiff > 0) {
          mDM = downDiff
        }

        plusDM.push(pDM)
        minusDM.push(mDM)
      }

      // 2. Smooth TR, +DM, -DM using Wilder's technique
      const smoothedTR = new Array(candles.length).fill(null)
      const smoothedPlusDM = new Array(candles.length).fill(null)
      const smoothedMinusDM = new Array(candles.length).fill(null)

      let sumTR = 0
      let sumPlusDM = 0
      let sumMinusDM = 0

      for (let i = 0; i < period; i++) {
        if (i < candles.length) {
          sumTR += tr[i]
          sumPlusDM += plusDM[i]
          sumMinusDM += minusDM[i]
        }
      }

      if (period <= candles.length) {
        smoothedTR[period - 1] = sumTR
        smoothedPlusDM[period - 1] = sumPlusDM
        smoothedMinusDM[period - 1] = sumMinusDM
      }

      for (let i = period; i < candles.length; i++) {
        smoothedTR[i] = smoothedTR[i - 1] - (smoothedTR[i - 1] / period) + tr[i]
        smoothedPlusDM[i] = smoothedPlusDM[i - 1] - (smoothedPlusDM[i - 1] / period) + plusDM[i]
        smoothedMinusDM[i] = smoothedMinusDM[i - 1] - (smoothedMinusDM[i - 1] / period) + minusDM[i]
      }

      // 3. Compute +DI, -DI, and DX
      const dx = new Array(candles.length).fill(null)
      for (let i = period - 1; i < candles.length; i++) {
        const sTR = smoothedTR[i]
        if (!sTR) continue

        const plusDI = (smoothedPlusDM[i] / sTR) * 100
        const minusDI = (smoothedMinusDM[i] / sTR) * 100

        const sumDI = plusDI + minusDI
        const diffDI = Math.abs(plusDI - minusDI)

        dx[i] = sumDI === 0 ? 0 : (diffDI / sumDI) * 100
      }

      // 4. Compute ADX
      const adxArr = new Array(candles.length).fill(null)
      let sumDX = 0
      let validDXCount = 0

      const firstADXIdx = 2 * period - 2

      if (firstADXIdx < candles.length) {
        for (let i = period - 1; i <= firstADXIdx; i++) {
          if (dx[i] !== null) {
            sumDX += dx[i]
            validDXCount++
          }
        }
        if (validDXCount === period) {
          adxArr[firstADXIdx] = sumDX / period
        }
      }

      for (let i = firstADXIdx + 1; i < candles.length; i++) {
        if (adxArr[i - 1] !== null && dx[i] !== null) {
          adxArr[i] = (adxArr[i - 1] * (period - 1) + dx[i]) / period
        }
      }

      taCache[key] = adxArr
      return adxArr
    },
  }

  // ── Strategy signal & alert recorder ─────────────────────────────────────────
  const strategy = {
    buy: (i, label = 'Buy') => {
      if (i < 0 || i >= candles.length) return
      rawSignals.push({ barIndex: i, type: 'BUY', label, time: candles[i].time, price: candles[i].close })
    },
    sell: (i, label = 'Sell') => {
      if (i < 0 || i >= candles.length) return
      rawSignals.push({ barIndex: i, type: 'SELL', label, time: candles[i].time, price: candles[i].close })
    },
    close: (i, label = 'Close') => {
      if (i < 0 || i >= candles.length) return
      rawSignals.push({ barIndex: i, type: 'CLOSE', label, time: candles[i].time, price: candles[i].close })
    },
    alert: (condition, message, barIdx = candles.length - 1) => {
      if (condition) {
        const idx = Math.max(0, Math.min(barIdx, candles.length - 1))
        rawAlerts.push({
          time: candles[idx]?.time || Math.floor(Date.now() / 1000),
          barIndex: idx,
          message: String(message),
        })
      }
    },
  }

  // ── Plot recorder ────────────────────────────────────────────────────────────
  const plot = (series, name = 'Plot', color = '#4f9cf9') => {
    if (!Array.isArray(series)) return
    const data = series
      .map((v, i) => ({ time: candles[i]?.time, value: v }))
      .filter(p => p.time != null && p.value != null && !isNaN(p.value))
    plots.push({ name, color, data })
  }

  // ── Chart overlay line & label API ──────────────────────────────────────────
  const chart = {
    drawLine: (id, x1, y1, x2, y2, options = {}) => {
      const tx1 = (typeof x1 === 'number' && x1 < candles.length) ? candles[x1]?.time : x1
      const tx2 = (typeof x2 === 'number' && x2 < candles.length) ? candles[x2]?.time : x2

      lineMap.set(id, {
        id,
        x1: tx1,
        y1,
        x2: tx2,
        y2,
        color: options.color || '#4f9cf9',
        width: options.width || 1.5,
        style: options.style || 'solid',
        extendRight: !!options.extendRight,
      })
    },
    drawLabel: (id, x, y, text, options = {}) => {
      const tx = (typeof x === 'number' && x < candles.length) ? candles[x]?.time : x

      labelMap.set(id, {
        id,
        x: tx,
        y,
        text: String(text),
        color: options.color || '#131722',
        textColor: options.textColor || '#e2e8f0',
        position: options.position || 'above',
      })
    },
  }

  // ── Stats table / dashboard API ──────────────────────────────────────────────
  const dashboard = {
    set: (rowLabel, value, colorHex = '#e2e8f0') => {
      dashboardMap.set(rowLabel, {
        value: String(value),
        color: colorHex,
      })
    },
  }

  // ── Capture console output from strategy ─────────────────────────────────────
  const origLog = console.log
  const origWarn = console.warn
  console.log  = (...args) => { logs.push(`[LOG] ${args.map(safeStr).join(' ')}`); origLog(...args) }
  console.warn = (...args) => { logs.push(`[WARN] ${args.map(safeStr).join(' ')}`); origWarn(...args) }

  try {
    // ── Execute user code ──────────────────────────────────────────────────────
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      'bars', 'open', 'high', 'low', 'close', 'volume',
      'ta', 'strategy', 'plot', 'chart', 'dashboard',
      code
    )
    fn(candles, openArr, highArr, lowArr, closeArr, volumeArr, ta, strategy, plot, chart, dashboard)

    logs.unshift(`[INFO] OK — ${candles.length} bars processed, ${rawSignals.length} signals`)
  } catch (err) {
    const match = err.stack?.match(/<anonymous>:(\d+)/)
    const line = match ? parseInt(match[1], 10) - 1 : null
    const errMsg = line ? `[ERROR] Line ${line}: ${err.message}` : `[ERROR] ${err.message}`
    logs.unshift(errMsg)
    console.log = origLog
    console.warn = origWarn
    return { plots: [], signals: [], stats: null, logs, lines: [], labels: [], dashboard: {}, alerts: [] }
  } finally {
    console.log = origLog
    console.warn = origWarn
  }

  // ── Add signal logs ──────────────────────────────────────────────────────────
  for (const sig of rawSignals) {
    const d = new Date(sig.time * 1000)
    const t = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    const dateStr = d.toLocaleDateString('en-IN', { day:'2-digit', month:'short' })
    logs.push(`[${sig.type}] ${dateStr} ${t} @ ₹${Number(sig.price).toLocaleString('en-IN', {maximumFractionDigits:2})} — ${sig.label}`)
  }

  // ── Add alert logs ───────────────────────────────────────────────────────────
  for (const al of rawAlerts) {
    const d = new Date(al.time * 1000)
    const t = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    logs.push(`[ALERT] ${t} — ${al.message}`)
  }

  // ── Compute backtest stats ───────────────────────────────────────────────────
  const stats = computeStats(rawSignals, candles)

  return {
    plots,
    signals: rawSignals,
    stats,
    logs,
    lines: Array.from(lineMap.values()),
    labels: Array.from(labelMap.values()),
    dashboard: Object.fromEntries(dashboardMap),
    alerts: rawAlerts,
  }
}

// ─── Backtest Stats ─────────────────────────────────────────────────────────

function computeStats(signals, candles) {
  if (signals.length === 0) return null

  const trades = []
  let openTrade = null

  for (const sig of signals) {
    if (!openTrade && (sig.type === 'BUY' || sig.type === 'SELL')) {
      openTrade = { ...sig }
    } else if (openTrade) {
      const entryPrice = openTrade.price
      const exitPrice  = sig.price
      let pnl
      if (openTrade.type === 'BUY') {
        pnl = exitPrice - entryPrice
      } else {
        pnl = entryPrice - exitPrice
      }
      trades.push({ entryPrice, exitPrice, pnl, entryTime: openTrade.time, exitTime: sig.time })
      openTrade = null
    }
  }

  if (trades.length === 0) return { totalTrades: 0 }

  const wins = trades.filter(t => t.pnl > 0).length
  const losses = trades.filter(t => t.pnl <= 0).length
  const totalPnL = trades.reduce((s, t) => s + t.pnl, 0)
  const avgWin   = wins > 0 ? trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 0) / wins : 0
  const avgLoss  = losses > 0 ? trades.filter(t => t.pnl <= 0).reduce((s, t) => s + t.pnl, 0) / losses : 0

  // Max drawdown
  let peak = 0, cumPnL = 0, maxDD = 0
  for (const t of trades) {
    cumPnL += t.pnl
    if (cumPnL > peak) peak = cumPnL
    const dd = peak - cumPnL
    if (dd > maxDD) maxDD = dd
  }

  return {
    totalTrades: trades.length,
    wins,
    losses,
    winRate: `${((wins / trades.length) * 100).toFixed(1)}%`,
    totalPnL: parseFloat(totalPnL.toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    maxDrawdown: parseFloat((-maxDD).toFixed(2)),
  }
}

function safeStr(v) {
  if (v == null) return String(v)
  if (typeof v === 'string') return v
  try { return JSON.stringify(v) } catch { return String(v) }
}
