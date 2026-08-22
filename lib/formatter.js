import { escapeHtml } from './telegram.js';

export function formatNumber(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return 'N/A';
  return Number(n).toLocaleString('en-US');
}

export function formatBytes(bytes) {
  if (!bytes) return 'N/A';
  const units = ['B', 'KB', 'MB', 'GB'];
  let val = Number(bytes);
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val.toFixed(1)} ${units[i]}`;
}

export function formatDuration(seconds) {
  if (!seconds) return 'N/A';
  return `${Number(seconds).toFixed(2)}s`;
}

export function formatBitrate(bps) {
  if (!bps) return 'N/A';
  const n = Number(bps);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Mbps`;
  return `${Math.round(n / 1000)} kbps`;
}

export function formatDate(ms) {
  if (!ms) return 'N/A';
  return new Date(ms).toISOString().slice(0, 10);
}

function truncate(str, max) {
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

/**
 * Builds the final HTML-formatted Telegram message from combined
 * TikTok + technical metadata. Missing fields degrade to "N/A" rather
 * than throwing, so a partial result still renders cleanly.
 */
export function buildResultMessage({ tiktok, technical }) {
  const t = tiktok || {};
  const stats = t.stats || {};
  const video = t.video || {};
  const fmt = technical?.format || {};
  const vid = technical?.video || {};
  const aud = technical?.audio || {};

  const width = vid.width || video.width;
  const height = vid.height || video.height;

  const lines = [
    '🎬 <b>TikTok Metadata</b>',
    '',
    `👤 Creator: @${escapeHtml(t.username || 'unknown')}`,
    `🆔 Video ID: <code>${escapeHtml(t.videoId || 'N/A')}</code>`,
  ];

  if (t.caption) lines.push(`📝 Caption: ${escapeHtml(truncate(t.caption, 200))}`);
  lines.push(`📅 Uploaded: ${formatDate(t.createTime)}`);
  lines.push(`🌍 Region: ${escapeHtml(t.region || 'N/A')}`);
  lines.push('');
  lines.push('📊 <b>Statistics</b>');
  lines.push(`👁 Views: ${formatNumber(stats.views)}`);
  lines.push(`❤️ Likes: ${formatNumber(stats.likes)}`);
  lines.push(`💬 Comments: ${formatNumber(stats.comments)}`);
  lines.push(`⭐ Favorites: ${formatNumber(stats.favorites)}`);
  lines.push(`🔄 Shares: ${formatNumber(stats.shares)}`);
  lines.push('');
  lines.push('🎥 <b>FILE METADATA</b>');
  lines.push(`📐 Resolution: ${width && height ? `${width}×${height}` : 'N/A'}`);
  lines.push(`🎞 FPS: ${vid.fps ?? 'N/A'}`);
  lines.push(`🖼 Pixel Format: ${vid.pixFmt || 'N/A'}`);
  lines.push(`🎬 Frames: ${vid.frameCount ?? 'N/A'}`);
  lines.push(`📦 Size: ${formatBytes(fmt.sizeBytes)}`);
  lines.push(`⏱ Duration: ${formatDuration(fmt.durationSeconds || video.duration)}`);
  lines.push(`📼 Container: ${fmt.formatName || 'N/A'}`);
  lines.push(`🎥 Video Codec: ${vid.codec || 'N/A'}`);
  lines.push(`📊 Video Bitrate: ${formatBitrate(vid.bitRate)}`);
  lines.push(`🔊 Audio Codec: ${aud.codec || 'N/A'}`);
  lines.push(`🔊 Audio Bitrate: ${formatBitrate(aud.bitRate)}`);
  lines.push('');

  if (t.partial || !technical) {
    lines.push('⚠️ Some data could not be retrieved for this video.');
  }
  lines.push('✅ Metadata check complete');

  return lines.join('\n');
}

export function buildErrorMessage(reason) {
  return (
    `❌ ${reason}\n\n` +
    'Send a public TikTok video link, e.g.\n' +
    'https://www.tiktok.com/@user/video/1234567890123456789'
  );
}
