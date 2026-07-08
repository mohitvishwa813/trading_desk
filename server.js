require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const path = require('path');
const protobuf = require('protobufjs');
const https = require('https');
const { createGunzip } = require('zlib');
const fs = require('fs');
const { aggregateCandles } = require('./candleAggregator');
const serverStrategyRunner = require('./serverStrategyRunner');

const app = express();
const cors = require('cors');
const { createClient } = require('@libsql/client');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const db = createClient({
  url: process.env.TURSO_DB_URL || 'file:local.db',
  authToken: process.env.TURSO_DB_TOKEN || 'dummy'
});

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_12345';
const MAKE_WEBHOOK_SECRET = process.env.MAKE_WEBHOOK_SECRET || 'fallback_webhook_secret_12345';

// JWT Authentication Middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
}

app.use(cors({
  origin: function (origin, callback) {
    callback(null, true);
  },
  credentials: true
}));
app.use(express.json());

const distPath = path.join(__dirname, 'client', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

const PORT = process.env.PORT || 3000;
const ACCESS_TOKEN = process.env.UPSTOX_ACCESS_TOKEN;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

// ─── WebSocket Server (browser <-> this server) ─────────────────────────────
const wss = new WebSocket.Server({ noServer: true });

let upstoxWS = null;
const browserClients = new Set();
let instrumentsLoaded = false;
let tickCount = 0;
let lastTickTime = 0;

// Dynamic instrument data from JSON (populated at startup)
const instrumentsByKey = new Map();
const instrumentsList = [];

// instrument_key → tradingsymbol (for feed decoder)
const keyToSymbol = {};

// tradingsymbol → instrument_key (for API lookups)
const symbolToKey = {};

// Set of currently subscribed instrument keys (populated by frontend)
const subscribedKeys = new Set();

// Demo mode state
let currentMode = 'live';
let demoInterval = null;

// Load Upstox V3 protobuf definition
const protoRoot = protobuf.loadSync(path.join(__dirname, 'MarketDataFeed.proto'));
const FeedResponse = protoRoot.lookupType('FeedResponse');

// ─── JSON Download & Indexing ──────────────────────────────────────────────────

const INSTRUMENT_URLS = [
  'https://assets.upstox.com/market-quote/instruments/exchange/MCX.json.gz',
  'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz'
];

function downloadGzippedJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      const gunzip = createGunzip();
      res.pipe(gunzip);
      gunzip.on('data', chunk => chunks.push(chunk));
      gunzip.on('end', () => {
        const buffer = Buffer.concat(chunks);
        try {
          const records = JSON.parse(buffer.toString('utf8'));
          resolve(records);
        } catch (parseErr) {
          reject(new Error(`JSON parse error: ${parseErr.message}`));
        }
      });
      gunzip.on('error', reject);
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function indexInstruments(records) {
  let added = 0;
  for (const rec of records) {
    const key = rec.instrument_key;
    if (!key) continue;
    if (!instrumentsByKey.has(key)) {
      const normalized = {
        instrument_key: key,
        tradingsymbol: rec.trading_symbol || key,
        name: rec.name || '',
        exchange: rec.exchange || '',
        instrument_type: rec.instrument_type || '',
        expiry: rec.expiry ? (typeof rec.expiry === 'number' ? new Date(rec.expiry).toISOString().split('T')[0] : rec.expiry) : '',
        strike: rec.strike_price || '',
        lot_size: rec.lot_size || 1,
      };
      instrumentsByKey.set(key, normalized);
      instrumentsList.push(normalized);
      const tsym = normalized.tradingsymbol;
      const cleanTsym = tsym.toUpperCase().replace(/[\s_-]/g, '');
      if (!keyToSymbol[key]) keyToSymbol[key] = tsym;
      if (!symbolToKey[tsym]) symbolToKey[tsym] = key;
      if (!symbolToKey[cleanTsym]) symbolToKey[cleanTsym] = key;
      added++;
    }
  }
  return added;
}


// Binance WebSocket Client for BTC/USDT live ticks
let binanceWS = null;
let binanceBlocked = false;

function connectBinance() {
  if (binanceBlocked) return;
  console.log('🔌 Connecting to Binance WebSocket for BTCUSDT...');
  try {
    binanceWS = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@kline_1m');

    binanceWS.on('open', () => {
      console.log('✅ Connected to Binance WebSocket for BTCUSDT');
    });

    binanceWS.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.e === 'kline') {
          const k = msg.k;
          const tick = {
            instrumentKey: 'BINANCE|BTCUSD',
            symbol: 'BTCUSD',
            ltp: parseFloat(k.c), // current close price (LTP)
            timestamp: msg.E, // event time
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v),
            mode: currentMode.toUpperCase(), // Dynamically match server's mode so it isn't filtered out
          };
          // Broadcast to all clients
          broadcast({ type: 'tick', data: tick });
        }
      } catch (e) {
        console.error('Binance decode error:', e.message);
      }
    });

    binanceWS.on('close', () => {
      if (binanceBlocked) return;
      console.log('🔄 Binance WS closed — reconnecting in 5s...');
      setTimeout(connectBinance, 5000);
    });

    binanceWS.on('error', (err) => {
      console.error('Binance WS error:', err.message);
      if (err.message && (err.message.includes('451') || err.message.includes('403') || err.message.includes('Unexpected server response'))) {
        console.warn('⚠️ Binance is restricted in this region. Falling back to Coinbase WS.');
        binanceBlocked = true;
        connectCoinbase();
      }
    });
  } catch (err) {
    console.error('Binance WS initialization failed:', err.message);
    if (err.message && (err.message.includes('451') || err.message.includes('403') || err.message.includes('Unexpected server response'))) {
      binanceBlocked = true;
      connectCoinbase();
    } else {
      setTimeout(connectBinance, 5000);
    }
  }
}

let coinbaseWS = null;
function connectCoinbase() {
  console.log('🔌 Connecting to Coinbase WebSocket for BTC-USD as fallback...');
  try {
    coinbaseWS = new WebSocket('wss://ws-feed.exchange.coinbase.com');

    coinbaseWS.on('open', () => {
      console.log('✅ Connected to Coinbase WebSocket for BTC-USD fallback');
      const sub = {
        type: 'subscribe',
        product_ids: ['BTC-USD'],
        channels: ['ticker']
      };
      coinbaseWS.send(JSON.stringify(sub));
    });

    coinbaseWS.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'ticker' && msg.price) {
          const price = parseFloat(msg.price);
          const tick = {
            instrumentKey: 'BINANCE|BTCUSD',
            symbol: 'BTCUSD',
            ltp: price,
            timestamp: msg.time ? new Date(msg.time).getTime() : Date.now(),
            open: parseFloat(msg.open_24h || price),
            high: parseFloat(msg.high_24h || price),
            low: parseFloat(msg.low_24h || price),
            close: parseFloat(msg.open_24h || price),
            volume: parseFloat(msg.volume_24h || 0),
            mode: currentMode.toUpperCase(),
          };
          broadcast({ type: 'tick', data: tick });
        }
      } catch (e) {
        console.error('Coinbase decode error:', e.message);
      }
    });

    coinbaseWS.on('close', () => {
      console.log('🔄 Coinbase WS closed — reconnecting in 5s...');
      setTimeout(connectCoinbase, 5000);
    });

    coinbaseWS.on('error', (err) => {
      console.error('Coinbase WS error:', err.message);
    });
  } catch (err) {
    console.error('Coinbase WS initialization failed:', err.message);
    setTimeout(connectCoinbase, 5000);
  }
}

async function loadInstruments() {
  for (const url of INSTRUMENT_URLS) {
    try {
      console.log(`📥 Downloading instruments from ${url.split('/').pop()}...`);
      const records = await downloadGzippedJSON(url);
      const count = indexInstruments(records);
      console.log(`   ✓ ${count} instruments indexed`);
    } catch (err) {
      console.warn(`⚠️  Failed to download/parse ${url}: ${err.message}`);
    }
  }

  // Inject BTCUSD as a custom instrument
  const btcInstrument = {
    instrument_key: 'BINANCE|BTCUSD',
    tradingsymbol: 'BTCUSD',
    name: 'Bitcoin / US Dollar (Binance Live)',
    exchange: 'BINANCE',
    instrument_type: 'CRYPTO',
    expiry: '',
    strike: '',
    lot_size: 1,
  };
  instrumentsByKey.set(btcInstrument.instrument_key, btcInstrument);
  instrumentsList.push(btcInstrument);
  keyToSymbol[btcInstrument.instrument_key] = btcInstrument.tradingsymbol;
  symbolToKey[btcInstrument.tradingsymbol] = btcInstrument.instrument_key;

  instrumentsLoaded = true;
  console.log(`\n📊 Total instruments indexed: ${instrumentsByKey.size}\n`);

  // Dynamically resolve the active MCX Crude Oil futures contract key
  const activeCrudeKey = (() => {
    const mcxCrude = instrumentsList.filter(inst => 
      inst.exchange && inst.exchange.toUpperCase().startsWith('MCX') && 
      inst.instrument_type && inst.instrument_type.toUpperCase() === 'FUT' &&
      inst.tradingsymbol && inst.tradingsymbol.toUpperCase().startsWith('CRUDEOIL FUT')
    );
    if (mcxCrude.length === 0) return 'MCX_FO|CRUDEOIL';
    mcxCrude.sort((a, b) => {
      if (!a.expiry) return 1;
      if (!b.expiry) return -1;
      return new Date(a.expiry) - new Date(b.expiry);
    });
    return mcxCrude[0].instrument_key;
  })();

  if (activeCrudeKey && activeCrudeKey !== 'MCX_FO|CRUDEOIL') {
    console.log(`🛢️ Dynamically resolved active Crude Oil contract: ${activeCrudeKey}`);
    symbolToKey['CRUDEOIL'] = activeCrudeKey;
    keyToSymbol[activeCrudeKey] = 'CRUDEOIL';
    const crudeInst = INSTRUMENTS.find(i => i.symbol === 'CRUDEOIL');
    if (crudeInst) crudeInst.key = activeCrudeKey;
  }
  // If in demo mode, restart ticks so symbol names resolve to real trading symbols
  if (currentMode === 'demo') {
    startDemoTicks();
  }
  // Flush any pending subscriptions now that keyToSymbol is populated
  sendUpstoxSubscription();
  
  // Start Binance connection for BTCUSD
  connectBinance();
}

