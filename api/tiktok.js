'use strict';

const { normalizeTikTokUrl } = require('../lib/validate');
const { fetchTikwmData } = require('../lib/tikwm');
const { normalizeTikwmData } = require('../lib/normalize');
const { probeVideo } = require('../lib/ffprobe');
const { assertNotRateLimited } = require('../lib/rateLimit');
const { AppError, ErrorCodes } = require('../lib/errors');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function sendJson(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

/**
 * POST /api/tiktok
 * Body: { "url": "https://www.tiktok.com/@user/video/123", "includeTechnical": true }
 *
 * Never requires or returns any secret — this endpoint holds no bot
 * token. Set API_ACCESS_KEY in your Vercel project if you want to gate
 * access with an `X-Api-Key` header (useful once this is public-ish).
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' });
  }

  if (process.env.API_ACCESS_KEY) {
    const key = req.headers['x-api-key'];
    if (key !== process.env.API_ACCESS_KEY) {
      return sendJson(res, 401, {
        ok: false,
        error: ErrorCodes.UNAUTHORIZED,
        message: 'Missing or invalid X-Api-Key header.',
      });
    }
  }

  try {
    assertNotRateLimited(`ip:${getClientIp(req)}`);
  } catch (err) {
    return sendJson(res, 429, { ok: false, error: err.code, message: err.message, meta: err.meta });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const { url, includeTechnical = true } = body;

  let tiktokUrl;
  try {
    tiktokUrl = normalizeTikTokUrl(url);
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.code, message: err.message });
  }

  try {
    const raw = await fetchTikwmData(tiktokUrl);
    const meta = normalizeTikwmData(raw);

    let technical = null;
    if (includeTechnical) {
      const probeUrl = meta.media.hdPlayUrl || meta.media.playUrl;
      technical = await probeVideo(probeUrl);
    }

    return sendJson(res, 200, { ok: true, sourceUrl: tiktokUrl, data: meta, technical });
  } catch (err) {
    if (err instanceof AppError) {
      const status = err.code === ErrorCodes.RATE_LIMITED ? 429 : 502;
      return sendJson(res, status, { ok: false, error: err.code, message: err.message });
    }
    console.error('Unexpected /api/tiktok error:', err);
    return sendJson(res, 500, { ok: false, error: ErrorCodes.UNKNOWN, message: 'Unexpected server error.' });
  }
};
