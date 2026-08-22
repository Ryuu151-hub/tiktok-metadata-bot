'use strict';

function safe(value, fallback = null) {
  return value === undefined || value === null || value === '' ? fallback : value;
}

function toIsoDate(unixSeconds) {
  if (unixSeconds === undefined || unixSeconds === null) return null;
  const ms = Number(unixSeconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString();
}

function secondsToClock(totalSeconds) {
  const s = Number(totalSeconds);
  if (!Number.isFinite(s) || s < 0) return null;
  const mins = Math.floor(s / 60);
  const secs = Math.round(s % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Converts TikWM's raw `data` object (see README for a sample payload)
 * into a stable, documented shape. Every field is read defensively so a
 * missing key never throws — callers get `null`/0 instead.
 */
function normalizeTikwmData(data) {
  const author = data.author || {};
  const music = data.music_info || {};

  return {
    author: {
      username: safe(author.unique_id),
      nickname: safe(author.nickname),
      avatar: safe(author.avatar || author.avatar_larger || author.avatar_thumb),
      userId: safe(author.id),
    },
    video: {
      id: safe(data.id),
      title: safe(data.title, ''),
      region: safe(data.region),
      createdAt: toIsoDate(data.create_time),
      durationSeconds: safe(data.duration),
      durationClock: secondsToClock(data.duration),
    },
    stats: {
      views: safe(data.play_count, 0),
      likes: safe(data.digg_count, 0),
      comments: safe(data.comment_count, 0),
      shares: safe(data.share_count, 0),
      favorites: safe(data.collect_count, 0),
      downloads: safe(data.download_count, 0),
    },
    music: {
      id: safe(music.id),
      title: safe(music.title),
      author: safe(music.author),
      original: Boolean(music.original),
      durationSeconds: safe(music.duration),
      playUrl: safe(music.play),
      cover: safe(music.cover),
    },
    media: {
      cover: safe(data.cover),
      originalCover: safe(data.origin_cover),
      dynamicCover: safe(data.ai_dynamic_cover),
      playUrl: safe(data.play),
      hdPlayUrl: safe(data.hdplay),
      watermarkedPlayUrl: safe(data.wmplay),
      sizeBytes: safe(data.size),
      hdSizeBytes: safe(data.hd_size),
      watermarkedSizeBytes: safe(data.wm_size),
    },
  };
}

module.exports = { normalizeTikwmData, secondsToClock };
