'use strict';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function num(n) {
  const parsed = Number(n);
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US') : 'N/A';
}

function orNA(value) {
  return value === null || value === undefined || value === '' ? 'N/A' : value;
}

function formatDate(iso) {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return `${d.toISOString().replace('T', ' ').slice(0, 19)} UTC`;
}

/**
 * Builds the final Telegram report (HTML parse mode) from normalized
 * TikWM data (see lib/normalize.js) and an optional ffprobe technical
 * summary (see lib/ffprobe.js). `technical` may be null/undefined, in
 * which case that section is omitted entirely.
 */
function formatReport(meta, technical, sourceUrl) {
  const lines = [];

  lines.push('📊 <b>TIKTOK METADATA</b>', '');

  lines.push('👤 <b>Creator</b>');
  lines.push(`Username: @${escapeHtml(orNA(meta.author.username))}`);
  lines.push(`Nickname: ${escapeHtml(orNA(meta.author.nickname))}`);
  lines.push('');

  lines.push('🆔 <b>Video</b>');
  lines.push(`ID: <code>${escapeHtml(orNA(meta.video.id))}</code>`);
  if (meta.video.title) lines.push(`Caption: ${escapeHtml(meta.video.title)}`);
  lines.push(`Region: ${escapeHtml(orNA(meta.video.region))}`);
  lines.push(`Posted: ${formatDate(meta.video.createdAt)}`);
  lines.push(`Duration: ${orNA(meta.video.durationClock)}`);
  lines.push('');

  lines.push('📈 <b>Statistics</b>');
  lines.push(`Views: ${num(meta.stats.views)}`);
  lines.push(`Likes: ${num(meta.stats.likes)}`);
  lines.push(`Comments: ${num(meta.stats.comments)}`);
  lines.push(`Shares: ${num(meta.stats.shares)}`);
  lines.push(`Favorites: ${num(meta.stats.favorites)}`);
  lines.push('');

  if (technical) {
    lines.push('📹 <b>Technical</b>');
    lines.push(`Resolution: ${orNA(technical.resolution)}`);
    lines.push(`FPS: ${orNA(technical.fps)}`);
    lines.push(`Video Codec: ${orNA(technical.videoCodec)}`);
    lines.push(`Video Bitrate: ${orNA(technical.videoBitrate)}`);
    lines.push(`Audio Codec: ${orNA(technical.audioCodec)}`);
    lines.push(`Audio Bitrate: ${orNA(technical.audioBitrate)}`);
    lines.push(`File Size: ${orNA(technical.fileSize)}`);
    lines.push(`Container: ${orNA(technical.container)}`);
    lines.push('');
  }

  lines.push('🎵 <b>Music</b>');
  lines.push(`Title: ${escapeHtml(orNA(meta.music.title))}`);
  if (meta.music.author) lines.push(`Artist: ${escapeHtml(meta.music.author)}`);
  if (meta.music.id) lines.push(`Music ID: <code>${escapeHtml(meta.music.id)}</code>`);
  lines.push('');

  lines.push(`🔗 <a href="${escapeHtml(sourceUrl)}">Original video</a>`);

  return lines.join('\n');
}

// User-facing text for each AppError code. `null` entries are handled
// elsewhere (ffprobe failures never surface as chat errors — they just
// mean the Technical section gets skipped).
const ERROR_MESSAGES = {
  INVALID_URL: "⚠️ That doesn't look like a valid TikTok link. Send a tiktok.com, vm.tiktok.com or vt.tiktok.com URL.",
  UNRESOLVED_URL: "❌ Couldn't resolve that video — it may be deleted, private, or region-locked.",
  PRIVATE_OR_DELETED: '🔒 This video is private or has been removed.',
  TIKWM_ERROR: '⚠️ TikWM could not process this video right now. Try again in a bit.',
  TIKWM_TIMEOUT: '⏳ TikWM took too long to respond. Please try again.',
  TIKWM_UNREACHABLE: '🚫 Could not reach TikWM right now. Please try again shortly.',
  RATE_LIMITED: '🐢 Too many requests — please wait a moment before trying again.',
  UNKNOWN: '💥 Something unexpected went wrong while checking that video.',
};

function formatError(appError) {
  return ERROR_MESSAGES[appError.code] || ERROR_MESSAGES.UNKNOWN;
}

module.exports = { formatReport, formatError, escapeHtml };
