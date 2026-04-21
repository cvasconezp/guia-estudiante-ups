// Vercel Serverless Function - Track page visits
// Uses Upstash Redis REST API
// Timezone: America/Guayaquil (Ecuador, UTC-5)

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

function getEcuadorTime() {
  // Ecuador is UTC-5 (no DST)
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ec = new Date(utc - 5 * 3600000);
  return ec;
}

function detectDevice(ua) {
  if (!ua) return 'desktop';
  ua = ua.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet';
  if (/android/.test(ua) && !/mobile/.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android.*mobile|blackberry|iemobile|opera mini|opera mobi|windows phone/.test(ua)) return 'mobile';
  return 'desktop';
}

function detectBrowser(ua) {
  if (!ua) return 'otro';
  ua = ua.toLowerCase();
  if (/edg\//.test(ua)) return 'edge';
  if (/opr\/|opera/.test(ua)) return 'opera';
  if (/chrome|crios/.test(ua)) return 'chrome';
  if (/firefox|fxios/.test(ua)) return 'firefox';
  if (/safari/.test(ua) && !/chrome/.test(ua)) return 'safari';
  return 'otro';
}

function detectOS(ua) {
  if (!ua) return 'otro';
  ua = ua.toLowerCase();
  if (/windows/.test(ua)) return 'windows';
  if (/macintosh|mac os/.test(ua)) return 'macos';
  if (/android/.test(ua)) return 'android';
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/linux/.test(ua)) return 'linux';
  return 'otro';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { section, referrer } = req.body || {};
    const ec = getEcuadorTime();
    const dateKey = ec.toISOString().split('T')[0]; // YYYY-MM-DD in Ecuador time
    const hourKey = ec.getHours(); // Hour in Ecuador time

    const ua = req.headers['user-agent'] || '';
    const device = detectDevice(ua);
    const browser = detectBrowser(ua);
    const os = detectOS(ua);

    // Increment total page views
    await redis(["INCR", "stats:total_views"]);

    // Increment daily views (Ecuador timezone)
    await redis(["INCR", `stats:daily:${dateKey}`]);

    // Increment hourly views (Ecuador timezone)
    await redis(["INCR", `stats:hourly:${dateKey}:${hourKey}`]);

    // Increment section views
    if (section) {
      await redis(["INCR", `stats:section:${section}`]);
      await redis(["INCR", `stats:section_daily:${dateKey}:${section}`]);
    }

    // Track unique visitors by date
    const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
    const visitorHash = Buffer.from(ip).toString('base64').substring(0, 12);
    await redis(["SADD", `stats:visitors:${dateKey}`, visitorHash]);

    // Store referrer if present
    if (referrer && referrer !== '') {
      await redis(["INCR", `stats:referrer:${referrer}`]);
    }

    // Track device, browser, OS
    await redis(["INCR", `stats:device:${device}`]);
    await redis(["INCR", `stats:device_daily:${dateKey}:${device}`]);
    await redis(["INCR", `stats:browser:${browser}`]);
    await redis(["INCR", `stats:os:${os}`]);

    // Keep track of active dates
    await redis(["SADD", "stats:dates", dateKey]);

    // Set TTL on daily keys (90 days)
    await redis(["EXPIRE", `stats:daily:${dateKey}`, 7776000]);
    await redis(["EXPIRE", `stats:visitors:${dateKey}`, 7776000]);
    await redis(["EXPIRE", `stats:hourly:${dateKey}:${hourKey}`, 7776000]);
    await redis(["EXPIRE", `stats:device_daily:${dateKey}:${device}`, 7776000]);

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Track error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
