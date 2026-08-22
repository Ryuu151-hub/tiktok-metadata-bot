'use strict';

const { handleMessage } = require('../lib/handleUpdate');

/**
 * Telegram webhook endpoint. Point BotFather's webhook at:
 *   https://<your-app>.vercel.app/api/bot
 * (see scripts/set-webhook.js, or README.md, for a one-liner to do this).
 *
 * All the actual bot logic lives in lib/handleUpdate.js, shared with
 * bot.js (the local long-polling dev script) so production and local
 * testing can never drift apart.
 */
module.exports = async function handler(req, res) {
  // Reject anything that isn't Telegram. Set the same value with
  // secret_token when calling setWebhook (README covers this).
  if (process.env.TELEGRAM_WEBHOOK_SECRET) {
    const header = req.headers['x-telegram-bot-api-secret-token'];
    if (header !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      res.status(401).send('unauthorized');
      return;
    }
  }

  if (req.method !== 'POST') {
    // Telegram only ever POSTs to webhooks; anything else is a stray
    // request (health check, browser visit) — reply harmlessly.
    res.status(200).send('ok');
    return;
  }

  const update = req.body || {};
  const message = update.message || update.edited_message;

  try {
    await handleMessage(message);
  } catch (err) {
    // Never let a bug here make Telegram think the webhook is broken —
    // log and still return 200, or Telegram will keep retrying the
    // same update and you'll get duplicate replies.
    console.error('Webhook handling error:', err);
  }

  res.status(200).send('ok');
};
