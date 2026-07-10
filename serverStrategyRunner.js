// serverStrategyRunner.js
// Server-side interpretation of Javascript DSL strategies for background executions.

// ─── Local Indicators Implementation (Matching Client Indicators) ───────────

function ema(candles, period) {
  if (!candles || candles.length < period || period < 1) return []
  const result = []
  const k = 2 / (period + 1)
  let sum = 0
  for (let i = 0; i < period; i++) sum += candles[i].close
  let prevEma = sum / period
  result.push({ time: candles[period - 1].time, value: prevEma })
  for (let i = period; i < candles.length; i++) {
    const val = candles[i].close * k + prevEma * (1 - k)
    result.push({ time: candles[i].time, value: val })
    prevEma = val
  }
  return result
}

function sma(candles, period) {
  if (!candles || candles.length < period || period < 1) return []
  const result = []
  let sum = 0
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close
    if (i >= period - 1) {
      if (i >= period) sum -= candles[i - period].close
      result.push({ time: candles[i].time, value: sum / period })
    }
  }
  return result
}

function vwap(candles) {
  if (!candles || candles.length === 0) return []
  const result = []
  let cumTpv = 0
  let cumVol = 0
  for (const c of candles) {
    const typPrice = (c.high + c.low + c.close) / 3
    cumTpv += typPrice * c.volume
    cumVol += c.volume
    result.push({ time: c.time, value: cumTpv / cumVol })
  }
  return result
}

function atr(candles, period) {
  if (!candles || candles.length < period + 1 || period < 1) return []
  const result = []
  let sum = 0
  let prevAtr
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    )
    if (i <= period) sum += tr
    if (i === period) {
      prevAtr = sum / period
      result.push({ time: candles[i].time, value: prevAtr })
    } else if (i > period) {
      prevAtr = (prevAtr * (period - 1) + tr) / period
      result.push({ time: candles[i].time, value: prevAtr })
    }
  }
  return result
}

function supertrend(candles, factor, period) {
  if (!candles || candles.length < period + 1 || period < 1) return []
  const atrValues = atr(candles, period)
  if (atrValues.length === 0) return []
  const result = []
  let prevUpperBand, prevLowerBand
  let prevDirection = -1
  for (let i = period; i < candles.length; i++) {
    const c = candles[i]
    const atrVal = atrValues[i - period].value
    const hl2 = (c.high + c.low) / 2
    const basicUpper = hl2 + factor * atrVal
    const basicLower = hl2 - factor * atrVal
    let finalUpper, finalLower
    if (i === period) {
      finalUpper = basicUpper
      finalLower = basicLower
    } else {
      const prev = candles[i - 1]
      finalUpper = basicUpper < prevUpperBand || prev.close > prevUpperBand
        ? basicUpper : prevUpperBand
      finalLower = basicLower > prevLowerBand || prev.close < prevLowerBand
        ? basicLower : prevLowerBand
    }
    let direction
    if (c.close > finalUpper) {
      direction = 1
    } else if (c.close < finalLower) {
      direction = -1
    } else if (i === period) {
      direction = -1
    } else {
      direction = prevDirection
    }
    result.push({
      time: c.time,
      value: direction === 1 ? finalLower : finalUpper,
      direction
    })
    prevUpperBand = finalUpper
    prevLowerBand = finalLower
    prevDirection = direction
  }
  return result
}

function rsi(candles, period) {
  if (!candles || candles.length < period + 1 || period < 1) return []
  const gains = []
  const losses = []
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close
    gains.push(diff > 0 ? diff : 0)
    losses.push(diff < 0 ? -diff : 0)
  }
  const result = []
  let avgGain = 0
  let avgLoss = 0
  for (let i = 0; i < gains.length; i++) {
    if (i === period - 1) {
      let sg = 0, sl = 0
      for (let j = 0; j < period; j++) {
        sg += gains[j]
        sl += losses[j]
      }
      avgGain = sg / period
      avgLoss = sl / period
    } else if (i >= period) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period
    }
    if (i >= period - 1) {
      const rs = avgLoss === 0 ? 999 : avgGain / avgLoss
      result.push({ time: candles[i + 1].time, value: 100 - 100 / (1 + rs) })
    }
  }
  return result
}

