'use strict';

const { normalizeTikTokUrl, extractTikTokUrl } = require('./validate');
const { fetchTikwmData } = require('./tikwm');
const { normalizeTikwmData } = require('./normalize');
const { probeVideo } = require('./ffprobe');
const { assertNotRateLimited } = require('./rateLimit');
const { sendMessage, editMessageText } = require('./telegram');
const { formatReport, formatError } = require('./format');
const { AppError } = require('./errors');

const WELCOME_TEXT =
  "Send me a TikTok link and I'll pull its full metadata — stats, creator info, music, and technical video details.";
const NO_URL_TEXT = "Send me a TikTok video link (tiktok.com, vm.tiktok.com or vt.tiktok.com) and I'll check it.";

async function reportOnUrl(chatId, url) {
  // Validate and rate-limit *before* showing "Checking…" so a bad link
  // or a rate-limited user gets an immediate, single reply instead of
  // a checking message that then has to be edited into an error.
  let tiktokUrl;
  try {
    assertNotRateLimited(`chat:${chatId}`);
    tiktokUrl = normalizeTikTokUrl(url);
  } catch (err) {
    const text = err instanceof AppError ? formatError(err) : '💥 Something unexpected went wrong.';
    await sendMessage(chatId, text);
    return;
  }

  const checkingMsg = await sendMessage(chatId, '🔍 Checking TikTok…');

  try {
    const raw = await fetchTikwmData(tiktokUrl);
    const meta = normalizeTikwmData(raw);
    const probeUrl = meta.media.hdPlayUrl || meta.media.playUrl;
    const technical = await probeVideo(probeUrl);
    const report = formatReport(meta, technical, tiktokUrl);
    await editMessageText(chatId, checkingMsg.message_id, report);
  } catch (err) {
    const text = err instanceof AppError ? formatError(err) : '💥 Something unexpected went wrong. Please try again.';
    await editMessageText(chatId, checkingMsg.message_id, text).catch(() => {});
  }
}

/**
 * Handles one Telegram `message` object. Shared by the production
 * webhook (api/bot.js) and the local long-polling dev script (bot.js)
 * so the two entry points can never drift out of sync.
 */
async function handleMessage(message) {
  if (!message || !message.text || !message.chat) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  if (text === '/start' || text === '/help') {
    await sendMessage(chatId, WELCOME_TEXT);
    return;
  }

  const url = extractTikTokUrl(text);
  if (!url) {
    await sendMessage(chatId, NO_URL_TEXT);
    return;
  }

  await reportOnUrl(chatId, url);
}

module.exports = { handleMessage };
