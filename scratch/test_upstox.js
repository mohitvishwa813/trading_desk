const axios = require('axios');
require('dotenv').config();

const ACCESS_TOKEN = process.env.UPSTOX_ACCESS_TOKEN;

async function test() {
  const instrumentKey = 'NSE_INDEX|Nifty 50';
  const toStr = '2026-06-30';
  const fromStr = '2026-06-25';
  // V3 Historical URL: /v3/historical-candle/{instrumentKey}/{interval_unit}/{interval_value}/{to_date}/{from_date}
  const url = `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/minutes/1/${toStr}/${fromStr}`;
  
  try {
    const resp = await axios.get(url, {
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, Accept: 'application/json' }
    });
    console.log('candles count:', resp.data?.data?.candles?.length);
    if (resp.data?.data?.candles?.length > 0) {
      console.log('first candle:', resp.data.data.candles[0]);
      console.log('last candle:', resp.data.data.candles[resp.data.data.candles.length - 1]);
    } else {
      console.log('response:', resp.data);
    }
  } catch (err) {
    console.error('error:', err.response?.data || err.message);
  }
}

test();
