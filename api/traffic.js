'use strict';
/** Traffic proxy: TomTom key stays server-side; short-lived cache and abuse guard. */
const { protect, reject } = require('../lib/abuse-guard.cjs');
const MAX_TILE_BYTES = 1_048_576;
const LOCAL_CACHE_TTL = 120_000;
const MAX_LOCAL_TILES = 120;
const tiles = new Map();
const inflight = new Map();
let concurrentUpstream = 0;

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return res.status(503).json({ error: 'Traffic is not configured.' });

  // Never proxy arbitrary URLs. Only tile coordinates on the allowed zooms.
  const fields = ['z', 'x', 'y'].map(k => req.query?.[k]);
  if (fields.some(p => typeof p !== 'string' || !/^\d{1,9}$/.test(p))) {
    return res.status(400).json({ error: 'Invalid tile coordinates' });
  }
  const [z, x, y] = fields.map(Number);
  if (z < 9 || z > 18 || x >= 2 ** z || y >= 2 ** z) {
    return res.status(400).json({ error: 'Tile coordinates out of range' });
  }
  if (req.query?.theme && !['dark', 'light'].includes(req.query.theme)) {
    return res.status(400).json({ error: 'Invalid map theme' });
  }
  const style = req.query?.theme === 'dark' ? 'dark' : 'light';
  const ipLimit = protect(req, res, { name: 'traffic', perMinute: 180, perDay: 1200 });
  if (!ipLimit.ok) return ipLimit.response;

  const cacheKey = `${style}:${z}:${x}:${y}`;
  const cached = tiles.get(cacheKey);
  if (cached && Date.now() < cached.expires) return sendTile(res, cached.body);
  if (cached) tiles.delete(cacheKey);

  // Conserve the external provider quota per warm instance. These limits are
  // not global across Vercel instances; a distributed WAF would still be needed.
  if (!inflight.has(cacheKey)) {
    const quota = protect(req, res, {
      name: 'traffic-upstream', perMinute: 180, totalPerMinute: 250, totalPerDay: 2500
    });
    if (!quota.ok) return quota.response;
    if (concurrentUpstream >= 8) return reject(res, 8);
    const upstream = `https://api.tomtom.com/maps/orbis/traffic/flow/raster/tile/${z}/${x}/${y}?apiVersion=2&style=${style}&tileSize=256`;
    concurrentUpstream++;
    const pending = (async () => {
      const response = await fetch(upstream, {
        headers: { 'TomTom-Api-Key': key, Accept: 'image/png' },
        signal: AbortSignal.timeout(8500)
      });
      if (!response.ok) {
        const e = new Error('Traffic source unavailable');
        e.status = response.status;
        throw e;
      }
      if (!(response.headers.get('content-type') || '').toLowerCase().startsWith('image/png')) {
        throw new Error('Unexpected traffic response');
      }
      const statedLength = Number(response.headers.get('content-length') || 0);
      if (statedLength > MAX_TILE_BYTES) throw new Error('Traffic tile exceeded size limit');
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_TILE_BYTES) throw new Error('Traffic tile exceeded size limit');
      if (tiles.size >= MAX_LOCAL_TILES) tiles.delete(tiles.keys().next().value);
      tiles.set(cacheKey, { body: buffer, expires: Date.now() + LOCAL_CACHE_TTL });
      return buffer;
    })().finally(() => { concurrentUpstream--; inflight.delete(cacheKey); });
    inflight.set(cacheKey, pending);
  }
  try {
    return sendTile(res, await inflight.get(cacheKey));
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    if (error.status === 401 || error.status === 403) {
      res.setHeader('X-ROADPULSE-PROVIDER-STATUS', String(error.status));
      return res.status(502).json({ error: 'TomTom Traffic API key is not authorized for these tiles', providerStatus: error.status });
    }
    if (error.status === 404) {
      return res.status(502).json({ error: 'TomTom traffic tile endpoint not found', providerStatus: 404 });
    }
    if (error.status === 429) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Provider traffic quota temporarily exceeded', providerStatus: 429 });
    }
    if (error.status) return res.status(502).json({error:'TomTom traffic provider error',providerStatus:error.status});
    return res.status(502).json({ error: 'Traffic imagery unavailable right now' });
  }
};

function sendTile(res, data) {
  res.setHeader('Content-Type', 'image/png');
  // CDNs cache equal tiles across visitors. Cache key ignores irrelevant query params.
  // Client refresh IDs are bucketed every 2min to avoid runaway cache-busting.
  res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=120, stale-while-revalidate=60');
  return res.status(200).send(data);
}