function macd(candles, fast, slow, signal) {
  if (!candles || candles.length < slow || fast < 1 || slow < 1 || signal < 1) return []
  const fastEma = ema(candles, fast)
  const slowEma = ema(candles, slow)
  const fastMap = new Map()
  for (const v of fastEma) fastMap.set(v.time, v.value)
  const macdLine = []
  for (const v of slowEma) {
    const fv = fastMap.get(v.time)
    if (fv !== undefined) macdLine.push({ time: v.time, macd: fv - v.value })
  }
  if (macdLine.length < signal) return []
  const sigK = 2 / (signal + 1)
  let sigSum = 0
  for (let i = 0; i < signal; i++) sigSum += macdLine[i].macd
  let prevSig = sigSum / signal
  const sigLine = [{ time: macdLine[signal - 1].time, value: prevSig }]
  for (let i = signal; i < macdLine.length; i++) {
    const s = macdLine[i].macd * sigK + prevSig * (1 - sigK)
    sigLine.push({ time: macdLine[i].time, value: s })
    prevSig = s
  }
  const sigMap = new Map()
  for (const v of sigLine) sigMap.set(v.time, v.value)
  const result = []
  for (const v of macdLine) {
    const s = sigMap.get(v.time)
    if (s !== undefined) {
      result.push({ time: v.time, macd: v.macd, signal: s, histogram: v.macd - s })
    }
  }
  return result
}

function stochastic(candles, kPeriod, dPeriod) {
  if (!candles || candles.length < kPeriod + dPeriod - 1 || kPeriod < 1 || dPeriod < 1) return []
  const kValues = []
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let high = -Infinity, low = Infinity
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > high) high = candles[j].high
      if (candles[j].low < low) low = candles[j].low
    }
    const range = high - low
    const k = range === 0 ? 0 : ((candles[i].close - low) / range) * 100
    kValues.push({ time: candles[i].time, value: k })
  }
  const dValues = []
  let sum = 0
  for (let i = 0; i < kValues.length; i++) {
    sum += kValues[i].value
    if (i >= dPeriod - 1) {
      if (i >= dPeriod) sum -= kValues[i - dPeriod].value
      dValues.push({ time: kValues[i].time, value: sum / dPeriod })
    }
  }
  const dMap = new Map()
  for (const v of dValues) dMap.set(v.time, v.value)
  const result = []
  for (const v of kValues) {
    const d = dMap.get(v.time)
    if (d !== undefined) result.push({ time: v.time, k: v.value, d })
  }
  return result
}

function bollingerBands(candles, period, stddev) {
  if (!candles || candles.length < period || period < 1) return []
  const result = []
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close
    const mean = sum / period
    let sumSq = 0
    for (let j = i - period + 1; j <= i; j++) {
      const d = candles[j].close - mean
      sumSq += d * d
    }
    const sd = Math.sqrt(sumSq / period)
    result.push({
      time: candles[i].time,
      upper: mean + stddev * sd,
      middle: mean,
      lower: mean - stddev * sd
    })
  }
  return result
}

function obv(candles) {
  if (!candles || candles.length === 0) return []
  const result = [{ time: candles[0].time, value: 0 }]
  let val = 0
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) val += candles[i].volume
    else if (candles[i].close < candles[i - 1].close) val -= candles[i].volume
    result.push({ time: candles[i].time, value: val })
  }
  return result
}

function volumeMa(candles, period) {
  if (!candles || candles.length < period || period < 1) return []
  const result = []
  let sum = 0
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].volume
    if (i >= period - 1) {
      if (i >= period) sum -= candles[i - period].volume
      result.push({ time: candles[i].time, value: sum / period })
    }
  }
  return result
}

