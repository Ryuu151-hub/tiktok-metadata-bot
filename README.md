# TikTok Metadata Bot

A Telegram bot that, given a public TikTok video link, replies with the
video's TikTok metadata (creator, stats, caption...) and technical file
metadata (resolution, codecs, bitrate, fps...).

## Architecture

```
Telegram user
   │  sends TikTok URL
   ▼
Telegram Bot API
   │  webhook POST
   ▼
Vercel  /api/telegram/webhook
   │  1. verify secret token
   │  2. validate + dedupe
   │  3. ack Telegram (200) immediately
   │  4. background (waitUntil):
   │       - send "⏳ Checking..." message
   │       - lib/tiktok.js   → resolve URL, scrape TikTok metadata
   │       - lib/metadata.js → call the worker for technical metadata
   │       - lib/formatter.js → build final message
   │       - edit the "⏳" message with the result
   ▼
Metadata Worker (separate service, NOT on Vercel)
   │  POST /analyze { videoUrl, headers }
   │  runs ffprobe against the remote video URL (no full download needed
   │  in most cases — ffprobe streams just enough to read the container)
   ▼
returns JSON: { format, video, audio }
```

The Vercel app never runs ffmpeg/ffprobe itself — that's the whole point
of the separate worker. Vercel functions are for orchestration
(webhook auth, scraping, formatting, talking to Telegram); the worker is a
small always-on (or on-demand) service that has ffmpeg installed.

## Project structure

```
tiktok-metadata-bot/
├── api/
│   ├── telegram/webhook.js   Telegram webhook entrypoint
│   ├── metadata/check.js     Standalone metadata endpoint (for testing/reuse)
│   └── health.js             Health check
├── lib/
│   ├── telegram.js           Telegram Bot API client
│   ├── tiktok.js             URL validation + TikTok metadata scraping
│   ├── metadata.js           Client for the ffprobe worker
│   ├── formatter.js          Builds the Telegram message
│   └── cache.js              Dedupe + result caching + optional usage log
├── scripts/
│   ├── set-webhook.js        Configure the Telegram webhook
│   └── delete-webhook.js
├── worker/                   Separate service — deploy elsewhere, NOT Vercel
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
├── package.json
├── vercel.json
└── .env.example
```

## Environment variables (Vercel app)

