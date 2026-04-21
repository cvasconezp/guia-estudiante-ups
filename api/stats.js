// Vercel Serverless Function - Get analytics stats (admin only)

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth check
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const sections = ['home','avac','calificaciones','contrasena','deudas',
      'evaluacion','record','practica','adicion','correo','2fa','carnet','canales'];

    // Get total views
    const totalRes = await redis(["GET", "stats:total_views"]);
    const totalViews = parseInt(totalRes.result) || 0;

    // Get last 30 days data
    const today = new Date();
    const dailyCommands = [];
    const visitorCommands = [];
    const dates = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
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

    // Get today's hourly data
    const todayKey = today.toISOString().split('T')[0];
    const hourlyCommands = [];
    for (let h = 0; h < 24; h++) {
      hourlyCommands.push(["GET", `stats:hourly:${todayKey}:${h}`]);
    }
    const hourlyResults = await pipeline(hourlyCommands);
    const hourlyData = Array.from({length: 24}, (_, i) => ({
      hour: i,
      views: parseInt(hourlyResults[i]?.result) || 0
    }));

    // Today's stats
    const todayViews = dailyViews[dailyViews.length - 1]?.views || 0;
    const todayVisitors = dailyViews[dailyViews.length - 1]?.visitors || 0;
    const yesterdayViews = dailyViews[dailyViews.length - 2]?.views || 0;

    return res.status(200).json({
      totalViews,
      todayViews,
      todayVisitors,
      yesterdayViews,
      dailyViews,
      sectionStats,
      hourlyData,
      generatedAt: new Date().toISOString()
    });
  } catch (e) {
    console.error('Stats error:', e);
    return res.status(500).json({ error: 'Internal error' });
  }
}
