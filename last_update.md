# Last Update — Project Status

**Date:** Sunday, June 28, 2026

---

## Project
Upstox Live Trading Dashboard — Real-time Indian stock & crude oil chart dashboard with strategy alerts sent to Make.com via webhook.

---

## Goal
Convert the static HTML dashboard to a React + Tailwind CSS application and fix all data pipeline issues (WebSocket V3 protobuf, history API, timeframe aggregation).

---

## Stack
- **Frontend:** React 18 + Vite 6 + Tailwind CSS 3 + lightweight-charts 4.1.3
- **Backend:** Node.js + Express + WebSocket (ws) + protobufjs
- **API:** Upstox V3 feed (protobuf) + V2 historical candles
- **Alerts:** Make.com webhook integration
- **Port:** 3000 (serves both API/WS and built React frontend)

---

## Instruments
| Display Name | Exchange | Instrument Key |
|---|---|---|
| NIFTY50 | NSE Index | `NSE_INDEX\|Nifty 50` |
| BANKNIFTY | NSE Index | `NSE_INDEX\|Nifty Bank` |
| RELIANCE | NSE Equity | `NSE_EQ\|INE002A01018` |
| TCS | NSE Equity | `NSE_EQ\|INE467B01029` |
| HDFC BANK | NSE Equity | `NSE_EQ\|INE040A01034` |
| CRUDE OIL | MCX Futures | `MCX_FO\|CRUDEOIL` |

---

## Features
- **LIVE/DEMO toggle** — Server-side demo tick generation; switching to live clears prices
- **Real-time ticks** — Upstox V3 WebSocket with protobuf decoding pushed to browser
- **Historical candles** — V3 intraday fallback → V2 1min (5-day) → demo synthetic
- **Timeframe aggregation** — `aggregateCandles()` buckets 1min data into 5m, 15m, 1h, 1d
- **12 chart styles** — Candles, Hollow, Volume, Heikin Ashi, Bars, Line, Line+Markers, Step Line, Area, HLC Area, Baseline, Columns
- **Multi-chart layouts** — Single, Side-by-side, Stacked, Grid (2×2)
- **Ticker strip** — Watchlist items, color-coded P&L, click to switch
- **Resizable right sidebar** — Collapsible (double-click splitter), persisted in localStorage
- **Vertical price scale zoom** — Scroll over Y-axis stretches/compresses candles only
- **Volume panel removed** — Candle chart uses full chart height
- **Drawing tools** — Trend Line, Horizontal/Vertical Line, Ray, Rectangle, Fibonacci, Text Label, Eraser
- **Indicators** — SMA, EMA, VWAP, ATR, SuperTrend, RSI, Stochastic, MACD, Bollinger Bands, OBV, Volume MA
- **Replay mode** — Step through historical candle data
- **Context menu** — Right-click reset chart
- **Watchlist panel** — Add/remove symbols, auto-populates first 6 from instrument list
- **Search modal** — Debounced search with category filtering, default query "NIFTY50"
- **Auto-select NIFTY** — On symbol map load, picks NIFTY (exact match first, then prefix)
- **Scroll wheel zoom** — Native lightweight-charts zoom (UP=zoom IN, DOWN=zoom OUT)
- **Symbol persistence** — Per-chart symbol saved across page reloads
- **Manual signals** — BUY/SELL/INFO buttons send alerts to Make.com
- **Strategies** — Manual, EMA Crossover, RSI Threshold, Price Breakout, Custom Note
- **Alert log** — Scrollable log with color-coded entries
- **Webhook status** — Shows last webhook send result
- **No TradingView logo** — `attributionLogo: false`

---

