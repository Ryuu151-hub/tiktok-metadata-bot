'use strict';

const { AppError, ErrorCodes } = require('./errors');

const ALLOWED_HOST_SUFFIX = 'tiktok.com';

/**
 * Validates and normalizes a user-supplied TikTok URL.
 * - Adds a scheme if the user pasted a bare domain (e.g. "vm.tiktok.com/xyz").
 * - Rejects anything that isn't an http(s) tiktok.com (sub)domain.
 * Throws AppError(INVALID_URL) on anything that fails those checks.
 * (Short links like vm.tiktok.com / vt.tiktok.com are left as-is —
 * TikWM resolves the redirect on its end, we don't need to follow it.)
 */
function normalizeTikTokUrl(rawInput) {
  if (typeof rawInput !== 'string' || !rawInput.trim()) {
    throw new AppError(ErrorCodes.INVALID_URL, 'No URL was provided.');
  }

  let candidate = rawInput.trim();

  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (err) {
    throw new AppError(ErrorCodes.INVALID_URL, 'That does not look like a valid URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError(ErrorCodes.INVALID_URL, 'Only http(s) URLs are supported.');
  }

  const host = parsed.hostname.toLowerCase();
  const isTikTokHost = host === ALLOWED_HOST_SUFFIX || host.endsWith(`.${ALLOWED_HOST_SUFFIX}`);

  if (!isTikTokHost) {
    throw new AppError(ErrorCodes.INVALID_URL, 'That link is not a tiktok.com URL.');
  }

  return parsed.toString();
}

/**
 * Pulls the first TikTok-looking URL out of an arbitrary chat message,
 * e.g. "check this out https://vm.tiktok.com/ZM8abc123/ thanks".
 * Returns null if no candidate URL is found.
 */
function extractTikTokUrl(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(/https?:\/\/[^\s]*tiktok\.com\/[^\s]*/i);
  if (match) return match[0];

  // Also catch bare domains pasted without a scheme.
  const bare = text.match(/(?:^|\s)((?:vm|vt|www|m)\.tiktok\.com\/[^\s]*)/i);
  return bare ? bare[1] : null;
}

module.exports = { normalizeTikTokUrl, extractTikTokUrl };
