require('dotenv').config();
const { createClient } = require('@libsql/client');

if (!process.env.TURSO_DB_URL || !process.env.TURSO_DB_TOKEN) {
  console.error('❌ Error: TURSO_DB_URL and TURSO_DB_TOKEN must be set in .env');
  process.exit(1);
}

const db = createClient({
  url: process.env.TURSO_DB_URL,
  authToken: process.env.TURSO_DB_TOKEN
});

async function main() {
  console.log('🏁 Adding user_settings table to database...');
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS user_settings (
        user_id TEXT PRIMARY KEY,
        watchlist TEXT,
        ticker TEXT,
        paper_positions TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );
    `);
    console.log('✅ user_settings table created successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  }
}

main();