// Start loading instruments asynchronously (server can start before JSON loads)
loadInstruments();

// ─── Upstox Feed Decoder & WebSocket Helpers ─────────────────────────────────

function decodeUpstoxFeed(raw) {
  const decoded = FeedResponse.decode(raw);
  const ticks = [];
  if (!decoded.feeds) return ticks;

  for (const [instKey, feed] of Object.entries(decoded.feeds)) {
    const symbol = keyToSymbol[instKey];
    if (!symbol) continue;

    const ltpc = feed.ltpc || feed.fullFeed?.marketFF?.ltpc || feed.fullFeed?.indexFF?.ltpc || feed.firstLevelWithGreeks?.ltpc;
    const marketFF = feed.fullFeed?.marketFF;
    const flwg = feed.firstLevelWithGreeks;
    const greeks = marketFF?.optionGreeks || flwg?.optionGreeks;
    // Skip only if there's no LTP AND no Greeks
    if (!ltpc && !greeks) continue;

    const ohlcList = feed.fullFeed?.marketFF?.marketOHLC?.ohlc || feed.fullFeed?.indexFF?.marketOHLC?.ohlc;
    const daily = ohlcList?.find(o => o.interval === '1d');
    const src = marketFF || flwg || {};

    ticks.push({
      instrumentKey: instKey,
      symbol,
      ltp: ltpc ? ltpc.ltp : 0,
      timestamp: Number(decoded.currentTs || ltpc?.ltt || Date.now()),
      open: daily ? daily.open : undefined,
      high: daily ? daily.high : undefined,
      low: daily ? daily.low : undefined,
      close: ltpc ? ltpc.cp : undefined,
      volume: Number(src.vtt || daily?.vol || 0),
      oi: src.oi != null ? src.oi : undefined,
      iv: src.iv != null ? src.iv : undefined,
      greeks: greeks ? {
        delta: greeks.delta,
        gamma: greeks.gamma,
        theta: greeks.theta,
        vega: greeks.vega,
      } : undefined,
      mode: 'LIVE',
    });
  }
  return ticks;
}

function isOptionKey(key) {
  const inst = instrumentsByKey.get(key);
  if (inst) {
    const type = (inst.instrument_type || '').toUpperCase();
    return type === 'CE' || type === 'PE';
  }
  // Fallback for keys not yet indexed — only match explicit OPT segment, not FO (futures)
  return /_OPT\|/.test(key);
}

function sendUpstoxSubscription() {
  if (!upstoxWS || upstoxWS.readyState !== WebSocket.OPEN) return;
  if (!instrumentsLoaded) {
    // Wait for instrument JSON to load before subscribing (keyToSymbol must be populated)
    setTimeout(sendUpstoxSubscription, 2000);
    return;
  }
  const keys = Array.from(subscribedKeys);
  if (keys.length === 0) return;
  const optKeys = keys.filter(isOptionKey);
  const regKeys = keys.filter(k => !isOptionKey(k));
  if (regKeys.length > 0) {
    const msg = Buffer.from(JSON.stringify({
      guid: 'dashboard-sub',
      method: 'sub',
      data: { mode: 'full', instrumentKeys: regKeys },
    }));
    console.log(`📡 Sending sub: ${regKeys.length} regular — first key: ${regKeys[0]}`);
    upstoxWS.send(msg);
  }
  if (optKeys.length > 0) {
    // Batch option keys in chunks of 100 (Upstox limit)
    const CHUNK = 100;
    for (let i = 0; i < optKeys.length; i += CHUNK) {
      const chunk = optKeys.slice(i, i + CHUNK);
      const msg = Buffer.from(JSON.stringify({
        guid: 'dashboard-sub-opt',
        method: 'sub',
        data: { mode: 'option_greeks', instrumentKeys: chunk },
      }));
      console.log(`📡 Sending sub: ${chunk.length} options (batch ${Math.floor(i/CHUNK)+1}) — first key: ${chunk[0]}`);
      upstoxWS.send(msg);
    }
  }
}

