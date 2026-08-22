// TikTok URL detection, short-link resolution, and public metadata
// extraction.
//
// This scrapes TikTok's public video page for the JSON blob it embeds for
// hydration (either __UNIVERSAL_DATA_FOR_REHYDRATION__ on modern pages, or
// the legacy SIGI_STATE). This is unofficial and best-effort: TikTok can
// change this structure at any time. If scraping fails, we fall back to
// TikTok's public oEmbed endpoint for basic info so the bot can still reply
// with something useful instead of erroring out.
//
// To swap in a paid/managed provider (e.g. a hosted TikTok data API)
// instead of scraping, replace the body of fetchTikTokData() with a call
// to that provider and map its response onto the same return shape.

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

const TIKTOK_HOST_RE = /(?:^|\.)tiktok\.com$/i;
const SHORT_HOST_RE = /^(vm|vt)\.tiktok\.com$/i;

export function extractFirstUrl(text = '') {
  const match = text.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

export function isTikTokUrl(url) {
  try {
    const { hostname } = new URL(url);
    return TIKTOK_HOST_RE.test(hostname);
  } catch {
    return false;
  }
}

export function parseIdsFromUrl(url) {
  const videoId =
    (url.match(/\/video\/(\d+)/) || [])[1] || (url.match(/\/v\/(\d+)/) || [])[1] || null;
  const username = (url.match(/@([\w.-]+)/) || [])[1] || null;
  return { videoId, username };
}

async function resolveRedirect(url, maxHops = 5) {
  let current = url;
  for (let i = 0; i < maxHops; i++) {
    const res = await fetch(current, {
      method: 'GET',
      redirect: 'manual',
      headers: DEFAULT_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) break;
      current = new URL(location, current).toString();
      continue;
    }
    return current;
  }
  return current;
}

function extractJsonBlob(html, id) {
  const re = new RegExp(`<script id="${id}"[^>]*>([\\s\\S]*?)</script>`, 'i');
  const match = html.match(re);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function digForItemStruct(json) {
  // Modern TikTok pages (__UNIVERSAL_DATA_FOR_REHYDRATION__)
  const scope = json?.__DEFAULT_SCOPE__ || json;
  const detail = scope?.['webapp.video-detail'];
  if (detail?.itemInfo?.itemStruct) return detail.itemInfo.itemStruct;

  // Legacy pages (SIGI_STATE)
  const itemModule = json?.ItemModule;
  if (itemModule) {
    const first = Object.values(itemModule)[0];
    if (first) return first;
  }
  return null;
}

async function scrapeVideoPage(url) {
  const res = await fetch(url, {
    headers: DEFAULT_HEADERS,
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`TikTok page request failed (${res.status})`);
  const html = await res.text();

  const json =
    extractJsonBlob(html, '__UNIVERSAL_DATA_FOR_REHYDRATION__') ||
    extractJsonBlob(html, 'SIGI_STATE');

  if (!json) return null;
  return digForItemStruct(json);
}

async function fetchOEmbed(url) {
  const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  return res.json();
}

function numOrNull(v) {
  return v === undefined || v === null || v === '' ? null : Number(v);
}

/**
 * Resolves a TikTok URL (following short links) and returns normalized
 * metadata. Never throws for "just can't find full data" cases — instead
 * returns a `partial: true` object with whatever it could recover.
 */
export async function fetchTikTokData(inputUrl) {
  const { hostname, pathname } = new URL(inputUrl);
  const looksShort = SHORT_HOST_RE.test(hostname) || pathname.startsWith('/t/');
  const resolvedUrl = looksShort ? await resolveRedirect(inputUrl) : inputUrl;

  const { videoId: idFromUrl, username: userFromUrl } = parseIdsFromUrl(resolvedUrl);

  let item = null;
  let scrapeError = null;
  try {
    item = await scrapeVideoPage(resolvedUrl);
  } catch (err) {
    scrapeError = err.message;
  }

  const videoHeaders = { Referer: 'https://www.tiktok.com/', ...DEFAULT_HEADERS };

  if (!item) {
    const oembed = await fetchOEmbed(resolvedUrl).catch(() => null);
    return {
      partial: true,
      warning: scrapeError
        ? `Full metadata unavailable (${scrapeError}); showing limited info.`
        : 'Full metadata unavailable; showing limited info.',
      videoId: idFromUrl,
      username: userFromUrl || oembed?.author_unique_id || null,
      nickname: oembed?.author_name || null,
      caption: oembed?.title || null,
      createTime: null,
      region: null,
      stats: { views: null, likes: null, comments: null, shares: null, favorites: null },
      video: { width: null, height: null, duration: null },
      directVideoUrl: null,
      videoHeaders,
      resolvedUrl,
    };
  }

  const stats = item.stats || item.statsV2 || {};
  const video = item.video || {};

  return {
    partial: false,
    warning: null,
    videoId: item.id || idFromUrl,
    username: item.author?.uniqueId || userFromUrl,
    nickname: item.author?.nickname || null,
    caption: item.desc || null,
    createTime: item.createTime ? Number(item.createTime) * 1000 : null,
    region: item.locationCreated || item.author?.region || null,
    stats: {
      views: numOrNull(stats.playCount),
      likes: numOrNull(stats.diggCount),
      comments: numOrNull(stats.commentCount),
      shares: numOrNull(stats.shareCount),
      favorites: numOrNull(stats.collectCount),
    },
    video: {
      width: video.width || null,
      height: video.height || null,
      duration: video.duration || null,
      format: video.format || null,
      bitrate: numOrNull(video.bitrate),
    },
    directVideoUrl: video.playAddr || video.downloadAddr || null,
    videoHeaders,
    resolvedUrl,
  };
}
