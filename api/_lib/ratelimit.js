// Simple in-memory sliding-window rate limiter that works INSIDE serverless
// handlers (unlike express-rate-limit in server.js, which Vercel never runs).
//
// Caveat: serverless instances each have their own memory, so this is
// per-instance, not global. It still stops the common case of one client
// hammering a warm instance. For a hard global limit, swap this for
// @upstash/ratelimit + Upstash Redis (free tier is plenty for this app).

const buckets = new Map();

export function checkRateLimit(req, res, { windowMs = 60_000, max = 6, name = "default" } = {}) {
  const ip =
    (req.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const key = `${name}:${ip}`;
  const now = Date.now();
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= max) {
    res.status(429).json({ error: "Too many requests — please wait a minute and try again." });
    return false;
  }

  recent.push(now);
  buckets.set(key, recent);

  // Crude memory cap so a scanning botnet can't grow the map forever
  if (buckets.size > 5000) buckets.clear();

  return true;
}