async function connectUpstox() {
  if (!ACCESS_TOKEN || ACCESS_TOKEN === 'YOUR_UPSTOX_ACCESS_TOKEN_HERE') {
    console.log('⚠️  No Upstox token set — configure .env to fetch live data');
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
    console.log(`🔌 WS URL: ${wsUrl.slice(0, 80)}...`);

    upstoxWS = new WebSocket(wsUrl, {
      followRedirects: true,
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`
      }
    });

    upstoxWS.on('open', () => {
      console.log('✅ Connected to Upstox WebSocket');
      // Wait 1s before subscribing (per Upstox official Node.js example)
      setTimeout(sendUpstoxSubscription, 1000);
    });

    upstoxWS.on('message', (raw) => {
      try {
        const decoded = FeedResponse.decode(raw);
        if (decoded.marketInfo) {
          const statuses = Object.entries(decoded.marketInfo.segmentStatus || {}).map(([k,v]) => `${k}=${['PRE_OPEN','PRE_OPEN_END','NORMAL_OPEN','NORMAL_CLOSE','CLOSING_START','CLOSING_END'][v]||v}`);
          console.log(`📊 Market status: ${statuses.join(', ') || 'none'}`);
        }
        const feedCount = decoded.feeds ? Object.keys(decoded.feeds).length : 0;
        if (feedCount > 0) {
          const ticks = decodeUpstoxFeed(raw);
          for (const tick of ticks) {
            broadcast({ type: 'tick', data: tick });
            tickCount++;
            lastTickTime = Date.now();
          }
        }
      } catch (e) {
        console.error('Protobuf decode error:', e.message);
      }
    });

    upstoxWS.on('close', () => {
      console.log('🔄 Upstox WS closed — reconnecting in 5s...');
      clearInterval(tickHeartbeat);
      setTimeout(connectUpstox, 5000);
    });

    // Periodic heartbeat to show live data is flowing
    let lastCount = tickCount;
    const tickHeartbeat = setInterval(() => {
      const now = tickCount;
      const rate = now - lastCount;
      lastCount = now;
      if (rate > 0 || Date.now() - lastTickTime < 10000) {
        console.log(`💓 Ticks: ${now} total (${rate}/30s), last: ${lastTickTime ? new Date(lastTickTime).toLocaleTimeString() : 'never'}`);
      }
    }, 30000);

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

// ─── REST Endpoints ──────────────────────────────────────────────────────────

// Send alert to Make.com
app.post('/api/alert', authenticateToken, async (req, res) => {
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

// Get historical alerts from DB or alerts.json
app.get('/api/alerts', authenticateToken, async (req, res) => {
  const alertsPath = path.join(__dirname, 'alerts.json');
  if (fs.existsSync(alertsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
      const mapped = data.map(item => ({
        signal: item.level ? item.level.toUpperCase() : 'INFO',
        symbol: item.strategyName,
        message: item.message,
        tradeId: item.tradeId || null,
        timestamp: new Date(item.time * 1000).toISOString()
      }));
      return res.json(mapped);
    } catch (e) {
      // fallback to DB if file reading fails
    }
  }

  try {
    const result = await db.execute({
      sql: 'SELECT symbol, message, price, trade_id, created_at FROM alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      args: [req.user.id]
    });
    const mapped = result.rows.map(row => {
      const msgLower = row.message.toLowerCase();
      let signal = 'INFO';
      if (msgLower.includes('buy')) signal = 'BUY';
      else if (msgLower.includes('sell')) signal = 'SELL';
      else if (msgLower.includes('sl') || msgLower.includes('stop loss')) signal = 'SELL';
      else if (msgLower.includes('tp') || msgLower.includes('target')) signal = 'BUY';
      
      const hasPrice = row.message.includes('₹') || row.message.includes('@ ');
      return {
        signal,
        symbol: row.symbol,
        message: hasPrice ? row.message : `${row.message} @ ${row.price}`,
        tradeId: row.trade_id || null,
        timestamp: row.created_at
      };
    });
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/alerts/trigger - forward alert to webhook and store in alerts.json
app.post('/api/alerts/trigger', authenticateToken, async (req, res) => {
  const { id, message, level, time, price, strategyName, tradeId, webhook } = req.body || {};
  
  const alertObj = {
    id: id || `alert_${Date.now()}`,
    message: message || '',
    level: level || 'info',
    time: time || Math.floor(Date.now() / 1000),
    price: price || 0,
    strategyName: strategyName || 'Default Strategy',
    tradeId: tradeId || null,
    triggered: true
  };

  try {
    // 1. Save to database alerts table
    await db.execute({
      sql: 'INSERT INTO alerts (id, user_id, symbol, message, price, trade_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [
        alertObj.id,
        req.user.id,
        strategyName || 'Unknown',
        alertObj.message,
        alertObj.price,
        alertObj.tradeId,
        new Date(alertObj.time * 1000).toISOString()
      ]
    });

    // 2. Append to alerts.json file on the server
    const alertsPath = path.join(__dirname, 'alerts.json');
    let existingAlerts = [];
    if (fs.existsSync(alertsPath)) {
      try {
        existingAlerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
      } catch (e) {
        existingAlerts = [];
      }
    }
    existingAlerts.unshift(alertObj);
    if (existingAlerts.length > 500) {
      existingAlerts = existingAlerts.slice(0, 500);
    }
    fs.writeFileSync(alertsPath, JSON.stringify(existingAlerts, null, 2), 'utf8');

    // 3. Forward to external webhook if provided
    const targetWebhook = webhook || process.env.DISCORD_TELEGRAM_WEBHOOK_URL;
    if (targetWebhook && targetWebhook.startsWith('http')) {
      axios.post(targetWebhook, { content: `[${alertObj.level.toUpperCase()}] ${alertObj.strategyName}: ${alertObj.message}` })
        .catch(err => console.error('Webhook forward failed:', err.message));
    }

    res.json({ success: true, alert: alertObj });
  } catch (err) {
    console.error('Trigger alert error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/paper/trades - Fetch paper trade logs
app.get('/api/paper/trades', authenticateToken, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM paper_trades WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      args: [req.user.id]
    });
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/paper/orders - Place a new paper trade order
app.post('/api/paper/orders', authenticateToken, async (req, res) => {
  const { symbol, direction, qty, price, comment } = req.body || {};
  if (!symbol || !direction || !qty || !price) {
    return res.status(400).json({ error: 'Missing symbol, direction, qty, or price' });
  }

  try {
    const oppDir = direction.toUpperCase() === 'BUY' ? 'SELL' : 'BUY';
    const openResult = await db.execute({
      sql: 'SELECT * FROM paper_trades WHERE user_id = ? AND symbol = ? AND direction = ? AND status = ? ORDER BY created_at ASC LIMIT 1',
      args: [req.user.id, symbol, oppDir, 'OPEN']
    });

    let assignedTradeId = `pt_${Date.now()}`;

    if (openResult.rows.length > 0) {
      const activeTrade = openResult.rows[0];
      assignedTradeId = activeTrade.id;
      const oldPrice = activeTrade.price;
      const newPrice = price;
      const closedQty = Math.min(qty, activeTrade.qty);
      let tradePnl = 0;

      if (activeTrade.direction === 'BUY') {
        tradePnl = (newPrice - oldPrice) * closedQty;
      } else {
        tradePnl = (oldPrice - newPrice) * closedQty;
      }

      if (qty >= activeTrade.qty) {
        // Close full trade
        await db.execute({
          sql: 'UPDATE paper_trades SET status = ?, pnl = ?, closed_at = ?, comment = ? WHERE id = ?',
          args: ['CLOSED', tradePnl, new Date().toISOString(), comment || 'Closed by opposite order', activeTrade.id]
        });

        if (qty > activeTrade.qty) {
          // Open remainder position
          const remainder = qty - activeTrade.qty;
          const remainderId = `pt_${Date.now()}`;
          await db.execute({
            sql: 'INSERT INTO paper_trades (id, user_id, symbol, direction, qty, price, status, created_at, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            args: [remainderId, req.user.id, symbol, direction.toUpperCase(), remainder, price, 'OPEN', new Date().toISOString(), 'Remainder position']
          });
        }
      } else {
        // Partial close
        const remainingQty = activeTrade.qty - qty;
        await db.execute({
          sql: 'UPDATE paper_trades SET qty = ? WHERE id = ?',
          args: [remainingQty, activeTrade.id]
        });

        const closedId = `pt_partial_${Date.now()}`;
        await db.execute({
          sql: 'INSERT INTO paper_trades (id, user_id, symbol, direction, qty, price, status, pnl, created_at, closed_at, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          args: [closedId, req.user.id, symbol, activeTrade.direction, qty, activeTrade.price, 'CLOSED', tradePnl, activeTrade.created_at, new Date().toISOString(), 'Partially closed']
        });
      }
    } else {
      // Open new position
      await db.execute({
        sql: 'INSERT INTO paper_trades (id, user_id, symbol, direction, qty, price, status, created_at, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [assignedTradeId, req.user.id, symbol, direction.toUpperCase(), qty, price, 'OPEN', new Date().toISOString(), comment || 'Open position']
      });
    }

    // Log corresponding alert
    const alertId = `a_pt_${Date.now()}`;
    const alertMsg = `[Paper ${direction.toUpperCase()}] ${qty} units of ${symbol} at ₹${price}`;
    await db.execute({
      sql: 'INSERT INTO alerts (id, user_id, symbol, message, price, trade_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [alertId, req.user.id, symbol, alertMsg, price, assignedTradeId, new Date().toISOString()]
    });

    res.json({ success: true, tradeId: assignedTradeId });
  } catch (err) {
    console.error('Order placement error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Server-Side Auto Trade API Endpoints ────────────────────────────────────

// POST /api/autotrade/start - Start auto trade session
app.post('/api/autotrade/start', authenticateToken, async (req, res) => {
  const { strategyId, symbol, qty, timeframe, mode, startTime, endTime, candleStyle } = req.body || {};
  if (!strategyId || !symbol || !qty || !timeframe || !mode) {
    return res.status(400).json({ error: 'Missing required parameters to start auto trade' });
  }

  try {
    const id = `session_${Date.now()}`;
    // Deactivate previous active configurations
    await db.execute({
      sql: 'UPDATE auto_trades SET active = 0, stopped_at = ? WHERE user_id = ? AND active = 1',
      args: [new Date().toISOString(), req.user.id]
    });

    // Insert new persistent configuration
    await db.execute({
      sql: 'INSERT INTO auto_trades (id, user_id, strategy_id, symbol, qty, timeframe, mode, start_time, end_time, candle_style, active, last_signal_time, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, ?)',
      args: [
        id,
        req.user.id,
        strategyId,
        symbol,
        qty,
        timeframe,
        mode,
        startTime || '09:15',
        endTime || '15:30',
        candleStyle || 'candles',
        new Date().toISOString()
      ]
    });

    // Log corresponding alert
    const alertId = `a_at_start_${Date.now()}`;
    const alertMsg = `[Auto Trade Active] Monitoring ${symbol} on ${timeframe} with ${mode} execution.`;
    await db.execute({
      sql: 'INSERT INTO alerts (id, user_id, symbol, message, price, trade_id, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      args: [alertId, req.user.id, symbol, alertMsg, id, new Date().toISOString()]
    });

    res.json({ success: true, sessionId: id });
  } catch (err) {
    console.error('AutoTrade start error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/autotrade/stop - Stop auto trade session
app.post('/api/autotrade/stop', authenticateToken, async (req, res) => {
  try {
    const activeResult = await db.execute({
      sql: 'SELECT * FROM auto_trades WHERE user_id = ? AND active = 1 LIMIT 1',
      args: [req.user.id]
    });

    if (activeResult.rows.length === 0) {
      return res.json({ success: true, message: 'No active session to stop' });
    }

    const session = activeResult.rows[0];
    const stoppedAt = new Date().toISOString();

    await db.execute({
      sql: 'UPDATE auto_trades SET active = 0, stopped_at = ? WHERE id = ?',
      args: [stoppedAt, session.id]
    });

    // Log corresponding stopped alert
    const alertId = `a_at_stop_${Date.now()}`;
    const alertMsg = `[Auto Trade Stopped] Trading sequence deactivated.`;
    await db.execute({
      sql: 'INSERT INTO alerts (id, user_id, symbol, message, price, trade_id, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      args: [alertId, req.user.id, session.symbol, alertMsg, session.id, stoppedAt]
    });

    res.json({ success: true, sessionId: session.id });
  } catch (err) {
    console.error('AutoTrade stop error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/autotrade/status - Get current active auto trade session
app.get('/api/autotrade/status', authenticateToken, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM auto_trades WHERE user_id = ? AND active = 1 LIMIT 1',
      args: [req.user.id]
    });

    if (result.rows.length === 0) {
      return res.json({ active: false });
    }

    const session = result.rows[0];
    res.json({
      active: true,
      sessionId: session.id,
      strategyId: session.strategy_id,
      symbol: session.symbol,
      qty: session.qty,
      timeframe: session.timeframe,
      mode: session.mode,
      startTime: session.start_time,
      endTime: session.end_time,
      candleStyle: session.candle_style
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Server-Side Persistent Auto-Trading Engine ──────────────────────────────

// Helper to resolve symbol to instrument key with fuzzy fallback for various text formats
function resolveSymbolToKey(symbol) {
  if (!symbol) return '';
  let cleanSymbol = symbol.toUpperCase().replace(/[\s_-]/g, '');
  if (cleanSymbol === 'NIFTY50') cleanSymbol = 'NIFTY';
  if (cleanSymbol === 'STATEBANK' || cleanSymbol === 'STATEBANKOFINDIA') cleanSymbol = 'SBIN';

  // 1. Try exact lookup in symbolToKey dictionary
  let key = symbolToKey[cleanSymbol] || symbolToKey[symbol.toUpperCase()];
  if (key) return key;

  // 2. Try match by cleaning and comparing
  for (const inst of instrumentsList) {
    const cleanInstTsym = inst.tradingsymbol.toUpperCase().replace(/[\s_-]/g, '');
    if (cleanInstTsym === cleanSymbol) {
      return inst.instrument_key;
    }
  }

  // 3. Try to resolve MCX/NSE spaces format to trading symbol format
  // Format A: "BASE FUT DD MMM YY" -> e.g. "CRUDEOILM FUT 20 JUL 26"
  const futMatchA = symbol.match(/([A-Z0-9]+)\s+FUT\s+(\d+)\s+([A-Z]+)\s+(\d+)/i);
  if (futMatchA) {
    const [_, base, day, month, year] = futMatchA;
    const parsedTsym = `${base.toUpperCase()}${day}${month.toUpperCase()}${year}FUT`;
    const found = instrumentsList.find(inst => inst.tradingsymbol.toUpperCase() === parsedTsym);
    if (found) return found.instrument_key;
  }

  // Format B: "BASE DD MMM YY FUT" -> e.g. "CRUDEOILM 20 JUL 26 FUT"
  const futMatchB = symbol.match(/([A-Z0-9]+)\s+(\d+)\s+([A-Z]+)\s+(\d+)\s+FUT/i);
  if (futMatchB) {
    const [_, base, day, month, year] = futMatchB;
    const parsedTsym = `${base.toUpperCase()}${day}${month.toUpperCase()}${year}FUT`;
    const found = instrumentsList.find(inst => inst.tradingsymbol.toUpperCase() === parsedTsym);
    if (found) return found.instrument_key;
  }

  return symbol;
}

// Helper function to fetch candles internally matching endpoint logic
async function fetchCandlesInternal(symbol, tf) {
  const instrumentKey = resolveSymbolToKey(symbol);

  const getCoinbaseGranularity = (tframe) => {
    switch (tframe) {
      case '1m': return 60;
      case '3m': return 60;
      case '5m': return 300;
      case '10m': return 300;
      case '15m': return 900;
      case '30m': return 1800;
      case '1h': return 3600;
      case '2h': return 3600;
      case '4h': return 3600;
      case '1d': return 86400;
      default: return 60;
    }
  };

  // BTCUSD Binance / Coinbase fallback
  if (symbol.toUpperCase() === 'BTCUSD' || instrumentKey === 'BINANCE|BTCUSD') {
    try {
      const bInterval = getBinanceInterval(tf);
      const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${bInterval}&limit=1000`;
      const resp = await axios.get(binanceUrl);
      return resp.data.map(c => ({
        time: Math.floor(c[0] / 1000),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5])
      }));
    } catch (err) {
      try {
        const granularity = getCoinbaseGranularity(tf);
        const coinbaseUrl = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=${granularity}`;
        const resp = await axios.get(coinbaseUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        return resp.data.map(c => ({
          time: c[0],
          low: c[1],
          high: c[2],
          open: c[3],
          close: c[4],
          volume: c[5]
        })).sort((a, b) => a.time - b.time);
      } catch (cbErr) {
        console.error('fetchCandlesInternal BTC fallback failed:', cbErr.message);
        return [];
      }
    }
  }

  if (!ACCESS_TOKEN || ACCESS_TOKEN === 'YOUR_UPSTOX_ACCESS_TOKEN_HERE') {
    return [];
  }

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const allCandles = [];
    let currentStart = new Date(startDate);

    while (currentStart < endDate) {
      const currentEnd = new Date(Math.min(currentStart.getTime() + 30 * 86400000, endDate.getTime()));
      const toStr = currentEnd.toISOString().split('T')[0];
      const fromStr = currentStart.toISOString().split('T')[0];

      try {
        const v3Url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/1minute/${toStr}/${fromStr}`;
        const v3Resp = await axios.get(v3Url, {
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, Accept: 'application/json' }
        });
        allCandles.push(...(v3Resp.data?.data?.candles || []));
      } catch (v3Err) {
        try {
          const v2Url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/1minute/${toStr}/${fromStr}`;
          const v2Resp = await axios.get(v2Url, {
            headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, Accept: 'application/json' }
          });
          allCandles.push(...(v2Resp.data?.data?.candles || []));
        } catch (v2Err) {
          // silent error
        }
      }
      currentStart = new Date(currentEnd);
    }

    try {
      const intradayUrl = `https://api.upstox.com/v2/historical-candle/intraday/${encodeURIComponent(instrumentKey)}/1minute`;
      const intraResp = await axios.get(intradayUrl, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, Accept: 'application/json' }
      });
      allCandles.push(...(intraResp.data?.data?.candles || []));
    } catch (intraErr) {}

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

      return aggregateCandles(candles, tf, symbol, instrumentKey);
    }
  } catch (err) {
    console.error('fetchCandlesInternal Upstox failed:', err.message);
  }
  return [];
}