| Variable                  | Required | Description |
|----------------------------|----------|-------------|
| `TELEGRAM_BOT_TOKEN`       | yes      | From [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_WEBHOOK_SECRET`  | yes      | Random string; verifies webhook requests really come from Telegram |
| `METADATA_WORKER_URL`      | yes      | Full URL to the worker's `/analyze` endpoint |
| `METADATA_WORKER_SECRET`   | yes      | Shared secret; must match the worker's own `METADATA_WORKER_SECRET` |
| `DATABASE_URL`             | no       | Postgres connection string, for optional usage logging |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | no | Vercel KV or Upstash Redis REST credentials, for reliable dedupe/caching across instances |
| `CACHE_TTL_SECONDS`        | no       | How long to cache a video's result (default 600) |
| `REQUEST_TIMEOUT_MS`       | no       | Timeout for the worker call (default 45000) |

Generate strong secrets with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 1. Deploy the metadata worker

This is a plain Express app with ffmpeg installed — deploy it anywhere that
runs Docker or a long-lived Node process (Vercel is **not** suitable here).

**Option A — Railway / Render / Fly.io (Docker)**
1. Push the `worker/` folder as its own repo (or point the platform at the
   `worker/` subdirectory with Docker build context).
2. Set env var `METADATA_WORKER_SECRET` (same value you'll put in the
   Vercel app's env).
3. Deploy. Note the public URL, e.g. `https://your-worker.up.railway.app`.
4. Confirm it's alive: `curl https://your-worker.up.railway.app/health`

**Option B — Any VPS with Docker**
```bash
cd worker
docker build -t tiktok-metadata-worker .
docker run -d -p 8080:8080 \
  -e METADATA_WORKER_SECRET=your-secret \
  --name tiktok-worker tiktok-metadata-worker
```
Put it behind a reverse proxy (e.g. Caddy/nginx) with HTTPS.

**Option C — Bare Node process (must have ffmpeg installed on the host)**
```bash
cd worker
npm install
METADATA_WORKER_SECRET=your-secret PORT=8080 npm start
```

## 2. Deploy the bot to Vercel

1. Push this repo to GitHub.
2. In Vercel: **New Project → Import** your GitHub repo.
3. Framework preset: **Other** (no build step needed).
4. Add the environment variables listed above in
   **Project Settings → Environment Variables**.
5. Deploy. Note your deployment URL, e.g. `https://tiktok-metadata-bot.vercel.app`.

## 3. Point the Telegram webhook at Vercel

Locally, with the same env values you set on Vercel:
```bash
TELEGRAM_BOT_TOKEN=xxx TELEGRAM_WEBHOOK_SECRET=xxx \
  node scripts/set-webhook.js https://tiktok-metadata-bot.vercel.app
```
This calls Telegram's `setWebhook` with your webhook URL and secret token.
Verify with:
```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

To remove the webhook (e.g. switch back to polling for local testing):
```bash
TELEGRAM_BOT_TOKEN=xxx node scripts/delete-webhook.js
```

## 4. Test it

- Message your bot on Telegram with a public TikTok link.
- Or test the pipeline directly without Telegram:
```bash
curl -X POST https://tiktok-metadata-bot.vercel.app/api/metadata/check \
  -H "Authorization: Bearer $METADATA_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.tiktok.com/@user/video/1234567890123456789"}'
```
- Health check: `curl https://tiktok-metadata-bot.vercel.app/api/health`

## Security notes

- The webhook rejects any request missing/mismatching
  `X-Telegram-Bot-Api-Secret-Token` (constant-time comparison).
- `/api/metadata/check` requires `Authorization: Bearer <METADATA_WORKER_SECRET>`.
- The worker requires the same bearer secret, so only your Vercel app (or
  anyone with the secret) can trigger ffprobe runs.
- No API keys/tokens are hard-coded anywhere — everything comes from env vars.
- Telegram updates are acknowledged with 200 immediately and deduped by
  `update_id`, so Telegram's automatic retries never cause double replies.
- ffprobe calls have a hard timeout (`FFPROBE_TIMEOUT_MS`) and are killed if
  they hang, so one bad/huge video can't wedge the worker.

## Limitations & notes

- **TikTok scraping is unofficial and best-effort.** `lib/tiktok.js` reads
  the JSON TikTok embeds in its own video page HTML. TikTok can change this
  structure without notice, and aggressive traffic patterns may get
  rate-limited or blocked by TikTok. If scraping fails, the bot falls back
  to TikTok's public oEmbed endpoint for basic info rather than erroring
  out completely.
- To swap in a paid/managed TikTok data provider instead of scraping
  (e.g. if you need higher reliability at scale), replace the body of
  `fetchTikTokData()` in `lib/tiktok.js` with a call to that provider and
  map its response onto the same return shape — nothing else needs to change.
- **Vercel Hobby plan** caps function duration; the included `vercel.json`
  requests up to 60s (Pro plan territory). On Hobby, long-running requests
  may still be cut off — the `waitUntil` background pattern used here
  helps (Telegram is acked instantly), but very slow ffprobe calls can
  still time out. Consider Vercel Pro or a generous `FFPROBE_TIMEOUT_MS`
  tuned to your worker's real-world latency.
- The in-memory cache/dedupe fallback only works within a single warm
  serverless instance. For real dedupe guarantees under load, configure
  `KV_REST_API_URL` / `KV_REST_API_TOKEN` (Vercel KV or Upstash Redis).
