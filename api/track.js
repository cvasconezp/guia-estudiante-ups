// Vercel Serverless Function - Track page visits
// Uses Upstash Redis REST API

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redis(command) {
  const res = await fetch(`${UPSTASH_URL}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  return res.json();
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { section, referrer } = req.body || {};
    const now = new Date();
    const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const hourKey = now.getHours();

    // Increment total page views
    await redis(["INCR", "stats:total_views"]);

    // Increment daily views
    await redis(["INCR", `stats:daily:${dateKey}`]);

    // Increment hourly views for today
    await redis(["INCR", `stats:hourly:${dateKey}:${hourKey}`]);

    // Increment section views
    if (section) {
      await redis(["INCR", `stats:section:${section}`]);
      await redis(["INCR", `stats:section_daily:${dateKey}:${section}`]);
    }

    // Track unique visitors by date (approximate via IP hash)
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    const visitorHash = Buffer.from(ip).toString('base64').substring(0, 12);
    await redis(["SADD", `stats:visitors:${dateKey}`, visitorHash]);

    // Store referrer if present
    if (referrer && referrer !== '') {
      await redis(["INCR", `stats:referrer:${referrer}`]);
    }

    // Keep track of active dates (last 90 days)
    await redis(["SADD", "stats:dates", dateKey]);

    // Set TTL on daily keys (90 days)
    await redis(["EXPIRE", `stats:daily:${dateKey}`, 7776000]);
    await redis(["EXPIRE", `stats:visitors:${dateKey}`, 7776000]);
    await redis(["EXPIRE", `stats:hourly:${dateKey}:${hourKey}`, 7776000]);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Track error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