// Map to track the active trade ID per auto trade session (for alert grouping)
const sessionActiveTrades = {};
// Map to track the last executed signal in-memory (time & type) per session to prevent duplicates
const sessionExecutedSignals = {};

function convertToHeikinAshi(candles) {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  const haCandles = [];
  let prevOpen = candles[0].open;
  let prevClose = candles[0].close;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevOpen + prevClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);

    haCandles.push({
      time: c.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume
    });

    prevOpen = haOpen;
    prevClose = haClose;
  }
  return haCandles;
}

// Background auto trade processing loop
async function processAutoTrades() {
  try {
    const activeResult = await db.execute('SELECT * FROM auto_trades WHERE active = 1');
    if (activeResult.rows.length === 0) return;

    for (const session of activeResult.rows) {
      // 1. Time Window check (always evaluate in Indian Standard Time timezone)
      const nowInIst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      const hours = String(nowInIst.getHours()).padStart(2, '0');
      const minutes = String(nowInIst.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${hours}:${minutes}`;

      if (currentTimeStr < session.start_time || currentTimeStr > session.end_time) {
        continue; // skip
      }

      // 2. Fetch strategy details
      const stratResult = await db.execute({
        sql: 'SELECT code, name FROM strategies WHERE id = ?',
        args: [session.strategy_id]
      });
      if (stratResult.rows.length === 0) continue;
      const strat = stratResult.rows[0];

      // 3. Fetch history candles
      let candles = await fetchCandlesInternal(session.symbol, session.timeframe);
      if (!Array.isArray(candles) || candles.length === 0) continue;

      if (session.candle_style === 'heikin_ashi') {
        candles = convertToHeikinAshi(candles);
      }

      // 4. Run strategy code on server
      const result = serverStrategyRunner.run(candles, strat.code);

      // 5. Initialize session tracker in memory if not present
      if (!sessionExecutedSignals[session.id]) {
        sessionExecutedSignals[session.id] = {
          lastTime: session.last_signal_time || 0,
          executedTypes: new Set()
        };
      }

      const tracker = sessionExecutedSignals[session.id];
      // Ensure executedTypes is a Set (handles migration in case it was a legacy object)
      if (!(tracker.executedTypes instanceof Set)) {
        tracker.executedTypes = new Set();
      }

      // 6. Find all fresh, un-executed signals chronologically
      if (result.signals && result.signals.length > 0) {
        const lastCandleTime = candles[candles.length - 1].time;

        const pendingSignals = result.signals.filter(sig => {
          // A. Signal must be fresh (within 2 minutes of the last candle time)
          if (sig.time < lastCandleTime - 120) return false;
          // B. Signal time must be greater than or equal to last executed time
          if (sig.time < tracker.lastTime) return false;
          // C. If signal matches the last executed time, the type must not have been executed yet
          if (sig.time === tracker.lastTime && tracker.executedTypes.has(sig.type.toUpperCase())) return false;
          return true;
        });

        for (const sig of pendingSignals) {
          const side = sig.type.toUpperCase();
          const executionPrice = sig.price || candles[candles.length - 1].close;

          console.log(`[Server AutoTrade] Triggering ${side} signal for ${session.symbol} in session ${session.id}`);

          // Track or generate trade ID for grouping
          let assignedTradeId = sessionActiveTrades[session.id];
          if (!assignedTradeId) {
            assignedTradeId = `tr_${Date.now()}`;
            sessionActiveTrades[session.id] = assignedTradeId;
          }

          const isCloseSignal = side === 'CLOSE' || side === 'EXIT';

          if (session.mode === 'PAPER') {
            // Find active open position to close
            const openResult = await db.execute({
              sql: isCloseSignal 
                ? 'SELECT * FROM paper_trades WHERE user_id = ? AND symbol = ? AND status = ? ORDER BY created_at ASC LIMIT 1'
                : 'SELECT * FROM paper_trades WHERE user_id = ? AND symbol = ? AND direction = ? AND status = ? ORDER BY created_at ASC LIMIT 1',
              args: isCloseSignal
                ? [session.user_id, session.symbol, 'OPEN']
                : [session.user_id, session.symbol, side === 'BUY' ? 'SELL' : 'BUY', 'OPEN']
            });

            if (openResult.rows.length > 0) {
              const activeTrade = openResult.rows[0];
              assignedTradeId = activeTrade.id;
              const oldPrice = activeTrade.price;
              const closedQty = Math.min(session.qty, activeTrade.qty);
              let tradePnl = activeTrade.direction === 'BUY' ? (executionPrice - oldPrice) * closedQty : (oldPrice - executionPrice) * closedQty;

              if (session.qty >= activeTrade.qty) {
                await db.execute({
                  sql: 'UPDATE paper_trades SET status = ?, pnl = ?, closed_at = ?, comment = ? WHERE id = ?',
                  args: ['CLOSED', tradePnl, new Date().toISOString(), `Auto Trade closed via: ${strat.name}`, activeTrade.id]
                });

                if (session.qty > activeTrade.qty) {
                  const remainder = session.qty - activeTrade.qty;
                  const remainderId = `pt_${Date.now()}`;
                  sessionActiveTrades[session.id] = remainderId; // new trade group for remainder
                  await db.execute({
                    sql: 'INSERT INTO paper_trades (id, user_id, symbol, direction, qty, price, status, created_at, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    args: [remainderId, session.user_id, session.symbol, side, remainder, executionPrice, 'OPEN', new Date().toISOString(), 'Remainder position']
                  });
                } else {
                  delete sessionActiveTrades[session.id]; // position fully closed
                }
              } else {
                const remainingQty = activeTrade.qty - session.qty;
                await db.execute({
                  sql: 'UPDATE paper_trades SET qty = ? WHERE id = ?',
                  args: [remainingQty, activeTrade.id]
                });

                const closedId = `pt_partial_${Date.now()}`;
                await db.execute({
                  sql: 'INSERT INTO paper_trades (id, user_id, symbol, direction, qty, price, status, pnl, created_at, closed_at, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                  args: [closedId, session.user_id, session.symbol, activeTrade.direction, session.qty, activeTrade.price, 'CLOSED', tradePnl, activeTrade.created_at, new Date().toISOString(), 'Partially closed']
                });
              }

              // Log corresponding close alert
              const alertId = `a_pt_${Date.now()}`;
              const displaySide = `CLOSE_${activeTrade.direction}`;
              const alertMsg = `[Paper ${displaySide}] ${closedQty} ${session.symbol} @ ₹${executionPrice.toFixed(2)} — ${strat.name}`;
              await db.execute({
                sql: 'INSERT INTO alerts (id, user_id, symbol, message, price, trade_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                args: [alertId, session.user_id, session.symbol, alertMsg, executionPrice, assignedTradeId, new Date().toISOString()]
              });
            } else if (!isCloseSignal) {
              // Open new position (only if it is a BUY/SELL signal)
              const newPositionId = `pt_${Date.now()}`;
              assignedTradeId = newPositionId;
              sessionActiveTrades[session.id] = newPositionId;

              await db.execute({
                sql: 'INSERT INTO paper_trades (id, user_id, symbol, direction, qty, price, status, created_at, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                args: [newPositionId, session.user_id, session.symbol, side, session.qty, executionPrice, 'OPEN', new Date().toISOString(), `Auto Trade opened via: ${strat.name}`]
              });

              // Log corresponding entry alert
              const alertId = `a_pt_${Date.now()}`;
              const alertMsg = `[Paper ${side}] ${session.qty} ${session.symbol} @ ₹${executionPrice.toFixed(2)} — ${strat.name}`;
              await db.execute({
                sql: 'INSERT INTO alerts (id, user_id, symbol, message, price, trade_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                args: [alertId, session.user_id, session.symbol, alertMsg, executionPrice, assignedTradeId, new Date().toISOString()]
              });
            }
          } else {
            // Live webhook
            const targetWebhook = process.env.DISCORD_TELEGRAM_WEBHOOK_URL || MAKE_WEBHOOK_URL;
            const alertMsg = `[Live ${side}] ${session.qty} ${session.symbol} @ ₹${executionPrice.toFixed(2)} — ${strat.name}`;

            if (targetWebhook && targetWebhook.startsWith('http')) {
              await axios.post(targetWebhook, { content: `[LIVE AUTO] ${strat.name}: ${alertMsg}` })
                .catch(err => console.error('Discord/Telegram webhook failed:', err.message));
            }

            const alertId = `a_live_${Date.now()}`;
            await db.execute({
              sql: 'INSERT INTO alerts (id, user_id, symbol, message, price, trade_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
              args: [alertId, session.user_id, session.symbol, alertMsg, executionPrice, assignedTradeId, new Date().toISOString()]
            });

            if (isCloseSignal) {
              delete sessionActiveTrades[session.id];
            }
          }

          // Update execution state in memory and DB
          if (sig.time > tracker.lastTime) {
            tracker.lastTime = sig.time;
            tracker.executedTypes.clear(); // Clear types for a new candle time
          }
          tracker.executedTypes.add(sig.type.toUpperCase());

          await db.execute({
            sql: 'UPDATE auto_trades SET last_signal_time = ? WHERE id = ?',
            args: [sig.time, session.id]
          });
        }

        // Broadcast update to all client UI instances if we processed any new signals
        if (pendingSignals.length > 0) {
          const updateMsg = JSON.stringify({ type: 'autotrade_update', symbol: session.symbol });
          for (const client of browserClients) {
            if (client.readyState === WebSocket.OPEN) {
              client.send(updateMsg);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Error in processAutoTrades:', err.message);
  }
}

// Start Background Engine Loop (runs every 15 seconds)
setInterval(processAutoTrades, 15000);

// ─── Strategy CRUD ────────────────────────────────────────────────────────────
// ─── Authentication API ───────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await db.execute({
      sql: 'SELECT * FROM users WHERE email = ?',
      args: [email]
    });

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Sign token (valid 7 days)
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, user: { id: user.id, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Strategy CRUD (Turso DB) ─────────────────────────────────────────────────

// List all strategies
app.get('/api/strategies', authenticateToken, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT id, name, updated_at FROM strategies WHERE user_id = ? ORDER BY updated_at DESC',
      args: [req.user.id]
    });
    const list = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      updatedAt: row.updated_at
    }));
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get one strategy (with full code)
app.get('/api/strategies/:id', authenticateToken, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT id, name, code, created_at, updated_at FROM strategies WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.user.id]
    });
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const row = result.rows[0];
    res.json({
      id: row.id,
      name: row.name,
      code: row.code,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create or update a strategy
app.post('/api/strategies', authenticateToken, async (req, res) => {
  const { id, name, code } = req.body || {};
  if (!name || !code) return res.status(400).json({ error: 'name and code required' });
  const now = new Date().toISOString();

  try {
    if (id) {
      // Update
      const check = await db.execute({
        sql: 'SELECT id FROM strategies WHERE id = ? AND user_id = ?',
        args: [id, req.user.id]
      });
      if (check.rows.length === 0) return res.status(404).json({ error: 'Not found' });

      await db.execute({
        sql: 'UPDATE strategies SET name = ?, code = ?, updated_at = ? WHERE id = ? AND user_id = ?',
        args: [name, code, now, id, req.user.id]
      });
      return res.json({ id, name, code, updatedAt: now });
    }

    // Insert
    const newId = `s_${Date.now()}`;
    await db.execute({
      sql: 'INSERT INTO strategies (id, user_id, name, code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [newId, req.user.id, name, code, now, now]
    });
    res.json({ id: newId, name, code, createdAt: now, updatedAt: now });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a strategy
app.delete('/api/strategies/:id', authenticateToken, async (req, res) => {
  try {
    const check = await db.execute({
      sql: 'SELECT id FROM strategies WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.user.id]
    });
    if (check.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    await db.execute({
      sql: 'DELETE FROM strategies WHERE id = ? AND user_id = ?',
      args: [req.params.id, req.user.id]
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getBinanceInterval(tf) {
  switch (tf) {
    case '1m': return '1m';
    case '3m': return '3m';
    case '5m': return '5m';
    case '10m': return '5m'; // fallback
    case '15m': return '15m';
    case '30m': return '30m';
    case '1h': return '1h';
    case '2h': return '2h';
    case '4h': return '4h';
    case '1d': return '1d';
    case '1w': return '1w';
    case '1month': return '1M';
    default: return '1m';
  }
}

function getUpstoxInterval(tf) {
  switch (tf) {
    case '1m': return '1minute';
    case '3m': return '1minute';
    case '5m': return '5minute';
    case '10m': return '5minute';
    case '15m': return '15minute';
    case '30m': return '30minute';
    case '1h': return '30minute';
    case '2h': return '30minute';
    case '4h': return '30minute';
    case '1d': return 'day';
    case '1w': return 'week';
    case '1month': return 'month';
    default: return '1minute';
  }
}

// Get historical OHLC for chart init
app.get('/api/history/:symbol', authenticateToken, async (req, res) => {
  const { symbol } = req.params;
  const tf = req.query.tf || '1m';

  let cleanSymbol = symbol.toUpperCase().replace(/[\s_-]/g, '');
  if (cleanSymbol === 'NIFTY50') cleanSymbol = 'NIFTY';
  if (cleanSymbol === 'STATEBANK' || cleanSymbol === 'STATEBANKOFINDIA') cleanSymbol = 'SBIN';

  // Resolve trading symbol → instrument key, or use query parameter key first
  const instrumentKey = req.query.key || symbolToKey[cleanSymbol] || symbolToKey[symbol.toUpperCase()] || symbol;

  // Coinbase Granularity helper
  const getCoinbaseGranularity = (tframe) => {
    switch (tframe) {
      case '1m': return 60;
      case '3m': return 60;
      case '5m': return 300;
      case '10m': return 300;
      case '15m': return 900;
      case '30m': return 1800;
      case '1h': return 3600;
      case '2h': return 3600;
      case '4h': return 3600;
      case '1d': return 86400;
      case '1w': return 86400 * 7;
      case '1month': return 86400 * 30;
      default: return 60;
    }
  };

  // Handle BTCUSD from Binance
  if (symbol.toUpperCase() === 'BTCUSD' || instrumentKey === 'BINANCE|BTCUSD') {
    try {
      const bInterval = getBinanceInterval(tf);
      const binanceUrl = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${bInterval}&limit=1000`;
      const resp = await axios.get(binanceUrl);
      const candles = resp.data.map(c => ({
        time: Math.floor(c[0] / 1000),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5])
      }));
      return res.json({ candles, mode: currentMode.toUpperCase() });
    } catch (err) {
      console.error('Binance history error, falling back to Coinbase REST API:', err.message);
      try {
        const granularity = getCoinbaseGranularity(tf);
        const coinbaseUrl = `https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=${granularity}`;
        const resp = await axios.get(coinbaseUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const candles = resp.data.map(c => ({
          time: c[0],
          low: c[1],
          high: c[2],
          open: c[3],
          close: c[4],
          volume: c[5]
        })).sort((a, b) => a.time - b.time);
        return res.json({ candles, mode: currentMode.toUpperCase() });
      } catch (cbErr) {
        console.error('Coinbase history fallback failed:', cbErr.message);
        return res.json({ candles: [], error: cbErr.message });
      }
    }
  }

  if (!instrumentKey || (!symbolToKey[symbol.toUpperCase()] && !instrumentsByKey.has(symbol))) {
    return res.json({ candles: [], error: 'Unknown symbol' });
  }

  if (!ACCESS_TOKEN || ACCESS_TOKEN === 'YOUR_UPSTOX_ACCESS_TOKEN_HERE') {
    return res.json({ candles: [], error: 'No token' });
  }

  const endDate = new Date();
  const startDate = new Date();

  const instInfo = instrumentsByKey.get(instrumentKey);
  const isFO = instInfo && (
    (instInfo.instrument_type || '').toUpperCase().startsWith('FUT') ||
    (instInfo.instrument_type || '').toUpperCase().startsWith('OPT') ||
    (instInfo.instrument_type || '').toUpperCase() === 'CE' ||
    (instInfo.instrument_type || '').toUpperCase() === 'PE' ||
    (instInfo.exchange || '').toUpperCase().startsWith('MCX') ||
    (instInfo.exchange || '').toUpperCase().startsWith('NCD')
  );
  const isFOTarget = isFO || /(_FUT|_OPT|\|FUT|\|OPT|MCX|NCD|CE|PE)/i.test(instrumentKey);

  // Upstox only allows up to 30 days of 1-minute historical data for all instruments.
  // Asking for a 1-year range throws a UDAPI1148 'Invalid date range' error.
  startDate.setDate(startDate.getDate() - 30);

  const allCandles = [];
  let currentStart = new Date(startDate);
  while (currentStart < endDate) {
    const currentEnd = new Date(Math.min(currentStart.getTime() + 30 * 86400000, endDate.getTime()));
    const toStr = currentEnd.toISOString().split('T')[0];
    const fromStr = currentStart.toISOString().split('T')[0];

    let success = false;

      // Try V3 API first (to then from order)
      try {
        const v3Url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/1minute/${toStr}/${fromStr}`;
        const v3Resp = await axios.get(v3Url, {
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, Accept: 'application/json' }
        });
        const raw = v3Resp.data?.data?.candles || [];
        allCandles.push(...raw);
        success = true;
      } catch (v3Err) {
        // V3 failed, try V2 (to then from order — same as V3)
        try {
          const v2Url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/1minute/${toStr}/${fromStr}`;
        const v2Resp = await axios.get(v2Url, {
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, Accept: 'application/json' }
        });
        const raw = v2Resp.data?.data?.candles || [];
        allCandles.push(...raw);
        success = true;
      } catch (v2Err) {
        const v2Detail = v2Err.response?.data ? JSON.stringify(v2Err.response.data).slice(0, 200) : v2Err.message;
        console.error(`History error for ${fromStr} to ${toStr}:`, v2Detail);
      }
    }

    currentStart = new Date(currentEnd);
  }

  // Fetch today's intraday candles to cover the current active trading day
  try {
    const intradayUrl = `https://api.upstox.com/v2/historical-candle/intraday/${encodeURIComponent(instrumentKey)}/1minute`;
    const intraResp = await axios.get(intradayUrl, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, Accept: 'application/json' }
    });
    const rawIntraday = intraResp.data?.data?.candles || [];
    allCandles.push(...rawIntraday);
  } catch (intraErr) {
    // Silently ignore if intraday endpoint is temporarily unavailable or returns empty
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

    const aggregated = aggregateCandles(candles, tf, symbol, instrumentKey);
    return res.json({ candles: aggregated, mode: 'LIVE' });
  }

  // No candles from API — only generate demo data when explicitly in demo mode
  if (currentMode !== 'demo') {
    console.log(`⚠️  No historical data for ${symbol} (LIVE mode) — returning empty`);
    return res.json({ candles: [], mode: 'LIVE' });
  }
  console.log(`⚠️  No historical data for ${symbol}, generating demo candles`);
  const demo = [];
  const basePrice = (() => {
    const s = symbol.toUpperCase();
    if (s.includes('NIFTY')) return 22450;
    if (s.includes('BANK')) return 48200;
    if (s === 'RELIANCE' || s.includes('RELIANCE')) return 2560;
    if (s === 'TCS') return 3890;
    if (s === 'HDFCBANK' || s.includes('HDFCBANK')) return 1680;
    if (s === 'CRUDEOIL' || s.includes('CRUDEOIL')) return 6800;
    return 2500;
  })();
  const endT = Math.floor(Date.now() / 1000);
  const startT = endT - 30 * 86400;
  let price = basePrice;
  for (let t = startT; t <= endT; t += 60) {
    const change = (Math.random() - 0.5) * basePrice * 0.002;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * basePrice * 0.001;
    const low = Math.min(open, close) - Math.random() * basePrice * 0.001;
    price = close;
    demo.push({ time: t, open, high, low, close, volume: Math.floor(Math.random() * 5000 + 1000) });
  }
  res.json({ candles: demo, mode: 'DEMO' });
});

