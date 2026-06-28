require('dotenv').config();
const express = require('express');
const WebSocket = require('ws');
const axios = require('axios');
const path = require('path');
const protobuf = require('protobufjs');
const https = require('https');
const { createGunzip } = require('zlib');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client', 'dist')));

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

// Load Upstox V3 protobuf definition
const protoRoot = protobuf.loadSync(path.join(__dirname, 'MarketDataFeed.proto'));
const FeedResponse = protoRoot.lookupType('FeedResponse');

// ─── JSON Download & Indexing ──────────────────────────────────────────────────

const INSTRUMENT_JSON_URL = 'https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz';

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
      if (!keyToSymbol[key]) keyToSymbol[key] = tsym;
      if (!symbolToKey[tsym]) symbolToKey[tsym] = key;
      added++;
    }
  }
  return added;
}

async function loadInstruments() {
  try {
    console.log(`📥 Downloading instruments JSON...`);
    const records = await downloadGzippedJSON(INSTRUMENT_JSON_URL);
    const count = indexInstruments(records);
    console.log(`   ✓ ${count} instruments indexed from JSON`);
  } catch (err) {
    console.warn(`⚠️  Failed to download/parse instruments JSON: ${err.message}`);
  }
  instrumentsLoaded = true;
  console.log(`\n📊 Total instruments indexed: ${instrumentsByKey.size}\n`);
  // Flush any pending subscriptions now that keyToSymbol is populated
  sendUpstoxSubscription();
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
  return /_(OPT|FO)\|/.test(key);
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
    upstoxWS.send(JSON.stringify({
      guid: 'dashboard-sub',
      method: 'sub',
      data: { mode: 'full', instrumentKeys: regKeys },
    }));
    console.log(`📡 Subscribed to ${regKeys.length} regular instrument(s)`);
  }
  if (optKeys.length > 0) {
    upstoxWS.send(JSON.stringify({
      guid: 'dashboard-sub-opt',
      method: 'sub',
      data: { mode: 'option_greeks', instrumentKeys: optKeys },
    }));
    console.log(`📡 Subscribed to ${optKeys.length} option instrument(s) with Greeks`);
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

    upstoxWS = new WebSocket(wsUrl);

    upstoxWS.on('open', () => {
      console.log('✅ Connected to Upstox WebSocket');
      sendUpstoxSubscription();
    });

    upstoxWS.on('message', (raw) => {
      try {
        const ticks = decodeUpstoxFeed(raw);
        for (const tick of ticks) {
          broadcast({ type: 'tick', data: tick });
          tickCount++;
          lastTickTime = Date.now();
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

  // Resolve trading symbol → instrument key, or use raw key directly
  const instrumentKey = symbolToKey[symbol.toUpperCase()] || symbol;

  if (!instrumentKey || (!symbolToKey[symbol.toUpperCase()] && !instrumentsByKey.has(symbol))) {
    return res.json({ candles: [], error: 'Unknown symbol' });
  }

  if (!ACCESS_TOKEN || ACCESS_TOKEN === 'YOUR_UPSTOX_ACCESS_TOKEN_HERE') {
    return res.json({ candles: [], error: 'No token' });
  }

  // Use a conservative date range for intraday (14 days to avoid V2/V3 400 errors)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 1);

  const allCandles = [];
  let currentStart = new Date(startDate);
  while (currentStart < endDate) {
    const currentEnd = new Date(Math.min(currentStart.getTime() + 30 * 86400000, endDate.getTime()));
    const toStr = currentEnd.toISOString().split('T')[0];
    const fromStr = currentStart.toISOString().split('T')[0];

    let success = false;

    // Try V3 API first (preferred format)
    try {
      const v3Url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/minutes/1/${toStr}/${fromStr}`;
      const v3Resp = await axios.get(v3Url, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, Accept: 'application/json' }
      });
      const raw = v3Resp.data?.data?.candles || [];
      allCandles.push(...raw);
      success = true;
    } catch (v3Err) {
      // V3 failed, try V2 as fallback
      try {
        const v2Url = `https://api.upstox.com/v2/historical-candle/${encodeURIComponent(instrumentKey)}/1minute/${toStr}/${fromStr}`;
        const v2Resp = await axios.get(v2Url, {
          headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, Accept: 'application/json' }
        });
        const raw = v2Resp.data?.data?.candles || [];
        allCandles.push(...raw);
        success = true;
      } catch (v2Err) {
        console.error(`History error for ${fromStr} to ${toStr}:`, v2Err.message);
      }
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

  // No candles from API — return empty (no synthetic data)
  res.json({ candles: [] });
});

// ─── Symbols Map Endpoint ───────────────────────────────────────────────────

app.get('/api/instruments/symbols', (req, res) => {
  res.json(symbolToKey);
});

// ─── Instrument Search Endpoint ─────────────────────────────────────────────

app.get('/api/instruments/search', (req, res) => {
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
  results.sort((a, b) => {
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

// GET /api/optionchain/check/:symbol — check if options exist for this underlying
app.get('/api/optionchain/check/:symbol', (req, res) => {
  const { symbol } = req.params;
  const hasOptions = instrumentsList.some(inst => optionMatchesUnderlying(inst, symbol));
  res.json({ hasOptions });
});

// GET /api/optionchain/:underlying/expiries — list available expiry dates
app.get('/api/optionchain/:underlying/expiries', (req, res) => {
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
app.get('/api/optionchain/:underlying/:expiry', (req, res) => {
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

// ─── Place Order Endpoint ───────────────────────────────────────────────────

app.post('/api/order', async (req, res) => {
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

// Debug endpoint to check server state
app.get('/api/debug', (req, res) => {
  const allKeys = Array.from(subscribedKeys);
  const sampleKeys = allKeys.slice(0, 10);
  res.json({
    instrumentsLoaded,
    subscribedKeys: allKeys.length,
    optKeys: allKeys.filter(k => /_(OPT|FO)\|/.test(k)).length,
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
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

// ─── HTTP + WS Server ────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Dashboard running at http://localhost:${PORT}`);
  if (ACCESS_TOKEN && ACCESS_TOKEN !== 'YOUR_UPSTOX_ACCESS_TOKEN_HERE') {
    console.log('📊 Mode: LIVE (Upstox)');
    connectUpstox();
  } else {
    console.log('⚠️  No Upstox token set — configure .env to fetch live data');
  }
});

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
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
