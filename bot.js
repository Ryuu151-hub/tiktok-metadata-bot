#!/usr/bin/env node
'use strict';

/**
 * Local development helper: runs the bot with long polling so you can
 * test it end-to-end without deploying or configuring a webhook.
 *
 * NOT used in production. Vercel deployments use the webhook handler
 * at api/bot.js instead — Vercel serverless functions can't run a
 * persistent polling loop like this one. Both share the same message
 * handling logic from lib/handleUpdate.js, so behavior is identical.
 *
 * Usage:
 *   TELEGRAM_BOT_TOKEN=xxxx node bot.js
 * or, to load variables from a local .env file:
 *   node -r dotenv/config bot.js
 */

const { handleMessage } = require('./lib/handleUpdate');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN is not set. Export it (or use a .env loader) before running this script.');
  process.exit(1);
}

const API_BASE = `https://api.telegram.org/bot${TOKEN}`;
let offset = 0;
let running = true;

process.on('SIGINT', () => {
  console.log('\nStopping…');
  running = false;
  process.exit(0);
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function poll() {
  while (running) {
    try {
      const response = await fetch(`${API_BASE}/getUpdates?timeout=30&offset=${offset}`);
      const json = await response.json();

      if (!json.ok) {
        console.error('getUpdates failed:', json.description);
        await sleep(3000);
        continue;
      }

      for (const update of json.result) {
        offset = update.update_id + 1;
        handleMessage(update.message).catch((err) => console.error('handleMessage error:', err));
      }
    } catch (err) {
      console.error('Polling error:', err.message);
      await sleep(3000);
    }
  }
}

console.log('Bot running locally with long polling. Press Ctrl+C to stop.');
poll();