// ─── Symbols Map Endpoint ───────────────────────────────────────────────────

app.get('/api/instruments/symbols', authenticateToken, (req, res) => {
  res.json(symbolToKey);
});

// ─── Instrument Search Endpoint ─────────────────────────────────────────────

app.get('/api/instruments/search', authenticateToken, (req, res) => {
  const { q, exchange, type, expiry } = req.query;
  let results = instrumentsList;

  // Filter by exchange
  if (exchange && exchange !== 'all') {
    results = results.filter(r => r.exchange === exchange.toUpperCase());
  }

  // Filter by instrument type (prefix match — Upstox uses OPTIDX, OPTSTK, FUTIDX, FUTSTK, etc.)
  if (type && type !== 'all') {
    const typeUpper = type.toUpperCase();
    results = results.filter(r => (r.instrument_type || '').toUpperCase().startsWith(typeUpper));
  }

  // Filter by expiry date
  if (expiry) {
    results = results.filter(r => r.expiry === expiry);
  }

  // Search query across tradingsymbol and name (case-insensitive)
  if (q && q.trim()) {
    const query = q.trim().toLowerCase();
    results = results.filter(r =>
      (r.tradingsymbol || '').toLowerCase().includes(query) ||
      (r.name || '').toLowerCase().includes(query)
    );
  }

  // Sort: Indices → Stocks/EQ → Futures (by expiry ASC) → Options (by expiry ASC, then strike ASC)
  const querySort = (q || '').trim().toLowerCase();

  // Prioritize MCX for commodities (CRUDEOIL, GOLD, etc.) and NSE/BSE for equities/indices
  const isCommodityQuery = querySort.includes('crude') || 
                            querySort.includes('gold') || 
                            querySort.includes('silver') || 
                            querySort.includes('copper') || 
                            querySort.includes('zinc');

  results.sort((a, b) => {
    const getExPri = (ex) => {
      const upper = (ex || '').toUpperCase();
      if (isCommodityQuery) {
        if (upper.startsWith('MCX')) return 0;
        if (upper.startsWith('NSE')) return 1;
        return 2;
      } else {
        if (upper.startsWith('NSE')) return 0;
        if (upper.startsWith('BSE')) return 1;
        return 2;
      }
    };
    const aExPri = getExPri(a.exchange);
    const bExPri = getExPri(b.exchange);
    if (aExPri !== bExPri) return aExPri - bExPri;

    const getPri = (t) => {
      const type = (t || '').toUpperCase();
      if (type.includes('INDEX')) return 0;
      if (type === 'EQ') return 1;
      if (type.startsWith('FUT')) return 2;
      if (type.startsWith('OPT')) return 3;
      return 4;
    };
    const aPri = getPri(a.instrument_type);
    const bPri = getPri(b.instrument_type);
    if (aPri !== bPri) return aPri - bPri;

    // Same category — sort by expiry ASC (nearest first)
    const aExp = a.expiry ? new Date(a.expiry).getTime() : Infinity;
    const bExp = b.expiry ? new Date(b.expiry).getTime() : Infinity;
    if (aExp !== bExp) return aExp - bExp;

    // Same expiry — for options, sort by strike ASC
    if (aPri === 3) {
      const aStrike = parseFloat(a.strike) || 0;
      const bStrike = parseFloat(b.strike) || 0;
      if (aStrike !== bStrike) return aStrike - bStrike;
    }

    // Tiebreaker: prefix relevance match
    if (querySort) {
      const aSym = (a.tradingsymbol || '').toLowerCase();
      const bSym = (b.tradingsymbol || '').toLowerCase();
      const aPrefix = aSym.startsWith(querySort);
      const bPrefix = bSym.startsWith(querySort);
      if (aPrefix && !bPrefix) return -1;
      if (!aPrefix && bPrefix) return 1;
    }
    return 0;
  });

  // Return top 20 matches
  const top = results.slice(0, 20).map(r => ({
    instrument_key: r.instrument_key,
    tradingsymbol: r.tradingsymbol,
    name: r.name,
    exchange: r.exchange,
    instrument_type: r.instrument_type,
    expiry: r.expiry,
    strike: r.strike,
    lot_size: r.lot_size,
  }));

  res.json({ results: top });
});

