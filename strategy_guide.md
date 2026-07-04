# Trade Desk — Strategy Development Guide

Welcome to the Trade Desk Strategy Terminal! This guide is designed for developers and traders who are new to this system. It covers our current technology stack, the architecture of the Strategy Terminal, the Javascript DSL API, rules to follow, and how to write, test, and save strategies.

---

## 🛠️ Current Technology Stack

The Trade Desk dashboard uses the following tech stack:

- **Backend:** Node.js (Express) serves the REST APIs, indexes MCX & NSE symbols, manages the paper/live order routing, and handles real-time WebSocket feeds from **Upstox V3 API** (using Protobuf encoding) and **Binance WebSocket** (for BTC/USDT).
- **Frontend:** React 18 + Vite 6 + TailwindCSS 3.
- **Charts:** TradingView's high-performance open-source charting library: `lightweight-charts` (v4).
- **Local Database:** Strategies are stored as a JSON array in [strategies.json](file:///e:/upstox-dashboard/upstox-dashboard/strategies.json) in the project root folder.

---

## 📐 Strategy Terminal Architecture

Instead of compiling complex languages like Python or Pine Script on the server side, the Strategy Terminal uses a **Client-Side JavaScript DSL Engine** powered by `new Function()`.

```
                        ┌────────────────────────┐
                        │   Vite React Front     │
                        │   (Strategy Editor)    │
                        └───────────┬────────────┘
                                    │ Runs Javascript DSL
                                    ▼
                        ┌────────────────────────┐
                        │  strategyRunner.js     │
                        │  (Executes in Browser) │
                        └───────────┬────────────┘
                                    │ Evaluates Candles
                                    ▼
┌────────────────────────┐     ┌────┴───────────────────┐
│     ChartPanel         │◄────┤ Result: Signals/Plots  │
│ (Renders Arrows/Plots) │     └────────────────────────┘
└────────────────────────┘
```

### Why this is awesome:
1. **Execution speed:** Backtests process 1,000+ candles in less than 5 milliseconds.
2. **Instant validation:** JavaScript syntax errors are captured in real-time as you type, indicating the exact line number.
3. **No extra API keys:** It uses the historical candle data already fetched by the backend from Upstox.

---

## 📚 JavaScript DSL API Reference

When writing code in the strategy editor, several globally-scoped arrays, indicators, and strategy objects are injected automatically. You do **not** need to import anything.

### 1. Market Data Series
These arrays are aligned by index to the list of candles.
* `close` (Array of numbers): The closing price of each bar.
* `open` (Array of numbers): The opening price of each bar.
* `high` (Array of numbers): The highest price of each bar.
* `low` (Array of numbers): The lowest price of each bar.
* `volume` (Array of numbers): The volume traded in each bar.
* `bars` (Array of objects): The full candle list where each object has: `{ time, open, high, low, close, volume }`.

---

### 2. Technical Analysis (`ta` Namespace)
The `ta` library contains popular technical analysis indicators. Each function returns an array of numbers (or objects) of the same length as the candles.

| Function | Arguments | Returns | Description |
|:---|:---|:---|:---|
| `ta.sma` | `(src, period)` | `number[]` | Simple Moving Average |
| `ta.ema` | `(src, period)` | `number[]` | Exponential Moving Average |
| `ta.rsi` | `(src, period)` | `number[]` | Relative Strength Index (0 to 100) |
| `ta.atr` | `(period)` | `number[]` | Average True Range |
| `ta.vwap` | `()` | `number[]` | Volume Weighted Average Price |
| `ta.obv` | `()` | `number[]` | On-Balance Volume |
| `ta.volumeMa`| `(period)` | `number[]` | Moving average of the trading volume |
| `ta.macd` | `(src, fast, slow, signal)` | `[macd[], signal[], histogram[]]` | MACD line, Signal line, and Histogram arrays |
| `ta.bb` | `(src, period, stddev)` | `[upper[], middle[], lower[]]` | Bollinger Bands boundary lines |
| `ta.supertrend`| `(factor, period)` | `[value[], direction[]]` | SuperTrend indicator band and trend direction (+1/-1) |
| `ta.stoch` | `(kPeriod, dPeriod)` | `[k[], d[]]` | Stochastic Oscillator %K and %D lines |
| `ta.adx` | `(period)` | `number[]` | Welles Wilder's Average Directional Index |

#### Trend Crossover Checkers:
* `ta.crossover(arrayA, arrayB, i)`: Returns `true` if `arrayA` crossed above `arrayB` at index `i`.
* `ta.crossunder(arrayA, arrayB, i)`: Returns `true` if `arrayA` crossed below `arrayB` at index `i`.

---

### 3. Execution Commands (`strategy` Namespace)
Call these functions inside loops to issue trading signals. Each signal records a trade that will render on the chart.

* `strategy.buy(barIndex, label)`: Places a **BUY** marker (green arrow up ▲ below candle).
* `strategy.sell(barIndex, label)`: Places a **SELL** marker (red arrow down ▼ above candle).
* `strategy.close(barIndex, label)`: Places a **CLOSE** marker (gray circle ◆ on candle).
* `strategy.alert(condition, message, barIndex?)`: Triggers an alert when `condition` is true. Logs to output and updates the Alert Log.

---

### 4. Custom Plotting
Draw values on the main chart area for verification.
* `plot(seriesArray, label, colorHex)`: Draws a line chart.
  - *Example:* `plot(ma50, "MA 50", "#2962FF")`

---

### 5. Custom Drawings & Labels (`chart` Namespace)
Draw lines and text labels directly onto the chart overlay.

* `chart.drawLine(id, x1, y1, x2, y2, options)`: Draws a line segment from `(x1, y1)` to `(x2, y2)`.
  - `id` (string): Unique identifier. Redrawing updates the line rather than duplicating it.
  - `x1`, `x2` (number): Bar index or timestamp.
  - `y1`, `y2` (number): Price levels.
  - `options` (object): `{ color, width, style: 'solid'|'dashed', extendRight: boolean }`.
* `chart.drawLabel(id, x, y, text, options)`: Renders text relative to coordinate `(x, y)`.
  - `id` (string): Unique identifier.
  - `x` (number): Bar index or timestamp.
  - `y` (number): Price level.
  - `text` (string): Display text.
  - `options` (object): `{ color, textColor, position: 'left'|'right'|'above'|'below' }`.

---

### 6. Performance Dashboard (`dashboard` Namespace)
Renders a custom stats summary panel in the top-right corner of the chart area.

* `dashboard.set(rowLabel, value, colorHex)`: Sets a row metric.
  - `rowLabel` (string): Metric title (e.g., `"Win Rate"`).
  - `value` (string/number): Display value (e.g., `"71.4%"`).
  - `colorHex` (string): Hex color code for the value.

---

## 🚦 Important Coding Rules to Follow

When writing custom backtesting code, keep these rules in mind:

1. **Loop Index Start (`i = 1` or higher):**  
   Always start loops at index `1` (or higher if indicator periods require it). Starting at `0` will crash `ta.crossover` or `ta.crossunder` because they inspect `i - 1`.
   ```js
   // CORRECT:
   for (let i = 1; i < bars.length; i++) { ... }
   ```
2. **Warm-up Period / Null Checks:**  
   Technical indicators need a warm-up period. For example, `ta.sma(close, 20)` will contain `null` values for the first 19 indexes. Avoid checking values if they are null.
   ```js
   const ma = ta.sma(close, 50);
   for (let i = 50; i < bars.length; i++) {
     if (close[i] > ma[i]) { ... }
   }
   ```
3. **Use the index parameter (`i`):**  
   Always pass the current loop index `i` into comparison helpers:
   ```js
   if (ta.crossover(fast, slow, i)) { ... }
   ```

---

## 🚀 Step-by-Step: Writing Your First Strategy

Here is how a new developer can get started in 2 minutes:

1. **Open the Terminal Tab:** Click the **Terminal** tab at the top of the right sidebar.
2. **Select or Create a Strategy:** Click **+ New** to clear the editor.
3. **Name the Strategy:** Click the name bar under the toolbar (which defaults to "Untitled Strategy") and rename it (e.g., "EMA Crossover 5m").
4. **Paste / Write Code:** Copy-paste this starter code:
   ```js
   const fast = ta.ema(close, 9)
   const slow = ta.ema(close, 21)
   

   for (let i = 21; i < bars.length; i++) {
     if (ta.crossover(fast, slow, i)) {
       strategy.buy(i, 'Golden Cross')
     }
     if (ta.crossunder(fast, slow, i)) {
       strategy.sell(i, 'Death Cross')
     }
   }

   plot(fast, 'EMA 9', '#00ff88')
   plot(slow, 'EMA 21', '#ff0055')
   ```
5. **Run the Backtest:** Click **▶ Run** (or press `Shift + Enter`).
   - The stats bar will update with backtesting results.
   - Buy/Sell arrows and lines will overlay on your active chart.
6. **Save Your Strategy:** Click **Save**. The strategy code is now saved inside `strategies.json`.

---

## 💡 Templates & Examples

### Template A: RSI Overbought/Oversold Reversal
```js
const rsi = ta.rsi(close, 14)

for (let i = 14; i < bars.length; i++) {
  // Buy when RSI crosses above oversold line (30)
  if (rsi[i-1] <= 30 && rsi[i] > 30) {
    strategy.buy(i, 'RSI Buy')
  }
  // Sell when RSI crosses below overbought line (70)
  if (rsi[i-1] >= 70 && rsi[i] < 70) {
    strategy.sell(i, 'RSI Sell')
  }
}
```

### Template B: Bollinger Bands Mean Reversion
```js
const [upper, middle, lower] = ta.bb(close, 20, 2)

for (let i = 20; i < bars.length; i++) {
  // Buy when price hits or crosses below the lower band
  if (close[i] <= lower[i]) {
    strategy.buy(i, 'BB Lower Touch')
  }
  // Sell when price hits or crosses above the upper band
  if (close[i] >= upper[i]) {
    strategy.sell(i, 'BB Upper Touch')
  }
}

plot(upper, 'BB Upper', '#e06b6b')
plot(lower, 'BB Lower', '#6bbf6b')
```
