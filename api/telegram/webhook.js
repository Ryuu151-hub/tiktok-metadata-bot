import { waitUntil } from '@vercel/functions';
import crypto from 'crypto';
import { sendMessage, editMessageText, verifyWebhookSecret } from '../../lib/telegram.js';
import { extractFirstUrl, isTikTokUrl, fetchTikTokData, parseIdsFromUrl } from '../../lib/tiktok.js';
import { analyzeVideo } from '../../lib/metadata.js';
import { buildResultMessage, buildErrorMessage } from '../../lib/formatter.js';
import {
  wasRecentlyProcessed,
  getCachedResult,
  setCachedResult,
  logAnalysis,
} from '../../lib/cache.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!verifyWebhookSecret(req, crypto)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const update = req.body || {};
  const message = update.message;

  // Ack Telegram immediately — the actual work happens in the background
  // via waitUntil so we never make Telegram wait on scraping/ffprobe.
  res.status(200).json({ ok: true });

  if (!message || !message.text || typeof update.update_id === 'undefined') return;

  waitUntil(processMessage(update, message));
}

async function processMessage(update, message) {
  const chatId = message.chat.id;
  const text = message.text.trim();

  try {
    if (await wasRecentlyProcessed(update.update_id)) return;

    if (text === '/start' || text === '/help') {
      await sendMessage(chatId, "Send me a public TikTok video link and I'll pull its metadata 🎬");
      return;
    }

    const url = extractFirstUrl(text);
    if (!url || !isTikTokUrl(url)) {
      await sendMessage(chatId, buildErrorMessage("That doesn't look like a TikTok link."));
      return;
    }

    const processingMsg = await sendMessage(chatId, '⏳ Checking TikTok video metadata...');
    const messageId = processingMsg.result.message_id;

    try {
      const result = await analyze(url, chatId);
      const resultText = buildResultMessage(result);
      await editMessageText(chatId, messageId, resultText, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('Analysis failed:', err);
      await editMessageText(chatId, messageId, buildErrorMessage(userFacingError(err)));
    }
  } catch (err) {
    // Something failed before/around sending any reply (e.g. Telegram API
    // itself unreachable) — nothing more we can do but log it.
    console.error('processMessage fatal error:', err);
  }
}

async function analyze(url, chatId) {
  const { videoId: preliminaryId } = parseIdsFromUrl(url);
  const cached = preliminaryId ? await getCachedResult(preliminaryId) : null;
  if (cached) return cached;

  const tiktok = await fetchTikTokData(url);

  let technical = null;
  if (tiktok.directVideoUrl) {
    try {
      technical = await analyzeVideo({ videoUrl: tiktok.directVideoUrl, headers: tiktok.videoHeaders });
    } catch (err) {
      console.warn('Technical metadata unavailable:', err.message);
    }
  }

  const combined = { tiktok, technical };
  await setCachedResult(tiktok.videoId, combined);
  // Fire-and-forget; never blocks or fails the user-facing response.
  logAnalysis({ chatId, videoId: tiktok.videoId, username: tiktok.username, success: Boolean(technical) });
  return combined;
}

function userFacingError(err) {
  const msg = err?.message || '';
  if (/timed out|timeout/i.test(msg)) return 'The request timed out. Please try again.';
  if (/METADATA_WORKER_URL|METADATA_WORKER_SECRET/.test(msg)) {
    return 'The metadata worker is not configured correctly.';
  }
  if (/TikTok page request failed/i.test(msg)) {
    return 'Could not reach TikTok for this video. It may be private, region-locked, or removed.';
  }
  return 'Could not analyze that video right now. Please try again later.';
}
