/**
 * candleTransformer.js
 * Converts standard OHLC candles to alternative chart types.
 */

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

// Renko Bricks Transformation (Standard Reversal Renko)
export function transformRenko(candles, brickSize = 10) {
  if (!candles || candles.length === 0) return [];
  const bricks = [];
  
  // Set initial brick levels
  let lastClose = candles[0].close;
  let isUp = true;

  for (const c of candles) {
    const price = c.close;
    let diff = price - lastClose;

    // Upward brick continuation
    if (isUp) {
      if (diff >= brickSize) {
        const numBricks = Math.floor(diff / brickSize);
        for (let i = 0; i < numBricks; i++) {
          const nextClose = lastClose + brickSize;
          bricks.push({
            time: c.time,
            open: lastClose,
            high: nextClose,
            low: lastClose,
            close: nextClose,
            volume: c.volume || 0
          });
          lastClose = nextClose;
        }
        isUp = true;
      } else if (diff <= -2 * brickSize) {
        // Reversal downward
        const numBricks = Math.floor(Math.abs(diff) / brickSize) - 1;
        // First reversal brick (double size requirement but renders single size below)
        const firstClose = lastClose - brickSize;
        bricks.push({
          time: c.time,
          open: lastClose,
          high: lastClose,
          low: firstClose,
          close: firstClose,
          volume: c.volume || 0
        });
        lastClose = firstClose;
        isUp = false;

        // Additional downward bricks
        for (let i = 0; i < numBricks; i++) {
          const nextClose = lastClose - brickSize;
          bricks.push({
            time: c.time,
            open: lastClose,
            high: lastClose,
            low: nextClose,
            close: nextClose,
            volume: c.volume || 0
          });
          lastClose = nextClose;
        }
      }
    } else {
      // Downward brick continuation
      if (diff <= -brickSize) {
        const numBricks = Math.floor(Math.abs(diff) / brickSize);
        for (let i = 0; i < numBricks; i++) {
          const nextClose = lastClose - brickSize;
          bricks.push({
            time: c.time,
            open: lastClose,
            high: lastClose,
            low: nextClose,
            close: nextClose,
            volume: c.volume || 0
          });
          lastClose = nextClose;
        }
        isUp = false;
      } else if (diff >= 2 * brickSize) {
        // Reversal upward
        const numBricks = Math.floor(diff / brickSize) - 1;
        const firstClose = lastClose + brickSize;
        bricks.push({
          time: c.time,
          open: lastClose,
          high: firstClose,
          low: lastClose,
          close: firstClose,
          volume: c.volume || 0
        });
        lastClose = firstClose;
        isUp = true;

        // Additional upward bricks
        for (let i = 0; i < numBricks; i++) {
          const nextClose = lastClose + brickSize;
          bricks.push({
            time: c.time,
            open: lastClose,
            high: nextClose,
            low: lastClose,
            close: nextClose,
            volume: c.volume || 0
          });
          lastClose = nextClose;
        }
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
