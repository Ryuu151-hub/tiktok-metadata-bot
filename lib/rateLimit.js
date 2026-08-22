'use strict';

const { AppError, ErrorCodes } = require('./errors');

// In-memory only: this resets on cold start and is scoped to a single
// warm Lambda instance, so under real multi-instance traffic it's a
// soft limiter rather than a hard cross-instance guarantee. That's
// enough to stop one chat/IP from hammering TikWM in a loop, which is
// the main goal here. For strict cross-instance limiting in
// production, swap the Map below for Upstash Redis (@upstash/ratelimit)
// or Vercel KV behind the same assertNotRateLimited(key) interface.
const hits = new Map();

const MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX || 5);
const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);

/**
 * Throws AppError(RATE_LIMITED) if `key` has made too many requests
 * within the current window; otherwise records this request and
 * returns normally.
 */
function assertNotRateLimited(key) {
  const now = Date.now();
  const timestamps = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    const retryAfterMs = Math.max(WINDOW_MS - (now - timestamps[0]), 0);
    throw new AppError(ErrorCodes.RATE_LIMITED, 'Too many requests — please slow down.', { retryAfterMs });
  }

  timestamps.push(now);
  hits.set(key, timestamps);
}

module.exports = { assertNotRateLimited };
