// Minimal, dependency-free Telegram Bot API client with timeouts and
// consistent error handling.

function getToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  return token;
}

async function call(method, payload) {
  const token = getToken();
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(`Telegram API error (${method}): ${json.description || res.status}`);
  }
  return json;
}

/**
 * Send a message. Returns the raw Telegram API response
 * (result.result.message_id is what you usually want next).
 */
export function sendMessage(chatId, text, options = {}) {
  return call('sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...options,
  });
}

export function editMessageText(chatId, messageId, text, options = {}) {
  return call('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    ...options,
  });
}

/**
 * Verifies the X-Telegram-Bot-Api-Secret-Token header against
 * TELEGRAM_WEBHOOK_SECRET using a constant-time comparison.
 */
export function verifyWebhookSecret(req, cryptoModule) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = req.headers['x-telegram-bot-api-secret-token'];
  if (!expected || !provided) return false;

  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return cryptoModule.timingSafeEqual(a, b);
}

export function escapeHtml(str = '') {
  return String(str).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
