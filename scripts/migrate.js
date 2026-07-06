require('dotenv').config();
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');

if (!process.env.TURSO_DB_URL || !process.env.TURSO_DB_TOKEN) {
  console.error('❌ Error: TURSO_DB_URL and TURSO_DB_TOKEN must be set in .env');
  process.exit(1);
}

const db = createClient({
  url: process.env.TURSO_DB_URL,
  authToken: process.env.TURSO_DB_TOKEN
});

async function main() {
  console.log('🏁 Starting database migration...');

  try {
    // 1. Create Tables
    console.log('🧱 Creating tables in Turso...');

    // Drop tables if we need to recreate with updated columns
    await db.execute('DROP TABLE IF EXISTS alerts');
    await db.execute('DROP TABLE IF EXISTS paper_trades');
    await db.execute('DROP TABLE IF EXISTS auto_trades');
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS strategies (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL,
        qty INTEGER NOT NULL,
        price REAL NOT NULL,
        status TEXT NOT NULL,
        pnl REAL DEFAULT 0.0,
        created_at TEXT NOT NULL,
        closed_at TEXT,
        comment TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS paper_trades (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL,
        qty INTEGER NOT NULL,
        price REAL NOT NULL,
        status TEXT NOT NULL,
        pnl REAL DEFAULT 0.0,
        created_at TEXT NOT NULL,
        closed_at TEXT,
        comment TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS auto_trades (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        strategy_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        qty INTEGER NOT NULL,
        timeframe TEXT NOT NULL,
        mode TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        last_signal_time INTEGER,
        created_at TEXT NOT NULL,
        stopped_at TEXT,
        candle_style TEXT DEFAULT 'candles',
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        message TEXT NOT NULL,
        price REAL NOT NULL,
        trade_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    console.log('✅ Tables created successfully.');

    // 2. Insert Default Administrator User
    const adminEmail = 'rohit.vishwakarma7575@gmail.com';
    const adminId = 'u_admin_default';
    const existingUser = await db.execute({
      sql: 'SELECT id FROM users WHERE email = ?',
      args: [adminEmail]
    });

    if (existingUser.rows.length === 0) {
      console.log('👤 Creating default admin user (rohit.vishwakarma7575@gmail.com)...');
      const hash = bcrypt.hashSync('Rohit@123', 10);
      await db.execute({
        sql: 'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
        args: [adminId, adminEmail, hash, new Date().toISOString()]
      });
      console.log('✅ Admin user created. Password is: Rohit@123');
    } else {
      console.log('👤 Admin user already exists.');
    }

    // Resolve admin user ID to link dummy data
    const activeUserId = existingUser.rows.length > 0 ? existingUser.rows[0].id : adminId;

    // 3. Clean and Populate Dummy Records
    console.log('🧹 Clearing existing dummy records...');
    await db.execute('DELETE FROM strategies');
    await db.execute('DELETE FROM trades');
    await db.execute('DELETE FROM paper_trades');
    await db.execute('DELETE FROM alerts');

    console.log('🌱 Generating dummy records for strategies, trades, alerts, and paper_trades...');

    const now = new Date();

    // Generate 44 Strategies
    const sampleCode = `// ─── Dummy Trade Desk Strategy ───
const emaFast = ta.ema(close, 9);
const emaSlow = ta.ema(close, 21);
const atrVal  = ta.atr(14);

for (let i = 21; i < bars.length; i++) {
  if (close[i] > emaFast[i] && emaFast[i] > emaSlow[i]) {
    strategy.buy(i, "Buy Trend Continuation");
  }
}`;

    const strategyQueries = [];
    for (let i = 1; i <= 44; i++) {
      const id = `s_dummy_${String(i).padStart(3, '0')}`;
      const name = i % 3 === 0 ? `RSI Scalper ${i}` : i % 2 === 0 ? `EMA Trend Follower ${i}` : `MACD Momentum ${i}`;
      const timeStr = new Date(now.getTime() - i * 3600000 * 2).toISOString();
      strategyQueries.push(db.execute({
        sql: 'INSERT INTO strategies (id, user_id, name, code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        args: [id, activeUserId, name, sampleCode, timeStr, timeStr]
      }));
    }
    await Promise.all(strategyQueries);
    console.log('✅ Generated 44 strategies.');

    // Generate 44 Trades
    const symbols = ['BTCUSD', 'NIFTY', 'CRUDEOILM', 'TCS', 'GOLD1', 'SILVERFUT'];
    const tradeQueries = [];
    for (let i = 1; i <= 44; i++) {
      const id = `t_dummy_${String(i).padStart(3, '0')}`;
      const symbol = symbols[i % symbols.length];
      const direction = i % 2 === 0 ? 'BUY' : 'SELL';
      const qty = (i % 5 + 1) * 10;
      const basePrice = symbol === 'BTCUSD' ? 62000 : symbol === 'NIFTY' ? 24200 : symbol === 'CRUDEOILM' ? 6500 : 3400;
      const price = parseFloat((basePrice + (i * 12.5) * (i % 2 === 0 ? 1 : -1)).toFixed(2));
      const status = i <= 5 ? 'OPEN' : 'CLOSED';
      const pnl = status === 'CLOSED' ? parseFloat(((qty * (i * 2.35)) * (i % 3 === 0 ? -1 : 1)).toFixed(2)) : 0.0;
      const createdTime = new Date(now.getTime() - i * 86400000).toISOString();
      const closedTime = status === 'CLOSED' ? new Date(now.getTime() - (i - 0.5) * 86400000).toISOString() : null;
      const comment = status === 'CLOSED' ? `Closed on SL/TP target target hit` : `Active trade monitored in real-time`;

      tradeQueries.push(db.execute({
        sql: 'INSERT INTO trades (id, user_id, symbol, direction, qty, price, status, pnl, created_at, closed_at, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, activeUserId, symbol, direction, qty, price, status, pnl, createdTime, closedTime, comment]
      }));
    }
    await Promise.all(tradeQueries);
    console.log('✅ Generated 44 trade log records.');

    // Generate 44 paper_trades (seeding them for history)
    const paperTradeQueries = [];
    for (let i = 1; i <= 44; i++) {
      const id = i === 1 ? 't_grouped_001' : i === 2 ? 't_grouped_002' : `pt_dummy_${String(i).padStart(3, '0')}`;
      const symbol = symbols[i % symbols.length];
      const direction = i % 2 === 0 ? 'BUY' : 'SELL';
      const qty = (i % 5 + 1) * 10;
      const basePrice = symbol === 'BTCUSD' ? 62000 : symbol === 'NIFTY' ? 24200 : symbol === 'CRUDEOILM' ? 6500 : 3400;
      const price = parseFloat((basePrice + (i * 12.5) * (i % 2 === 0 ? 1 : -1)).toFixed(2));
      const status = i <= 5 ? 'OPEN' : 'CLOSED';
      const pnl = status === 'CLOSED' ? parseFloat(((qty * (i * 1.5)) * (i % 3 === 0 ? -1 : 1)).toFixed(2)) : 0.0;
      const createdTime = new Date(now.getTime() - i * 86400000).toISOString();
      const closedTime = status === 'CLOSED' ? new Date(now.getTime() - (i - 0.5) * 86400000).toISOString() : null;
      const comment = status === 'CLOSED' ? 'Closed on SL/TP target hit' : 'Active paper trade';

      paperTradeQueries.push(db.execute({
        sql: 'INSERT INTO paper_trades (id, user_id, symbol, direction, qty, price, status, pnl, created_at, closed_at, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, activeUserId, symbol, direction, qty, price, status, pnl, createdTime, closedTime, comment]
      }));
    }
    await Promise.all(paperTradeQueries);
    console.log('✅ Generated 44 paper trades.');

    console.log('🎉 Database migration & seeding completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