// ─── Option Chain Endpoints ────────────────────────────────────────────────

function detectOptionSide(inst) {
  const type = (inst.instrument_type || '').toUpperCase();
  if (type === 'CE') return 'CE';
  if (type === 'PE') return 'PE';
  return null;
}

function optionMatchesUnderlying(inst, searchTerm) {
  const type = (inst.instrument_type || '').toUpperCase();
  if (type !== 'CE' && type !== 'PE') return false;
  if (!inst.expiry) return false;
  const search = searchTerm.toUpperCase().trim();
  const instName = (inst.name || '').toUpperCase().trim();
  const instSymbol = (inst.tradingsymbol || '').toUpperCase();
  // Token-level name matching: check if any search token matches any name token.
  // This avoids false positives like "NIFTY" matching "MIDCPNIFTY".
  const searchTokens = search.split(/\s+/).filter(Boolean);
  const nameTokens = instName.split(/\s+/).filter(Boolean);
  if (searchTokens.some(st => nameTokens.includes(st))) return true;
  // Fallback: match by trading symbol prefix (e.g. "RELIANCE 1120 CE" starts with "RELIANCE")
  if (instSymbol.startsWith(search)) return true;
  return false;
}

app.get('/api/optionchain/check/:symbol', authenticateToken, (req, res) => {
  const { symbol } = req.params;
  const hasOptions = instrumentsList.some(inst => optionMatchesUnderlying(inst, symbol));
  res.json({ hasOptions });
});

