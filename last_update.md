# Last Update — Project Status

**Date:** Saturday, July 4, 2026 *(Updated: Database, Auth, Geoblock & Journaling Integration)*

---

## Project
Upstox Live Trading Dashboard — Real-time Indian stock & crude oil chart dashboard with strategy alerts sent to Make.com via webhook. Now fully secured with JWT authentication, Turso DB persistence, and Coinbase fallbacks for US/EU deployments.

---

## Goal
Migrate filesystem storage to a Turso SQLite database, add secure user sign-in (JWT + Bcrypt), implement geoblock-free BTCUSD data fallbacks, and build a Live Trade Journal updated by Make.com workflows.

---

## Stack
- **Frontend:** React 18 + Vite 6 + Tailwind CSS 3 + lightweight-charts 4.1.3
- **Backend:** Node.js + Express + WebSocket (ws) + protobufjs + jsonwebtoken + bcryptjs
- **Database:** Turso (LibSQL client) SQLite cloud database
- **API:** Upstox V3 feed (protobuf) + V2 historical candles + Coinbase (candles/WS fallback)
- **Alerts:** Make.com webhook integration + Trade execution updates webhook

---

## Instruments
| Display Name | Exchange | Instrument Key | Data Source |
|---|---|---|---|
| NIFTY50 | NSE Index | `NSE_INDEX\|Nifty 50` | Upstox |
| BANKNIFTY | NSE Index | `NSE_INDEX\|Nifty Bank` | Upstox |
| RELIANCE | NSE Equity | `NSE_EQ\|INE002A01018` | Upstox |
| TCS | NSE Equity | `NSE_EQ\|INE467B01029` | Upstox |
| HDFC BANK | NSE Equity | `NSE_EQ\|INE040A01034` | Upstox |
| CRUDE OIL | MCX Futures | `MCX_FO\|CRUDEOIL` | Upstox |
| BTCUSD | Crypto | `BINANCE\|BTCUSD` | Coinbase (US/EU Fallback) / Binance |

---

## Features
- **Security & JWT Auth** — Secure login screen (no open signup) blocking unauthorized terminal access. All API endpoints and WebSocket upgrades verified using JWT tokens.
- **Turso DB Migration** — Relocated strategy storage from `strategies.json` to Turso SQLite. Includes `migrate.js` script to bootstrap schema and seed 44 mock entries.
- **Coinbase Geoblock Fallback** — When deployed in geoblocked container environments (like US-based Railway servers), Binance requests fail with HTTP 451. The server automatically falls back to Coinbase REST API and WebSockets for `BTCUSD` ticks.
- **Make.com Webhook Integration** — Route `/api/webhook/trade` validates incoming Make.com payloads via static secret tokens and records trade logs inside the DB.
- **Live Trade Journal** — A tabbed panel in the Sidebar Trade tab switcher displaying open and closed positions, entry/exit prices, and real-time realized P&L, synchronized instantly via WebSocket events.
- **Upstox WS Handshake Auth** — Appends `Authorization: Bearer <TOKEN>` in the WebSocket constructor parameters to prevent `403 Forbidden` handshake rejections on production servers.
- **CORS Middleware** — Supports credentials and dynamically matches origins to allow seamless access from Vercel preview/production links (`*.vercel.app`) and localhost.

---

## File Structure
```
upstox-dashboard/
├── server.js                   ← Express + LibSQL + JWT + Webhook + Geoblock fallback
├── MarketDataFeed.proto        ← Upstox V3 protobuf schema
├── .env                        ← Tokens (UPSTOX_ACCESS_TOKEN, TURSO_DB_URL, JWT_SECRET)
├── package.json                ← Backend dependencies (@libsql/client, bcryptjs, jwt)
├── README.md                   ← Original static HTML docs
├── last_update.md              ← THIS FILE
└── scripts/
    └── migrate.js              ← Database schema creation and mock data seeder
└── client/
    ├── .env                    ← Client configuration (VITE_API_URL)
    ├── package.json            ← React, lightweight-charts, Tailwind
    ├── src/
        ├── main.jsx            ← Global fetch interceptor for URL prefixing and JWT injection
        ├── App.jsx             ← Login screen routing, WS auth query params, state triggers
        └── components/
            ├── TopBar.jsx      ← Layout, style picker, watchlist toggles, and logout trigger
            ├── Sidebar.jsx     ← TradingPanel, AlertLog, and TradeJournal switcher
```

---

## Key Technical Decisions
1. **Global Fetch Interception** — Prepared `client/src/main.jsx` window override that injects the authorization token from localStorage into all HTTP headers and handles CORS path mapping dynamically.
2. **WebSocket Upgrade Authorization** — The backend interceptor parses the WebSocket request URL query parameter `?token=...` and verifies it via `jwt.verify` at the HTTP upgrade handshake level.
3. **Make.com Token Verification** — Trade execution webhooks are secured using the `X-Webhook-Token` header matched against `MAKE_WEBHOOK_SECRET` in `.env`.
4. **Tabbed Sidebar Layout** — Implemented tab toggles in the Trade Tab to easily switch between the Alert Log and the Trade Journal.
5. **Seeder Script** — Formulated programmatic generators to populate exactly 44 high-fidelity dummy entries in each table to verify list rendering, pagination, and layout.

---

## How to Run
```bash
# 1. Setup Environment
# Fill TURSO_DB_URL, TURSO_DB_TOKEN, and JWT_SECRET in root .env

# 2. Run Database Migration and Seeding
node scripts/migrate.js

# 3. Build & Run Application
npm install
cd client && npm install && npm run build && cd ..
npm start
```

---

## API Endpoints
| Method | Path | Auth Required | Description |
|---|---|---|---|
| POST | `/api/auth/login` | No | Authenticate user and issue JWT token |
| GET | `/api/mode` | Yes | Get current mode (`live` or `demo`) |
| POST | `/api/mode` | Yes | Switch mode |
| GET | `/api/history/:symbol` | Yes | Get historical candles (Coinbase/Upstox) |
| GET | `/api/strategies` | Yes | List strategies for authenticated user |
| GET | `/api/strategies/:id` | Yes | Fetch full code for a strategy |
| POST | `/api/strategies` | Yes | Create or update strategy |
| DELETE | `/api/strategies/:id` | Yes | Remove strategy |
| POST | `/api/webhook/trade` | Static Token | Webhook update called by Make.com |
| GET | `/api/trades` | Yes | Fetch trade log history from DB |
| POST | `/api/order` | Yes | Place order on Upstox broker |
