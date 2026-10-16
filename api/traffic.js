module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return res.status(503).json({ error: 'Live traffic is not configured. Set TOMTOM_API_KEY on Vercel.' });
  const z = Number(req.query.z), x = Number(req.query.x), y = Number(req.query.y);
  if (![z,x,y].every(Number.isInteger) || z < 0 || z > 22 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
    return res.status(400).json({ error: 'Invalid tile coordinates' });
  }
  try {
    const style = req.query.theme === 'light' ? 'light' : 'dark';
    const upstream = `https://api.tomtom.com/maps/orbis/traffic/flow/raster/tile/${z}/${x}/${y}?apiVersion=2&style=${style}&tileSize=256`;
    const r = await fetch(upstream, {
      headers: { 'TomTom-Api-Key': key, 'Accept': 'image/png' },
      signal: AbortSignal.timeout(8500)
    });
    if (!r.ok) return res.status(r.status >= 500 ? 502 : r.status).json({ error: 'Traffic provider unavailable', providerStatus: r.status });
    const ct = r.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return res.status(502).json({error:'Unexpected traffic response'});
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=90');
    return res.status(200).send(Buffer.from(await r.arrayBuffer()));
  } catch {
    return res.status(502).json({ error: 'Traffic tile timed out' });
  }
};
