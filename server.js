require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const path = require('path');
const protobuf = require('protobufjs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client', 'dist')));

const PORT = process.env.PORT || 3000;
const ACCESS_TOKEN = process.env.UPSTOX_ACCESS_TOKEN;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

// ─── WebSocket Server (browser <-> this server) ─────────────────────────────
const wss = new WebSocket.Server({ noServer: true });

let upstoxWS = null;
let demoInterval = null;
let currentMode = 'live';
const browserClients = new Set();

// Instruments map: key = display name, value = Upstox instrument key
const INSTRUMENTS = {
  'NIFTY50':    'NSE_INDEX|Nifty 50',
  'BANKNIFTY':  'NSE_INDEX|Nifty Bank',
  'RELIANCE':   'NSE_EQ|INE002A01018',
  'TCS':        'NSE_EQ|INE467B01029',
  'HDFC BANK':  'NSE_EQ|INE040A01034',
  'CRUDE OIL':  'MCX_FO|CRUDEOIL',
};

// Reverse map: instrument key -> display name
const KEY_TO_SYMBOL = {};
for (const [sym, key] of Object.entries(INSTRUMENTS)) {
  KEY_TO_SYMBOL[key] = sym;
}

// Load Upstox V3 protobuf definition
const protoRoot = protobuf.loadSync(path.join(__dirname, 'MarketDataFeed.proto'));
const FeedResponse = protoRoot.lookupType('FeedResponse');

function decodeUpstoxFeed(raw) {
  const decoded = FeedResponse.decode(raw);
  const ticks = [];
  if (!decoded.feeds) return ticks;

  for (const [instKey, feed] of Object.entries(decoded.feeds)) {
    const symbol = KEY_TO_SYMBOL[instKey];
    if (!symbol) continue;

    const ltpc = feed.ltpc || feed.fullFeed?.marketFF?.ltpc || feed.fullFeed?.indexFF?.ltpc;
    if (!ltpc) continue;

    const ohlcList = feed.fullFeed?.marketFF?.marketOHLC?.ohlc || feed.fullFeed?.indexFF?.marketOHLC?.ohlc;
    const daily = ohlcList?.find(o => o.interval === '1d');

    ticks.push({
      symbol,
      ltp: ltpc.ltp,
      timestamp: Number(decoded.currentTs || ltpc.ltt),
      open: daily ? daily.open : undefined,
      high: daily ? daily.high : undefined,
      low: daily ? daily.low : undefined,
      close: ltpc.cp,
      volume: Number(feed.fullFeed?.marketFF?.vtt || daily?.vol || 0),
      mode: 'LIVE',
    });
  }
  return ticks;
}

async function connectUpstox() {
  if (!ACCESS_TOKEN || ACCESS_TOKEN === 'YOUR_UPSTOX_ACCESS_TOKEN_HERE') {
    console.log('⚠️  No Upstox token set — running in DEMO mode');
    return;
  }

  try {
    const authResp = await axios.get('https://api.upstox.com/v3/feed/market-data-feed/authorize', {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, Accept: 'application/json' }
    });

    const wsUrl = authResp.data?.data?.authorized_redirect_uri;
    if (!wsUrl) {
      console.error('❌ Failed to get WebSocket URL:', authResp.data);
      return setTimeout(connectUpstox, 5000);
    }

    upstoxWS = new WebSocket(wsUrl);

    upstoxWS.on('open', () => {
      console.log('✅ Connected to Upstox WebSocket');
      const subMsg = {
        guid: 'dashboard-sub',
        method: 'sub',
        data: {
          mode: 'full',
          instrumentKeys: Object.values(INSTRUMENTS)
        }
      };
      upstoxWS.send(JSON.stringify(subMsg));
    });

    upstoxWS.on('message', (raw) => {
      try {
        const ticks = decodeUpstoxFeed(raw);
        for (const tick of ticks) {
          broadcast({ type: 'tick', data: tick });
        }
      } catch (e) {
        console.error('Protobuf decode error:', e.message);
      }
    });

    upstoxWS.on('close', () => {
      console.log('🔄 Upstox WS closed — reconnecting in 5s...');
      setTimeout(connectUpstox, 5000);
    });

    upstoxWS.on('error', (err) => {
      console.error('Upstox WS error:', err.message);
    });
  } catch (err) {
    console.error('❌ Upstox authorize failed:', err.message);
    setTimeout(connectUpstox, 5000);
  }
}

function broadcast(msg) {
  const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
  browserClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(str);
  });
}

// Demo mode: simulate live ticks
const demoPrices = {
  'NIFTY50':   22450,
  'BANKNIFTY': 48200,
  'RELIANCE':  2890,
  'TCS':       3750,
  'HDFC BANK': 1620,
  'CRUDE OIL': 6820,
};

function startDemo() {
  if (demoInterval) return;
  demoInterval = setInterval(() => {
    Object.keys(demoPrices).forEach(symbol => {
      const change = (Math.random() - 0.49) * demoPrices[symbol] * 0.002;
      demoPrices[symbol] = parseFloat((demoPrices[symbol] + change).toFixed(2));
      broadcast({
        type: 'tick',
        data: {
          symbol,
          ltp: demoPrices[symbol],
          open: demoPrices[symbol] * 0.998,
          high: demoPrices[symbol] * 1.005,
          low: demoPrices[symbol] * 0.995,
          close: demoPrices[symbol],
          volume: Math.floor(Math.random() * 100000),
          timestamp: Date.now(),
          mode: 'DEMO',
        },
      });
    });
  }, 1000);
}

