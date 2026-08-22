'use strict';

const { AppError, ErrorCodes } = require('./errors');

const TIKWM_ENDPOINT = 'https://www.tikwm.com/api/';
const DEFAULT_TIMEOUT_MS = Number(process.env.TIKWM_TIMEOUT_MS || 15000);

/**
 * Calls the TikWM API for a single TikTok URL and returns its raw `data`
 * payload. Throws AppError on every failure mode so callers never have
 * to duplicate response-shape checks.
 */
async function fetchTikwmData(tiktokUrl, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(TIKWM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ url: tiktokUrl, hd: '1' }).toString(),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AppError(ErrorCodes.TIKWM_TIMEOUT, 'TikWM took too long to respond.');
    }
    throw new AppError(ErrorCodes.TIKWM_UNREACHABLE, `Could not reach TikWM: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new AppError(ErrorCodes.TIKWM_ERROR, `TikWM responded with HTTP ${response.status}.`);
  }

  let json;
  try {
    json = await response.json();
  } catch (err) {
    throw new AppError(ErrorCodes.TIKWM_ERROR, 'TikWM returned a response that was not valid JSON.');
  }

  if (!json || typeof json !== 'object') {
    throw new AppError(ErrorCodes.TIKWM_ERROR, 'TikWM returned an unexpected response shape.');
  }

  if (json.code !== 0) {
    const msg = String(json.msg || '').toLowerCase();

    if (msg.includes('private') || msg.includes('login')) {
      throw new AppError(ErrorCodes.PRIVATE_OR_DELETED, 'This video is private and cannot be read.');
    }
    if (
      msg.includes("can't be found") ||
      msg.includes('not found') ||
      msg.includes('invalid') ||
      msg.includes('removed') ||
      msg.includes('deleted')
    ) {
      throw new AppError(
        ErrorCodes.UNRESOLVED_URL,
        'This video could not be found — it may be deleted, private, or region-locked.'
      );
    }

    throw new AppError(ErrorCodes.TIKWM_ERROR, json.msg || 'TikWM could not process this URL.');
  }

  if (!json.data || typeof json.data !== 'object') {
    throw new AppError(ErrorCodes.UNRESOLVED_URL, 'TikWM did not return any video data for this URL.');
  }

  return json.data;
}

module.exports = { fetchTikwmData, TIKWM_ENDPOINT };