// GET /api/optionchain/:underlying/expiries — list available expiry dates
app.get('/api/optionchain/:underlying/expiries', authenticateToken, (req, res) => {
  const { underlying } = req.params;
  const expiries = new Set();
  for (const inst of instrumentsList) {
    if (optionMatchesUnderlying(inst, underlying)) {
      expiries.add(inst.expiry);
    }
  }
  const sorted = [...expiries].sort();
  res.json({ expiries: sorted });
});

// GET /api/optionchain/:underlying/:expiry — full option chain for a given expiry
app.get('/api/optionchain/:underlying/:expiry', authenticateToken, (req, res) => {
  const { underlying, expiry } = req.params;

  const options = instrumentsList.filter(inst => {
    return optionMatchesUnderlying(inst, underlying) && inst.expiry === expiry;
  });

  // Group by strike
  const strikes = {};
  for (const opt of options) {
    const strike = parseFloat(opt.strike) || 0;
    if (!strikes[strike]) strikes[strike] = { strike, ce: null, pe: null };
    const side = detectOptionSide(opt);
    if (side === 'CE') {
      strikes[strike].ce = {
        instrument_key: opt.instrument_key,
        tradingsymbol: opt.tradingsymbol,
        ltp: null,
      };
    } else if (side === 'PE') {
      strikes[strike].pe = {
        instrument_key: opt.instrument_key,
        tradingsymbol: opt.tradingsymbol,
        ltp: null,
      };
    }
  }

  const chain = Object.values(strikes).sort((a, b) => a.strike - b.strike);
  res.json({ chain, underlying: underlying.toUpperCase(), expiry });
});

// ─── Webhook & Trades endpoints (Turso DB) ───────────────────────────────────

