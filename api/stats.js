// Vercel Serverless Function - Get analytics stats (admin only)
// Timezone: America/Guayaquil (Ecuador, UTC-5)

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ups2024admin';

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

async function pipeline(commands) {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  return res.json();
}

function getEcuadorTime() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc - 5 * 3600000);
}

function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sections = ['home','avac','calificaciones','contrasena','deudas',
      'evaluacion','record','practica','adicion','correo','2fa','carnet','canales','certificados','pagos','becas','retiro','pago-boton','pago-pichincha','pago-pichincha-app','pago-pacifico','idiomas','idiomas-cest'];

    const devices = ['desktop', 'mobile', 'tablet'];
    const browsers = ['chrome', 'firefox', 'safari', 'edge', 'opera', 'otro'];
    const osList = ['windows', 'macos', 'android', 'ios', 'linux', 'otro'];

    // Get total views
    const totalRes = await redis(["GET", "stats:total_views"]);
    const totalViews = parseInt(totalRes.result) || 0;

    // Get last 30 days data using Ecuador timezone
    const ecNow = getEcuadorTime();
    const dailyCommands = [];
    const visitorCommands = [];
    const dates = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(ecNow);
      d.setDate(d.getDate() - i);
      const key = formatDateKey(d);
      dates.push(key);
      dailyCommands.push(["GET", `stats:daily:${key}`]);
      visitorCommands.push(["SCARD", `stats:visitors:${key}`]);
    }

    const dailyResults = await pipeline(dailyCommands);
    const visitorResults = await pipeline(visitorCommands);

    const dailyViews = dates.map((date, i) => ({
      date,
      views: parseInt(dailyResults[i]?.result) || 0,
      visitors: parseInt(visitorResults[i]?.result) || 0
    }));

    // Get section stats
    const sectionCommands = sections.map(s => ["GET", `stats:section:${s}`]);
    const sectionResults = await pipeline(sectionCommands);
    const sectionStats = {};
    sections.forEach((s, i) => {
      sectionStats[s] = parseInt(sectionResults[i]?.result) || 0;
    });

    // Get today's hourly data (Ecuador timezone)
    const todayKey = formatDateKey(ecNow);
    const hourlyCommands = [];
    for (let h = 0; h < 24; h++) {
      hourlyCommands.push(["GET", `stats:hourly:${todayKey}:${h}`]);
    }
    const hourlyResults = await pipeline(hourlyCommands);
    const hourlyData = Array.from({length: 24}, (_, i) => ({
      hour: i,
      views: parseInt(hourlyResults[i]?.result) || 0
    }));

    // Get device stats
    const deviceCommands = devices.map(d => ["GET", `stats:device:${d}`]);
    const deviceResults = await pipeline(deviceCommands);
    const deviceStats = {};
    devices.forEach((d, i) => {
      deviceStats[d] = parseInt(deviceResults[i]?.result) || 0;
    });

    // Get browser stats
    const browserCommands = browsers.map(b => ["GET", `stats:browser:${b}`]);
    const browserResults = await pipeline(browserCommands);
    const browserStats = {};
    browsers.forEach((b, i) => {
      browserStats[b] = parseInt(browserResults[i]?.result) || 0;
    });

    // Get OS stats
    const osCommands = osList.map(o => ["GET", `stats:os:${o}`]);
    const osResults = await pipeline(osCommands);
    const osStats = {};
    osList.forEach((o, i) => {
      osStats[o] = parseInt(osResults[i]?.result) || 0;
    });

    // Today's stats
    const todayViews = dailyViews[dailyViews.length - 1]?.views || 0;
    const todayVisitors = dailyViews[dailyViews.length - 1]?.visitors || 0;
    const yesterdayViews = dailyViews[dailyViews.length - 2]?.views || 0;

    // Generate timestamp in Ecuador time
    const ecTime = getEcuadorTime();
    const generatedAt = ecTime.toISOString().replace('Z', '-05:00');

    return res.status(200).json({
      totalViews,
      todayViews,
      todayVisitors,
      yesterdayViews,
      dailyViews,
      sectionStats,
      hourlyData,
      deviceStats,
      browserStats,
      osStats,
      timezone: 'America/Guayaquil (UTC-5)',
      generatedAt
    });
  } catch (e) {
    console.error('Stats error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
