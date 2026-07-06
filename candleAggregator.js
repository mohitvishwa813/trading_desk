function getMarketOpenOffset(symbol, instrumentKey) {
  const sym = (symbol || '').toUpperCase();
  const key = (instrumentKey || '').toUpperCase();
  // Crypto (24/7) -> aligns to midnight 00:00
  if (key.includes('BINANCE') || sym === 'BTCUSD') {
    return 0;
  }
  // MCX Commodities, NCDEX, and Currency (CDS) -> opens at 09:00 AM
  if (
    key.includes('MCX') ||
    key.includes('NCD') ||
    key.includes('CDS') ||
    key.includes('_CD') ||
    sym.includes('CRUDE')
  ) {
    return 9 * 3600; // 9:00 AM (32400 seconds)
  }
  // Standard Indian Equity/Index (NSE/BSE) -> opens at 09:15 AM
  return 9 * 3600 + 15 * 60; // 9:15 AM (33300 seconds)
}

function aggregateCandles(candles, tf, symbol = '', instrumentKey = '') {
  // Convert timeframe string to seconds
  const tfMap = {
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '10m': 600,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '2h': 7200,
    '4h': 14400,
    '1d': 86400,
    '1w': 86400 * 7,
    '1month': 86400 * 30
  };
  const tfSec = tfMap[tf] || 60;

  if (tfSec === 60) return candles;

  const result = [];
  let current = null;
  const marketOpen = getMarketOpenOffset(symbol, instrumentKey);

  for (const c of candles) {
    let bucket;
    if (tfSec < 86400) {
      const date = new Date(c.time * 1000);
      const midnight = Math.floor(date.setUTCHours(0, 0, 0, 0) / 1000);
      const elapsed = c.time - midnight;
      const bucketElapsed = marketOpen + Math.floor((elapsed - marketOpen) / tfSec) * tfSec;
      bucket = midnight + bucketElapsed;
    } else {
      // Daily/Weekly/Monthly: align to midnight UTC
      const date = new Date(c.time * 1000);
      bucket = Math.floor(date.setUTCHours(0, 0, 0, 0) / 1000);
    }

    if (!current || current.time !== bucket) {
      if (current) result.push(current);
      current = {
        time: bucket,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume || 0,
      };
    } else {
      current.high = Math.max(current.high, c.high);
      current.low = Math.min(current.low, c.low);
      current.close = c.close;
      current.volume += (c.volume || 0);
    }
  }

  if (current) result.push(current);
  return result;
}

module.exports = {
  aggregateCandles,
  getMarketOpenOffset
};
