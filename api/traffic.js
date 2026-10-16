/** ROADPULSE TomTom flow proxy. Key is available ONLY to the Vercel function. */
module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return res.status(503).json({ error: 'Traffic unavailable: production key not configured.' });

  // Traffic at zooms 9–18 only, saving provider quota. Never act as an arbitrary URL proxy.
  const params = ['z', 'x', 'y'].map(k => req.query?.[k]);
  if (params.some(p => typeof p !== 'string' || !/^\d{1,9}$/.test(p))) {
    return res.status(400).json({ error: 'Invalid tile coordinates' });
  }
  const [z, x, y] = params.map(Number);
  if (z < 9 || z > 18 || x >= 2 ** z || y >= 2 ** z) {
    return res.status(400).json({ error: 'Tile coordinates out of range' });
  }
  const style = req.query?.theme === 'dark' ? 'dark' : 'light';
  const upstream = `https://api.tomtom.com/maps/orbis/traffic/flow/raster/tile/${z}/${x}/${y}?apiVersion=2&style=${style}&tileSize=256`;
  try {
    const r = await fetch(upstream, {
      headers: { 'TomTom-Api-Key': key, Accept: 'image/png' },
      signal: AbortSignal.timeout(8500)
    });
    if (!r.ok) {
      res.setHeader('Cache-Control', 'no-store');
      if (r.status === 429) res.setHeader('Retry-After', '60');
      return res.status(r.status === 429 ? 429 : 502).json({ error: r.status === 429 ? 'Traffic rate limit reached' : 'Traffic source unavailable' });
    }
    if (!(r.headers.get('content-type') || '').toLowerCase().startsWith('image/png')) {
      return res.status(502).json({ error: 'Invalid traffic tile response' });
    }
    const length = Number(r.headers.get('content-length') || 0);
    if (length > 1024 * 1024) return res.status(502).json({ error: 'Unexpected traffic tile size' });
    const tile = Buffer.from(await r.arrayBuffer());
    if (tile.length > 1024 * 1024) return res.status(502).json({ error: 'Unexpected traffic tile size' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=60');
    return res.status(200).send(tile);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Traffic source temporarily unreachable' });
  }
};