function stopDemo() {
  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
  }
}

function generateDemoCandles(symbol) {
  const basePrices = {
    'NIFTY50': 22450, 'BANKNIFTY': 48200, 'RELIANCE': 2890,
    'TCS': 3750, 'HDFC BANK': 1620, 'CRUDE OIL': 6820,
  };
  let price = basePrices[symbol] || 22000;
  const candles = [];
  const now = Date.now();
  const fiveMonthsAgo = now - 150 * 86400000;
  const startOfDay = new Date(fiveMonthsAgo);
  startOfDay.setHours(9, 15, 0, 0);
  const marketOpen = startOfDay.getTime();
  const totalMinutes = 150 * 375;
  for (let i = totalMinutes; i >= 0; i--) {
    const change = (Math.random() - 0.49) * price * 0.0008;
    const open = price;
    const close = parseFloat((price + change).toFixed(2));
    const high = parseFloat((Math.max(open, close) * (1 + Math.random() * 0.002)).toFixed(2));
    const low = parseFloat((Math.min(open, close) * (1 - Math.random() * 0.002)).toFixed(2));
    candles.push({
      time: Math.floor((marketOpen + i * 60000) / 1000),
      open, high, low, close,
      volume: Math.floor(Math.random() * 500000),
    });
    price = close;
  }
  return candles;
}

// ─── REST Endpoints ──────────────────────────────────────────────────────────

// Send alert to Make.com
app.post('/api/alert', async (req, res) => {
  const { symbol, strategy, price, signal, message } = req.body;

  if (!MAKE_WEBHOOK_URL || MAKE_WEBHOOK_URL.includes('YOUR_WEBHOOK')) {
    return res.json({ success: false, error: 'Make.com webhook URL not configured in .env' });
  }

  try {
    await axios.post(MAKE_WEBHOOK_URL, {
      symbol,
      strategy,
      price,
      signal,      // 'BUY' or 'SELL'
      message,
      timestamp: new Date().toISOString(),
      source: 'Upstox Dashboard'
    });
    console.log(`🔔 Alert sent: ${signal} ${symbol} @ ${price}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get historical OHLC for chart init
app.get('/api/history/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const instrumentKey = INSTRUMENTS[symbol.toUpperCase()];

  const isLive = ACCESS_TOKEN && ACCESS_TOKEN !== 'YOUR_UPSTOX_ACCESS_TOKEN_HERE';

  if (currentMode === 'demo' || !isLive) {
    return res.json({ candles: generateDemoCandles(symbol), mode: 'DEMO' });
  }

  const allCandles = [];
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 5);

  let currentStart = new Date(startDate);
  while (currentStart < endDate) {
    const currentEnd = new Date(Math.min(currentStart.getTime() + 30 * 86400000, endDate.getTime()));
    const toStr = currentEnd.toISOString().split('T')[0];
    const fromStr = currentStart.toISOString().split('T')[0];

    try {
      const v2Url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/1minute/${toStr}/${fromStr}`;
      const v2Resp = await axios.get(v2Url, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, Accept: 'application/json' }
      });
      const raw = v2Resp.data?.data?.candles || [];
      allCandles.push(...raw);
    } catch (err) {
      console.error(`V2 history error for ${fromStr} to ${toStr}:`, err.message);
    }

    currentStart = new Date(currentEnd);
  }

  if (allCandles.length) {
    const seen = new Set();
    const candles = allCandles
      .map(c => ({
        time: Math.floor(new Date(c[0]).getTime() / 1000),
        open: c[1], high: c[2], low: c[3], close: c[4], volume: c[5]
      }))
      .filter(c => {
        if (seen.has(c.time)) return false;
        seen.add(c.time);
        return true;
      })
      .sort((a, b) => a.time - b.time);

    return res.json({ candles, mode: 'LIVE' });
  }

  res.json({ candles: generateDemoCandles(symbol), mode: 'DEMO' });
});

// Mode toggle
app.get('/api/mode', (req, res) => {
  res.json({ mode: currentMode });
});

app.post('/api/mode', (req, res) => {
  const { mode } = req.body;
  if (mode === 'demo') {
    currentMode = 'demo';
    startDemo();
    res.json({ mode: 'demo' });
  } else {
    currentMode = 'live';
    stopDemo();
    res.json({ mode: 'live' });
  }
});

// SPA catch-all: serve React index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

// ─── HTTP + WS Server ────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Dashboard running at http://localhost:${PORT}`);
  const isLive = ACCESS_TOKEN && ACCESS_TOKEN !== 'YOUR_UPSTOX_ACCESS_TOKEN_HERE';
  console.log(`📊 Mode: ${isLive ? 'LIVE (Upstox)' : 'DEMO (Simulated)'}\n`);
  if (isLive) connectUpstox();
});

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  browserClients.add(ws);
  console.log(`Browser connected (${browserClients.size} total)`);
  ws.on('close', () => {
    browserClients.delete(ws);
    console.log(`Browser disconnected (${browserClients.size} total)`);
  });
});