// Retrieve trade log history
app.get('/api/trades', authenticateToken, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC',
      args: [req.user.id]
    });
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook for Make.com execution updates
app.post('/api/webhook/trade', async (req, res) => {
  const token = req.headers['x-webhook-token'];
  if (!token || token !== MAKE_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized webhook request' });
  }

  const { id, userId, symbol, direction, qty, price, status, pnl, comment } = req.body || {};
  if (!symbol || !direction || !qty || !price || !status) {
    return res.status(400).json({ error: 'Missing required webhook fields' });
  }

  const now = new Date().toISOString();
  const activeUserId = userId || 'u_admin_default';

  try {
    const check = await db.execute({
      sql: 'SELECT id FROM trades WHERE id = ?',
      args: [id || '']
    });

    if (id && check.rows.length > 0) {
      const closedAt = status === 'CLOSED' ? now : null;
      await db.execute({
        sql: 'UPDATE trades SET status = ?, pnl = ?, closed_at = ?, comment = ? WHERE id = ?',
        args: [status, pnl || 0.0, closedAt, comment || null, id]
      });
      console.log(`📡 Webhook trade updated: ${id} - ${symbol} is now ${status}`);
    } else {
      const tradeId = id || `t_${Date.now()}`;
      const closedAt = status === 'CLOSED' ? now : null;
      await db.execute({
        sql: 'INSERT INTO trades (id, user_id, symbol, direction, qty, price, status, pnl, created_at, closed_at, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [tradeId, activeUserId, symbol, direction, Number(qty), Number(price), status, pnl || 0.0, now, closedAt, comment || null]
      });
      console.log(`📡 Webhook trade created: ${tradeId} - ${symbol} ${direction}`);
    }

    // Notify connected browser clients to refresh trades
    broadcast(JSON.stringify({ type: 'webhook_trade_update' }));
    res.json({ success: true });
  } catch (err) {
    console.error('Webhook trade record failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Place Order Endpoint ───────────────────────────────────────────────────

app.post('/api/order', authenticateToken, async (req, res) => {
  if (!ACCESS_TOKEN || ACCESS_TOKEN === 'YOUR_UPSTOX_ACCESS_TOKEN_HERE') {
    return res.json({ success: false, error: 'Upstox not configured' });
  }

  const { symbol, qty, orderType, price, triggerPrice, product, side } = req.body;

  // Resolve instrument key — look up in symbolToKey or use raw key as fallback
  const instrumentKey = symbolToKey[symbol] || symbol;

  // Build the Upstox order request body
  const body = {
    instrument_key: instrumentKey,
    quantity: Number(qty),
    order_type: orderType || 'MARKET',
    price: price ? String(price) : '0',
    trigger_price: triggerPrice ? String(triggerPrice) : '0',
    product: product || 'MIS',
    transaction_type: side || 'BUY',
    validity: 'DAY',
  };

  try {
    const resp = await axios.post('https://api.upstox.com/v2/order/place', body, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
    console.log(`📈 Order placed: ${side} ${qty} ${symbol} @ ${price || 'MKT'}`);
    res.json({ success: true, orderResponse: resp.data });
  } catch (err) {
    const msg = err.response?.data?.message || err.response?.data || err.message;
    console.error('Order placement error:', msg);
    res.json({ success: false, error: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }
});

// ─── Demo Tick Generator ──────────────────────────────────────────────────
const INSTRUMENTS = [
  { symbol: 'NIFTY', key: 'NSE_INDEX|Nifty 50', basePrice: 22450 },
  { symbol: 'BANKNIFTY', key: 'NSE_INDEX|Nifty Bank', basePrice: 48200 },
  { symbol: 'RELIANCE', key: 'NSE_EQ|INE002A01018', basePrice: 2560 },
  { symbol: 'TCS', key: 'NSE_EQ|INE467B01029', basePrice: 3890 },
  { symbol: 'HDFCBANK', key: 'NSE_EQ|INE040A01034', basePrice: 1680 },
  { symbol: 'CRUDEOIL', key: 'MCX_FO|CRUDEOIL', basePrice: 6800 },
  { symbol: 'SBIN', key: 'NSE_EQ|INE062A01020', basePrice: 830 },
];

// Ensure CRUDEOIL is in symbolToKey so search/subscription works
if (!symbolToKey['CRUDEOIL']) symbolToKey['CRUDEOIL'] = 'MCX_FO|CRUDEOIL';
if (!keyToSymbol['MCX_FO|CRUDEOIL']) keyToSymbol['MCX_FO|CRUDEOIL'] = 'CRUDEOIL';

// Ensure SBIN is in symbolToKey so search/subscription works
if (!symbolToKey['SBIN']) symbolToKey['SBIN'] = 'NSE_EQ|INE062A01020';
if (!keyToSymbol['NSE_EQ|INE062A01020']) keyToSymbol['NSE_EQ|INE062A01020'] = 'SBIN';

// Ensure NIFTY indices are in symbolToKey so search/subscription/auto-trades work
if (!symbolToKey['NIFTY']) symbolToKey['NIFTY'] = 'NSE_INDEX|Nifty 50';
if (!symbolToKey['NIFTY50']) symbolToKey['NIFTY50'] = 'NSE_INDEX|Nifty 50';
if (!keyToSymbol['NSE_INDEX|Nifty 50']) keyToSymbol['NSE_INDEX|Nifty 50'] = 'NIFTY';

if (!symbolToKey['BANKNIFTY']) symbolToKey['BANKNIFTY'] = 'NSE_INDEX|Nifty Bank';
if (!keyToSymbol['NSE_INDEX|Nifty Bank']) keyToSymbol['NSE_INDEX|Nifty Bank'] = 'BANKNIFTY';

const demoPrices = {};
const demoTickGenerators = {};

function startDemoTicks() {
  if (demoInterval) clearInterval(demoInterval);
  for (const inst of INSTRUMENTS) {
    demoPrices[inst.symbol] = inst.basePrice;
    demoTickGenerators[inst.symbol] = {
      price: inst.basePrice,
      prevClose: inst.basePrice * (1 + (Math.random() - 0.5) * 0.02),
      open: inst.basePrice,
      high: inst.basePrice,
      low: inst.basePrice,
      candleStart: Math.floor(Date.now() / 60000) * 60,
      trend: (Math.random() - 0.5) * 0.001,
    };
  }
  demoInterval = setInterval(() => {
    const now = Date.now();
    for (const inst of INSTRUMENTS) {
      const gen = demoTickGenerators[inst.symbol];
      if (!gen) continue;
      gen.trend += (Math.random() - 0.5) * 0.0005;
      gen.trend = Math.max(-0.005, Math.min(0.005, gen.trend));
      const change = gen.price * gen.trend + gen.price * (Math.random() - 0.5) * 0.001;
      gen.price = Math.max(gen.price * 0.9, gen.price + change);
      demoPrices[inst.symbol] = gen.price;

      // Track proper OHLC for the current 1-minute candle
      const candleTime = Math.floor(now / 60000) * 60;
      if (candleTime !== gen.candleStart) {
        gen.prevClose = gen.price;
        gen.open = gen.price;
        gen.high = gen.price;
        gen.low = gen.price;
        gen.candleStart = candleTime;
      } else {
        gen.high = Math.max(gen.high, gen.price);
        gen.low = Math.min(gen.low, gen.price);
      }

      const tickSymbol = keyToSymbol[inst.key] || inst.symbol;
      broadcast({
        type: 'tick',
        data: {
          instrumentKey: inst.key,
          symbol: tickSymbol,
          ltp: gen.price,
          timestamp: now,
          open: gen.open,
          high: gen.high,
          low: gen.low,
          close: gen.prevClose,
          volume: Math.floor(Math.random() * 5000 + 500),
          mode: 'DEMO',
        },
      });
      tickCount++;
      lastTickTime = now;
    }
  }, 1000);
}

function stopDemoTicks() {
  if (demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
  }
}

// ─── User Settings Sync Endpoints ───────────────────────────────────────────
app.get('/api/user/settings', authenticateToken, async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT * FROM user_settings WHERE user_id = ?',
      args: [req.user.id]
    });
    
    if (result.rows.length === 0) {
      // Return empty settings defaults if not set yet
      return res.json({
        watchlist: [],
        ticker: [],
        paper_positions: []
      });
    }

    const row = result.rows[0];
    res.json({
      watchlist: row.watchlist ? JSON.parse(row.watchlist) : [],
      ticker: row.ticker ? JSON.parse(row.ticker) : [],
      paper_positions: row.paper_positions ? JSON.parse(row.paper_positions) : []
    });
  } catch (err) {
    console.error('Error fetching user settings:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/settings', authenticateToken, async (req, res) => {
  const { watchlist, ticker, paper_positions } = req.body || {};
  try {
    const currentResult = await db.execute({
      sql: 'SELECT * FROM user_settings WHERE user_id = ?',
      args: [req.user.id]
    });

    let finalWatchlist = watchlist !== undefined ? JSON.stringify(watchlist) : (currentResult.rows[0]?.watchlist || '[]');
    let finalTicker = ticker !== undefined ? JSON.stringify(ticker) : (currentResult.rows[0]?.ticker || '[]');
    let finalPaperPositions = paper_positions !== undefined ? JSON.stringify(paper_positions) : (currentResult.rows[0]?.paper_positions || '[]');

    await db.execute({
      sql: 'INSERT OR REPLACE INTO user_settings (user_id, watchlist, ticker, paper_positions, updated_at) VALUES (?, ?, ?, ?, ?)',
      args: [req.user.id, finalWatchlist, finalTicker, finalPaperPositions, new Date().toISOString()]
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error saving user settings:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Mode Endpoints ────────────────────────────────────────────────────────
app.get('/api/mode', authenticateToken, (req, res) => {
  res.json({ mode: currentMode });
});

app.post('/api/mode', authenticateToken, (req, res) => {
  const { mode } = req.body;
  if (mode !== 'live' && mode !== 'demo') {
    return res.status(400).json({ error: 'Mode must be "live" or "demo"' });
  }
  currentMode = mode;
  if (mode === 'demo') {
    if (upstoxWS) { upstoxWS.close(); upstoxWS = null; }
    stopDemoTicks();
    startDemoTicks();
    console.log('🎮 Switched to DEMO mode — synthetic ticks');
  } else {
    stopDemoTicks();
    // Don't clear subscribedKeys — reuse existing keys when Upstox reconnects
    if (ACCESS_TOKEN && ACCESS_TOKEN !== 'YOUR_UPSTOX_ACCESS_TOKEN_HERE') {
      connectUpstox();
    }
    console.log('📊 Switched to LIVE mode');
  }
  // Broadcast mode change so frontend can re-subscribe instrument keys
  broadcast({ type: 'mode_change', mode: currentMode });
  res.json({ mode: currentMode });
});

// Debug endpoint to check server state
app.get('/api/debug', authenticateToken, (req, res) => {
  const allKeys = Array.from(subscribedKeys);
  const sampleKeys = allKeys.slice(0, 10);
  res.json({
    instrumentsLoaded,
    subscribedKeys: allKeys.length,
    optKeys: allKeys.filter(k => /_OPT\|/.test(k) || (instrumentsByKey.get(k) && ['CE','PE'].includes((instrumentsByKey.get(k).instrument_type||'').toUpperCase()))).length,
    upstoxWSOpen: upstoxWS ? upstoxWS.readyState === WebSocket.OPEN : false,
    browserClients: browserClients.size,
    instrumentsByKey: instrumentsByKey.size,
    tickCount,
    lastTickTime: lastTickTime ? new Date(lastTickTime).toISOString() : 'never',
    sampleKeys,
  });
});

// SPA catch-all: serve React index.html for any non-API route
app.get('*', (req, res) => {
  const indexHtmlPath = path.join(__dirname, 'client', 'dist', 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    res.sendFile(indexHtmlPath);
  } else {
    res.status(200).json({ status: 'running', message: 'Trade Desk Backend API' });
  }
});

// ─── HTTP + WS Server ────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  if (ACCESS_TOKEN && ACCESS_TOKEN !== 'YOUR_UPSTOX_ACCESS_TOKEN_HERE') {
    console.log(`\n🚀 Dashboard running at http://localhost:${PORT} (LIVE — Upstox)`);
    currentMode = 'live';
    connectUpstox();
  } else {
    console.log(`\n🚀 Dashboard running at http://localhost:${PORT} (DEMO — synthetic ticks)`);
    currentMode = 'demo';
    startDemoTicks();
  }
});

server.on('upgrade', (req, socket, head) => {
  try {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const token = parsedUrl.searchParams.get('token');

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    });
  } catch (err) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
  }
});

wss.on('connection', (ws) => {
  browserClients.add(ws);
  console.log(`Browser connected (${browserClients.size} total)`);

  // Handle messages from the browser (e.g. subscribe to new instruments)
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'subscribe' && msg.instrumentKey) {
        const key = msg.instrumentKey;
        if (!subscribedKeys.has(key)) {
          subscribedKeys.add(key);
          console.log(`➕ Subscribed: ${key}`);
          sendUpstoxSubscription();
        }
      }
      if (msg.type === 'subscribe_all' && Array.isArray(msg.keys)) {
        let changed = false;
        for (const key of msg.keys) {
          if (!subscribedKeys.has(key)) {
            subscribedKeys.add(key);
            changed = true;
          }
        }
        if (changed) {
          sendUpstoxSubscription();
        }
      }
      if (msg.type === 'subscribe_options' && Array.isArray(msg.keys)) {
        // Remove old option keys, add new ones, then re-subscribe
        const oldOpts = [...subscribedKeys].filter(k => isOptionKey(k));
        for (const k of oldOpts) subscribedKeys.delete(k);
        let changed = oldOpts.length > 0;
        for (const key of msg.keys) {
          if (!subscribedKeys.has(key)) { subscribedKeys.add(key); changed = true; }
        }
        if (changed) {
          console.log(`🔄 Option subscription updated: ${msg.keys.length} keys`);
          sendUpstoxSubscription();
        }
      }
    } catch (e) {
      // Ignore parse errors on WS messages
    }
  });

  ws.on('close', () => {
    browserClients.delete(ws);
    console.log(`Browser disconnected (${browserClients.size} total)`);
  });
});
