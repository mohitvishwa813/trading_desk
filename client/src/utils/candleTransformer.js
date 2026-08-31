/**
 * candleTransformer.js
 * Converts standard OHLC candles to alternative chart types.
 */
import { atr } from './indicators'

// Heikin Ashi Transformation
export function transformHeikinAshi(candles) {
  if (!candles || candles.length === 0) return [];
  const ha = [];
  let prev = null;

  for (const c of candles) {
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = prev
      ? (prev.open + prev.close) / 2
      : (c.open + c.close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);

    const item = {
      time: c.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume || 0,
    };
    ha.push(item);
    prev = item;
  }
  return ha;
}

// Renko Bricks Transformation (TradingView & Zerodha Standard State Machine)
export function transformRenko(candles, config = 10) {
  if (!candles || candles.length === 0) return [];

  let brickSize = 10;
  if (typeof config === 'object' && config !== null) {
    if (config.method === 'atr') {
      const atrPeriod = config.atrLength || 14;
      // Zerodha Caveman Algorithm: Scope ATR calculation to the last 300 candles of dataset
      const scopeCandles = candles.length > 300 ? candles.slice(-300) : candles;
      const atrData = atr(scopeCandles, atrPeriod);

      let lastAtr = 0;
      for (let i = atrData.length - 1; i >= 0; i--) {
        if (atrData[i] && !isNaN(atrData[i].value) && atrData[i].value > 0) {
          lastAtr = atrData[i].value;
          break;
        }
      }
      if (lastAtr >= 1) {
        brickSize = Math.round(lastAtr);
      } else {
        brickSize = lastAtr > 0 ? Math.max(0.01, Math.round(lastAtr * 100) / 100) : 10;
      }
    } else {
      brickSize = Number(config.boxSize) || 10;
    }
  } else if (typeof config === 'number') {
    brickSize = config > 0 ? config : 10;
  }

  const bricks = [];
  let lastTime = 0;

  const getNextTime = (rawTime) => {
    let t = typeof rawTime === 'number' ? rawTime : (typeof rawTime === 'string' ? Math.floor(new Date(rawTime).getTime() / 1000) : 0);
    if (isNaN(t) || t === 0) t = lastTime + 1;
    t = Math.max(t, lastTime + 1);
    lastTime = t;
    return t;
  };

  // --- Formal State Machine Initialization ---
  // Grid price alignment: align start price to nearest multiple of brickSize
  const startPrice = candles[0].close;
  let pTop = Math.floor(startPrice / brickSize) * brickSize + brickSize;
  let pBottom = pTop - brickSize;
  let trend = 'UP'; // 'UP' | 'DOWN'

  for (const c of candles) {
    const pClose = c.close;

    if (trend === 'UP') {
      // 1. Upward Continuation
      if (pClose >= pTop + brickSize) {
        const n = Math.floor((pClose - pTop) / brickSize);
        for (let i = 0; i < n; i++) {
          const openPrice = pTop + i * brickSize;
          const closePrice = openPrice + brickSize;
          bricks.push({
            time: getNextTime(c.time),
            open: openPrice,
            high: closePrice,
            low: openPrice,
            close: closePrice,
            volume: c.volume || 0
          });
        }
        pTop = pTop + n * brickSize;
        pBottom = pTop - brickSize;
      }
      // 2. Downward Reversal (Must clear lower boundary by at least 1 full box)
      else if (pClose <= pBottom - brickSize) {
        trend = 'DOWN';
        const n = Math.floor((pBottom - pClose) / brickSize);
        for (let i = 0; i < n; i++) {
          const openPrice = pBottom - i * brickSize;
          const closePrice = openPrice - brickSize;
          bricks.push({
            time: getNextTime(c.time),
            open: openPrice,
            high: openPrice,
            low: closePrice,
            close: closePrice,
            volume: c.volume || 0
          });
        }
        pBottom = pBottom - n * brickSize;
        pTop = pBottom + brickSize;
      }
    } else {
      // 3. Downward Continuation
      if (pClose <= pBottom - brickSize) {
        const n = Math.floor((pBottom - pClose) / brickSize);
        for (let i = 0; i < n; i++) {
          const openPrice = pBottom - i * brickSize;
          const closePrice = openPrice - brickSize;
          bricks.push({
            time: getNextTime(c.time),
            open: openPrice,
            high: openPrice,
            low: closePrice,
            close: closePrice,
            volume: c.volume || 0
          });
        }
        pBottom = pBottom - n * brickSize;
        pTop = pBottom + brickSize;
      }
      // 4. Upward Reversal (Must clear upper boundary by at least 1 full box)
      else if (pClose >= pTop + brickSize) {
        trend = 'UP';
        const n = Math.floor((pClose - pTop) / brickSize);
        for (let i = 0; i < n; i++) {
          const openPrice = pTop + i * brickSize;
          const closePrice = openPrice + brickSize;
          bricks.push({
            time: getNextTime(c.time),
            open: openPrice,
            high: closePrice,
            low: openPrice,
            close: closePrice,
            volume: c.volume || 0
          });
        }
        pTop = pTop + n * brickSize;
        pBottom = pTop - brickSize;
      }
    }
  }

  return bricks;
}

// 3-Line Break Transformation
export function transformLineBreak(candles, lines = 3) {
  if (!candles || candles.length === 0) return [];
  const bricks = [];
  if (candles.length < lines) return candles;

  // Initialize with standard candles
  for (let i = 0; i < lines; i++) {
    bricks.push({ ...candles[i] });
  }

  for (let i = lines; i < candles.length; i++) {
    const c = candles[i];
    const price = c.close;
    
    // Get high/low of last N bricks
    const recentBricks = bricks.slice(-lines);
    const highs = recentBricks.map(b => Math.max(b.open, b.close));
    const lows = recentBricks.map(b => Math.min(b.open, b.close));
    const maxHigh = Math.max(...highs);
    const minLow = Math.min(...lows);

    const lastBrick = bricks[bricks.length - 1];
    const lastIsUp = lastBrick.close > lastBrick.open;

    if (price > maxHigh) {
      // Breakout up
      bricks.push({
        time: c.time,
        open: lastIsUp ? lastBrick.close : lastBrick.open,
        high: price,
        low: lastIsUp ? lastBrick.close : lastBrick.open,
        close: price,
        volume: c.volume || 0
      });
    } else if (price < minLow) {
      // Breakdown down
      bricks.push({
        time: c.time,
        open: lastIsUp ? lastBrick.open : lastBrick.close,
        high: lastIsUp ? lastBrick.open : lastBrick.close,
        low: price,
        close: price,
        volume: c.volume || 0
      });
    }
  }
  return bricks;
}
