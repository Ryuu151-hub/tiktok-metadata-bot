#!/usr/bin/env node
'use strict';

/**
 * Removes the current Telegram webhook. Do this before running the
 * local long-polling dev script (bot.js) — Telegram only delivers
 * updates to one place at a time (webhook OR getUpdates), and a
 * leftover webhook will silently swallow updates from long polling.
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=xxxx node scripts/delete-webhook.js
 */

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('Set TELEGRAM_BOT_TOKEN before running this.');
  process.exit(1);
}

async function main() {
  const response = await fetch(`https://api.telegram.org/bot${TOKEN}/deleteWebhook`);
  const json = await response.json();
  console.log(json);
  if (!json.ok) process.exit(1);
}

main();
