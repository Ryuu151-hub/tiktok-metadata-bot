#!/usr/bin/env node
'use strict';

/**
 * One-off helper: registers your deployed Vercel URL as the Telegram
 * webhook, at the /api/bot route.
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=xxxx \
 *   BOT_URL=https://your-app.vercel.app \
 *   TELEGRAM_WEBHOOK_SECRET=some-long-random-string \
 *   node scripts/set-webhook.js
 *
 * TELEGRAM_WEBHOOK_SECRET is optional but recommended — set the same
 * value in your Vercel project's environment variables so api/bot.js
 * can verify calls actually came from Telegram.
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_URL = process.env.BOT_URL;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!TOKEN || !BOT_URL) {
  console.error('Set TELEGRAM_BOT_TOKEN and BOT_URL (e.g. https://your-app.vercel.app) before running this.');
  process.exit(1);
}

async function main() {
  const webhookUrl = `${BOT_URL.replace(/\/$/, '')}/api/bot`;
  const params = new URLSearchParams({ url: webhookUrl });
  if (SECRET) params.set('secret_token', SECRET);

  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const json = await response.json();
  console.log(json);

  if (!json.ok) process.exit(1);
}

main();
