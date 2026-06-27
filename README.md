# ⚡ Live Trading Dashboard — Upstox + Make.com

Real-time Indian stock & crude oil chart dashboard with strategy alerts sent to Make.com via webhook.

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure your tokens
Edit the `.env` file:
```env
UPSTOX_ACCESS_TOKEN=your_actual_token_here
MAKE_WEBHOOK_URL=https://hook.eu1.make.com/your_webhook_id
PORT=3000
```

### 3. Start the server
```bash
npm start
```
Open http://localhost:3000

---

## 🔑 Getting Your Upstox Token

### Option A — Analytics Token (Recommended, 1 Year Valid)
1. Go to https://developer.upstox.com
2. Create an App → get API Key + Secret
3. Go to **Analytics Token** section
4. Generate token → copy to `.env`
5. ✅ Valid for 1 year, no daily refresh!

### Option B — Standard Access Token (Daily)
1. Same developer portal
2. Use OAuth flow daily to get access token
3. Paste in `.env`

---

## 📊 Instruments Tracked
| Display Name | Exchange | Type |
|---|---|---|
| NIFTY50 | NSE | Index |
| BANKNIFTY | NSE | Index |
| RELIANCE | NSE | Equity |
| TCS | NSE | Equity |
| HDFC BANK | NSE | Equity |
| CRUDE OIL | MCX | Futures |

---

## 🔔 Make.com Webhook Setup
1. Go to https://make.com → Create scenario
2. Add **Webhooks → Custom webhook** as trigger
3. Copy the webhook URL
4. Paste in `.env` as `MAKE_WEBHOOK_URL`
5. Connect to Gmail/Telegram/Slack etc. for notifications

### Payload sent to Make.com:
```json
{
  "symbol": "NIFTY50",
  "strategy": "ema_cross",
  "price": 22456.75,
  "signal": "BUY",
  "message": "EMA 9/21 Crossover — BUY on NIFTY50 @ 22456.75",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "source": "Upstox Dashboard"
}
```

---

## 🎯 Strategies Available
- **Manual Signal** — Click BUY/SELL anytime
- **EMA Crossover (9/21)** — Classic trend strategy
- **RSI Overbought/Oversold** — Set threshold
- **Price Breakout** — Set a price level
- **Custom Note** — Write your own message

---

## 📁 Project Structure
```
upstox-dashboard/
├── server.js          ← Express + WebSocket proxy server
├── public/
│   └── index.html     ← Full dashboard UI
├── .env               ← Your tokens (never commit this!)
├── package.json
└── README.md
```

---

## 🛠️ Demo Mode
If no token is set, the dashboard runs in **DEMO mode** with simulated real-time data — perfect for testing your strategies and Make.com webhook before going live.
