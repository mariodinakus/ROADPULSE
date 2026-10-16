'use strict';
/**
 * Best-effort abuse controls for a public, stateless Vercel app.
 * Counters are held per warm runtime instance, NOT shared between instances;
 * this deliberately does not pretend to be a global WAF or a billing cap.
 */
const crypto = require('node:crypto');
const salt = crypto.randomBytes(32);
const buckets = new Map();
let requestsSeen = 0;

function clientId(req) {
  const raw = req.headers?.['x-real-ip'] || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const ip = String(Array.isArray(raw) ? raw[0] : raw).split(',')[0].trim().slice(0, 128);
  return crypto.createHmac('sha256', salt).update(ip || 'unknown').digest('hex').slice(0, 24);
}

function take(key, max, durationMs, now = Date.now()) {
  // Fixed windows are cheap and deterministic. They are intentionally generous for tiles.
  const start = Math.floor(now / durationMs) * durationMs;
  const id = `${key}:${durationMs}:${start}`;
  const used = buckets.get(id) || 0;
  if (used >= max) return { allowed: false, retryAfter: Math.max(1, Math.ceil((start + durationMs - now) / 1000)) };
  buckets.set(id, used + 1);
  if (++requestsSeen % 250 === 0 || buckets.size > 4096) {
    for (const stored of buckets.keys()) {
      const parts = stored.split(':');
      const window = Number(parts[parts.length - 2]);
      const began = Number(parts[parts.length - 1]);
      if (began + window <= now) buckets.delete(stored);
    }
    if (buckets.size > 8192) buckets.clear(); // Fail open on memory pressure instead of crashing.
  }
  return { allowed: true, retryAfter: 0 };
}

function reject(res, seconds = 60) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Retry-After', String(seconds));
  return res.status(429).json({ error: 'Too many requests. Please try again later.' });
}

function protect(req, res, { name, perMinute, perDay = null, totalPerMinute = null, totalPerDay = null }) {
  // Block cross-site browser subresource hotlinking (not a substitute for authentication).
  if (req.headers?.['sec-fetch-site'] === 'cross-site') {
    res.setHeader('Cache-Control', 'no-store');
    return { ok: false, response: res.status(403).json({ error: 'Cross-site API access is not permitted.' }) };
  }
  const user = clientId(req);
  const checks = [
    [name + ':minute:' + user, perMinute, 60_000],
    ...(perDay ? [[name + ':day:' + user, perDay, 86_400_000]] : []),
    ...(totalPerMinute ? [[name + ':instance-minute', totalPerMinute, 60_000]] : []),
    ...(totalPerDay ? [[name + ':instance-day', totalPerDay, 86_400_000]] : []),
  ];
  // Check all windows before incrementing any: don't spend global budget on denied requests.
  const now = Date.now();
  for (const [key, max, duration] of checks) {
    const start = Math.floor(now / duration) * duration;
    if ((buckets.get(`${key}:${duration}:${start}`) || 0) >= max) {
      const seconds = Math.max(1, Math.ceil((start + duration - now) / 1000));
      return { ok: false, response: reject(res, seconds) };
    }
  }
  for (const [key, max, duration] of checks) take(key, max, duration, now);
  return { ok: true };
}

module.exports = { protect, reject, clientId, take };