// ─── Aligning Helpers ──────────────────────────────────────────────────────────

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

// ─── Exec Strategy ────────────────────────────────────────────────────────────

function run(candles, code) {
  if (!candles || candles.length === 0) return { signals: [], alerts: [] }
  const rawSignals = []
  const rawAlerts = []

  const openArr   = candles.map(c => c.open)
  const highArr   = candles.map(c => c.high)
  const lowArr    = candles.map(c => c.low)
  const closeArr  = candles.map(c => c.close)
  const volumeArr = candles.map(c => c.volume)

  const taCache = {}
  let currentBarIndex = 0

  const ta = {
    sma: (src, period) => {
      const key = `sma_${period}_${src === closeArr ? 'close' : Math.random()}`
      if (!taCache[key]) {
        const fakeBars = src.map((v, i) => ({ ...candles[i], close: v }))
        taCache[key] = alignSeries(candles, sma(fakeBars, period))
      }
      return taCache[key]
    },
    ema: (src, period) => {
      const key = `ema_${period}_${src === closeArr ? 'close' : Math.random()}`
      if (!taCache[key]) {
        const fakeBars = src.map((v, i) => ({ ...candles[i], close: v }))
        taCache[key] = alignSeries(candles, ema(fakeBars, period))
      }
      return taCache[key]
    },
    rsi: (src, period) => {
      const key = `rsi_${period}`
      if (!taCache[key]) {
        const fakeBars = src.map((v, i) => ({ ...candles[i], close: v }))
        taCache[key] = alignSeries(candles, rsi(fakeBars, period))
      }
      return taCache[key]
    },
    macd: (src, fast = 12, slow = 26, signal = 9) => {
      const key = `macd_${fast}_${slow}_${signal}`
      if (!taCache[key]) {
        const fakeBars = src.map((v, i) => ({ ...candles[i], close: v }))
        const raw = macd(fakeBars, fast, slow, signal)
        taCache[key] = alignMulti(candles, raw, ['macd', 'signal', 'histogram'])
      }
      const c = taCache[key]
      return [c.macd, c.signal, c.histogram]
    },
    bb: (src, period = 20, mult = 2) => {
      const key = `bb_${period}_${mult}`
      if (!taCache[key]) {
        const fakeBars = src.map((v, i) => ({ ...candles[i], close: v }))
        const raw = bollingerBands(fakeBars, period, mult)
        taCache[key] = alignMulti(candles, raw, ['upper', 'middle', 'lower'])
      }
      const c = taCache[key]
      return [c.upper, c.middle, c.lower]
    },
    atr: (period = 14) => {
      const key = `atr_${period}`
      if (!taCache[key]) taCache[key] = alignSeries(candles, atr(candles, period))
      return taCache[key]
    },
    supertrend: (factor = 3, period = 10) => {
      const key = `st_${factor}_${period}`
      if (!taCache[key]) {
        const raw = supertrend(candles, factor, period)
        taCache[key] = alignMulti(candles, raw, ['value', 'direction'])
      }
      const c = taCache[key]
      return [c.value, c.direction]
    },
    vwap: () => {
      if (!taCache['vwap']) taCache['vwap'] = alignSeries(candles, vwap(candles))
      return taCache['vwap']
    },
    stoch: (kPeriod = 14, dPeriod = 3) => {
      const key = `stoch_${kPeriod}_${dPeriod}`
      if (!taCache[key]) {
        const raw = stochastic(candles, kPeriod, dPeriod)
        taCache[key] = alignMulti(candles, raw, ['k', 'd'])
      }
      const c = taCache[key]
      return [c.k, c.d]
    },
    obv: () => {
      if (!taCache['obv']) taCache['obv'] = alignSeries(candles, obv(candles))
      return taCache['obv']
    },
    volumeMa: (period = 20) => {
      const key = `volma_${period}`
      if (!taCache[key]) taCache[key] = alignSeries(candles, volumeMa(candles, period))
      return taCache[key]
    },
    crossover: (a, b, i) => {
      if (i != null) currentBarIndex = i
      if (i < 1) return false
      const prev_a = a[i-1], prev_b = b[i-1], cur_a = a[i], cur_b = b[i]
      if (prev_a == null || prev_b == null || cur_a == null || cur_b == null) return false
      return prev_a < prev_b && cur_a >= cur_b
    },
    crossunder: (a, b, i) => {
      if (i != null) currentBarIndex = i
      if (i < 1) return false
      const prev_a = a[i-1], prev_b = b[i-1], cur_a = a[i], cur_b = b[i]
      if (prev_a == null || prev_b == null || cur_a == null || cur_b == null) return false
      return prev_a > prev_b && cur_a <= cur_b
    }
  }

  const positionState = { size: 0, avgPrice: 0, realizedPnl: 0 }
  let exitRules = null
  let trailingStopState = null

  function triggerExit(i, price, label, qty) {
    const sizeSign = Math.sign(positionState.size);
    const absSize = Math.abs(positionState.size);
    const closeQty = Math.min(qty || absSize, absSize);

    rawSignals.push({
      barIndex: i,
      type: 'CLOSE',
      label,
      time: candles[i].time,
      price,
      options: {
        qty: closeQty
      }
    });

    const tradePnl = positionState.size > 0
      ? (price - positionState.avgPrice) * closeQty
      : (positionState.avgPrice - price) * closeQty;

    positionState.realizedPnl += tradePnl;
    
    if (closeQty >= absSize) {
      positionState.size = 0;
      positionState.avgPrice = 0;
      exitRules = null;
      if (trailingStopState) trailingStopState.active = false;
    } else {
      positionState.size = (absSize - closeQty) * sizeSign;
    }
  }

  function checkExits(i) {
    if (positionState.size === 0) return;
    const c = candles[i];
    if (!c) return;

    if (exitRules) {
      if (positionState.size > 0) {
        if (exitRules.tp && c.high >= exitRules.tp) {
          triggerExit(i, exitRules.tp, 'TP Hit', Math.abs(positionState.size));
          return;
        }
        if (exitRules.sl && c.low <= exitRules.sl) {
          triggerExit(i, exitRules.sl, 'SL Hit', Math.abs(positionState.size));
          return;
        }
      } else {
        if (exitRules.tp && c.low <= exitRules.tp) {
          triggerExit(i, exitRules.tp, 'TP Hit', Math.abs(positionState.size));
          return;
        }
        if (exitRules.sl && c.high >= exitRules.sl) {
          triggerExit(i, exitRules.sl, 'SL Hit', Math.abs(positionState.size));
          return;
        }
      }
    }

    if (trailingStopState && trailingStopState.active) {
      if (positionState.size > 0) {
        trailingStopState.highestPrice = Math.max(trailingStopState.highestPrice, c.high);
        const stopLevel = trailingStopState.highestPrice * (1 - trailingStopState.trailPercent / 100);
        if (c.low <= stopLevel) {
          triggerExit(i, stopLevel, 'Trailing SL Hit', Math.abs(positionState.size));
        }
      } else {
        trailingStopState.lowestPrice = Math.min(trailingStopState.lowestPrice, c.low);
        const stopLevel = trailingStopState.lowestPrice * (1 + trailingStopState.trailPercent / 100);
        if (c.high >= stopLevel) {
          triggerExit(i, stopLevel, 'Trailing SL Hit', Math.abs(positionState.size));
        }
      }
    }
  }

  const strategy = {
    position: {
      get size() { return positionState.size },
      get avgPrice() { return positionState.avgPrice }
    },
    get equity() { return 100000 + positionState.realizedPnl },
    buy: (i, label = 'Buy', options = {}) => {
      if (i < 0 || i >= candles.length) return
      currentBarIndex = i
      checkExits(i)

      if (positionState.size > 0) {
        return; // single active trade constraint
      }

      const qty = options.qty || 1
      const price = candles[i].close

      if (positionState.size < 0) {
        const absSize = Math.abs(positionState.size)
        const closedQty = Math.min(qty, absSize)
        positionState.realizedPnl += (positionState.avgPrice - price) * closedQty

        if (qty > absSize) {
          positionState.size = qty - absSize
          positionState.avgPrice = price
        } else if (qty < absSize) {
          positionState.size = positionState.size + qty
        } else {
          positionState.size = 0
          positionState.avgPrice = 0
        }
      } else {
        positionState.avgPrice = ((positionState.avgPrice * positionState.size) + (price * qty)) / (positionState.size + qty)
        positionState.size += qty
      }

      rawSignals.push({ barIndex: i, type: 'BUY', label, time: candles[i].time, price, options: { qty } })
    },
    sell: (i, label = 'Sell', options = {}) => {
      if (i < 0 || i >= candles.length) return
      currentBarIndex = i
      checkExits(i)

      if (positionState.size < 0) {
        return; // single active trade constraint
      }

      const qty = options.qty || 1
      const price = candles[i].close

      if (positionState.size > 0) {
        const closedQty = Math.min(qty, positionState.size)
        positionState.realizedPnl += (price - positionState.avgPrice) * closedQty

        if (qty > positionState.size) {
          positionState.size = -(qty - positionState.size)
          positionState.avgPrice = price
        } else if (qty < positionState.size) {
          positionState.size -= qty
        } else {
          positionState.size = 0
          positionState.avgPrice = 0
        }
      } else {
        const absSize = Math.abs(positionState.size)
        positionState.avgPrice = ((positionState.avgPrice * absSize) + (price * qty)) / (absSize + qty)
        positionState.size -= qty
      }

      rawSignals.push({ barIndex: i, type: 'SELL', label, time: candles[i].time, price, options: { qty } })
    },
    close: (i, label = 'Close', options = {}) => {
      if (i < 0 || i >= candles.length || positionState.size === 0) return
      currentBarIndex = i
      const qty = options.qty || Math.abs(positionState.size)
      triggerExit(i, candles[i].close, label, qty)
    },
    exit: (i, opts = {}) => {
      if (i < 0 || i >= candles.length) return
      currentBarIndex = i
      exitRules = { sl: opts.sl, tp: opts.tp }
    },
    trailingStop: (opts = {}) => {
      if (positionState.size === 0) return
      trailingStopState = {
        active: true,
        highestPrice: candles[currentBarIndex]?.high || candles[currentBarIndex]?.close,
        lowestPrice: candles[currentBarIndex]?.low || candles[currentBarIndex]?.close,
        trailPercent: opts.trailPercent || 1
      }
    },
    alert: (condition, options = {}) => {
      if (condition) {
        const bar = candles[currentBarIndex] || candles[candles.length - 1]
        rawAlerts.push({
          message: typeof options === 'string' ? options : options.message || 'Alert',
          time: bar.time,
          price: bar.close
        })
      }
    }
  }

  const plot = () => {}
  const chart = { drawLine: () => {}, drawLabel: () => {}, priceLine: () => {}, marker: () => {} }
  const dashboard = { set: () => {}, table: () => {} }

  try {
    const fn = new Function('bars', 'open', 'high', 'low', 'close', 'volume', 'ta', 'strategy', 'plot', 'chart', 'dashboard', code)
    fn(candles, openArr, highArr, lowArr, closeArr, volumeArr, ta, strategy, plot, chart, dashboard)
  } catch (e) {
    // strategy parse error
  }

  return { signals: rawSignals, alerts: rawAlerts }
}

module.exports = { run }
