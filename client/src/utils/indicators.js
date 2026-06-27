export function ema(candles, period) {
  if (!candles || candles.length < period || period < 1) return []
  const result = []
  const k = 2 / (period + 1)
  let sum = 0
  for (let i = 0; i < period; i++) {
    sum += candles[i].close
  }
  let prevEma = sum / period
  result.push({ time: candles[period - 1].time, value: prevEma })
  for (let i = period; i < candles.length; i++) {
    const val = candles[i].close * k + prevEma * (1 - k)
    result.push({ time: candles[i].time, value: val })
    prevEma = val
  }
  return result
}

export function sma(candles, period) {
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

export function vwap(candles) {
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

export function atr(candles, period) {
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
    if (i <= period) {
      sum += tr
    }
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

export function supertrend(candles, factor, period) {
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

export function rsi(candles, period) {
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

export function macd(candles, fast, slow, signal) {
  if (!candles || candles.length < slow || fast < 1 || slow < 1 || signal < 1) return []
  const fastEma = ema(candles, fast)
  const slowEma = ema(candles, slow)
  const fastMap = new Map()
  for (const v of fastEma) fastMap.set(v.time, v.value)
  const macdLine = []
  for (const v of slowEma) {
    const fv = fastMap.get(v.time)
    if (fv !== undefined) {
      macdLine.push({ time: v.time, macd: fv - v.value })
    }
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

export function stochastic(candles, kPeriod, dPeriod) {
  if (!candles || candles.length < kPeriod + dPeriod - 1 || kPeriod < 1 || dPeriod < 1) return []
  const kValues = []
  for (let i = kPeriod - 1; i < candles.length; i++) {
    let high = -Infinity
    let low = Infinity
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
    if (d !== undefined) {
      result.push({ time: v.time, k: v.value, d })
    }
  }
  return result
}

export function bollingerBands(candles, period, stddev) {
  if (!candles || candles.length < period || period < 1) return []
  const result = []
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) {
      sum += candles[j].close
    }
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

export function obv(candles) {
  if (!candles || candles.length === 0) return []
  const result = [{ time: candles[0].time, value: 0 }]
  let val = 0
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) {
      val += candles[i].volume
    } else if (candles[i].close < candles[i - 1].close) {
      val -= candles[i].volume
    }
    result.push({ time: candles[i].time, value: val })
  }
  return result
}

export function volumeMa(candles, period) {
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