## File Structure
```
upstox-dashboard/
├── server.js                   ← Express + WebSocket + Upstox V3/V2 + demo mode
├── MarketDataFeed.proto        ← Upstox V3 protobuf schema
├── .env                        ← Tokens (ACCESS_TOKEN, MAKE_WEBHOOK_URL, PORT)
├── package.json                ← Root: scripts (start, dev, build:client, dev:client)
├── README.md                   ← Original static HTML docs
├── last_update.md              ← THIS FILE
├── public/                     ← (Legacy static HTML — unused by React build)
└── client/
    ├── package.json            ← React 18, lightweight-charts 4.1.3, Tailwind 3, Vite 6
    ├── vite.config.js          ← Vite config with /api proxy to port 3000
    ├── tailwind.config.js      ← Custom colors (surface, border, accent, green, red, yellow, muted)
    ├── index.html              ← Entry HTML
    └── src/
        ├── App.jsx             ← Root: WS connect, mode toggle, state management
        ├── index.css           ← Tailwind directives + base styles
        ├── components/
    │   ├── TopBar.jsx      ← LIVE/DEMO buttons, active symbol, layout switcher, watchlist toggle
    │   ├── TickerStrip.jsx ← Horizontal price strip with P&L coloring
    │   ├── ChartPanel.jsx  ← lightweight-charts with candles, indicators, drawings, replay
    │   ├── Sidebar.jsx     ← Trading panel, strategy runner, webhook log
    │   ├── TradingPanel.jsx ← Order form, strategy config, signal buttons
    │   ├── DrawingTools.jsx ← Left-side tool strip (Trend Line, Fib, etc.)
    │   ├── CandleSelector.jsx ← Chart style picker dropdown
    │   ├── Watchlist.jsx  ← Left-side watchlist panel with add/remove
    │   └── SymbolSearch.jsx ← Modal search with NIFTY50 default and category filter
        └── dist/               ← Built frontend (served by server.js)
```

---

## Key Technical Decisions
1. **WebSocket V3 protobuf** — Upstox V3 uses binary protobuf exclusively; decoded server-side with `MarketDataFeed.proto` and rebroadcast as JSON to browsers
2. **V2 historical API** — V3 intraday endpoint returned empty data for indices; V2 `GET /v2/historical-candle/{key}/{interval}/{to}/{from}` returns real data
3. **Demo mode server-side** — Server runs `setInterval` generating synthetic ticks; toggled via `POST /api/mode`
4. **lightweight-charts v4.1.3** — Pinned to v4 (not v5) because v5 renamed `addCandlestickSeries()` to `addSeries(SeriesType, options)`
5. **Direct WS in dev** — Dev mode connects to `localhost:3000` directly (not through Vite proxy) because Vite can't proxy root WebSocket upgrades
6. **Custom wheel handler** — `handleScale.mouseWheel: false`; custom handler detects cursor over right price scale → vertical-only zoom (scaleMargins), over chart area → both axes
7. **Resizable sidebar** — Splitter div with `cursor-col-resize`, `mousedown`/`touchstart` drag, double-click collapse/expand, width/state persisted in `localStorage`
8. **NIFTY50 default search** — SymbolSearch uses initial query `NIFTY50` + `key` prop remount to avoid race conditions
9. **Auto-select "NIFTY"** — After instrument map loads, picks exact "NIFTY" → first "NIFTY…" prefix → first key as default chart symbol

---

## How to Run
```bash
cd upstox-dashboard
npm install
cd client && npm install && cd ..
# Set .env values
npm start
# Open http://localhost:3000
```

---

## Deployment
- Build client: `npm run build:client` (runs `cd client && npm run build`)
- Start: `npm start` (serves both API/WS on port 3000 + `client/dist/` static files)
- SPA catch-all: any non-API route serves `client/dist/index.html`

---

## API Endpoints
| Method | Path | Description |
|---|---|---|
| GET | `/api/mode` | Get current mode (`live` or `demo`) |
| POST | `/api/mode` | Set mode (`{ mode: 'live' | 'demo' }`) |
| GET | `/api/history/:symbol` | Get historical OHLC candles |
| POST | `/api/alert` | Send strategy alert to Make.com |

---

## Status
- WebSocket: Connected to Upstox V3 feed (auto-reconnect every 5s on failure)
- History: V2 API returns real candles from last trading day
- Demo mode: Synthetic ticks generated at 1s interval with random walks
- **Market closed** (Saturday) — real ticks will flow Monday when market opens
- Token valid until June 2027
- Volume panel removed — candle chart uses full height
- Vertical price scale zoom via custom wheel handler (price scale only: scaleMargins, chart area: both axes)

---

## Notes
- Upstox WebSocket uses `full` mode (includes daily OHLC, volume, etc.)
- Protobuf decoder falls back through `ltpc` → `fullFeed.marketFF.ltpc` / `fullFeed.indexFF.ltpc` → `firstLevelWithGreeks.ltpc`
- `aggregateCandles()` buckets by `Math.floor(time / tfSec) * tfSec` — works for any timeframe multiple of 1 minute
- `/api/history/:symbol` uses first available: V3 intraday → V2 1min → demo synthetic → empty array
