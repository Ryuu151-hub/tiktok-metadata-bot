'use strict';

function apiBase() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  }
  return `https://api.telegram.org/bot${token}`;
}

async function callTelegram(method, payload) {
  const response = await fetch(`${apiBase()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || !json || json.ok === false) {
    const description = json && json.description ? json.description : `HTTP ${response.status}`;
    throw new Error(`Telegram API error (${method}): ${description}`);
  }

  return json.result;
}

function sendMessage(chatId, text, extra = {}) {
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  });
}

function editMessageText(chatId, messageId, text, extra = {}) {
  return callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  });
}

module.exports = { sendMessage, editMessageText, callTelegram };
