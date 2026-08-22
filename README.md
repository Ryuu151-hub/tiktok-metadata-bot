# TikTok Metadata Bot

A Telegram bot that returns complete TikTok video metadata — creator info,
stats, music, and (optionally) ffprobe-derived technical video details —
from a plain TikTok link. TikWM is the data source; Vercel serverless
functions are the backend.

```
Telegram User → Telegram Bot (webhook) → Vercel API → TikWM API → optional ffprobe → Telegram response
```

## Project structure

```
tiktok-metadata-bot/
├── api/
│   ├── tiktok.js        Public API endpoint: POST { url } → normalized JSON
│   └── bot.js           Telegram webhook (production entry point)
├── lib/
│   ├── validate.js       TikTok URL validation / extraction
│   ├── tikwm.js           TikWM API client (timeout, error normalization)
│   ├── normalize.js        Raw TikWM data → stable schema
│   ├── ffprobe.js            Optional technical video analysis
│   ├── format.js               Telegram report text + error messages
│   ├── rateLimit.js             In-memory rate limiter
│   ├── telegram.js               Minimal Telegram Bot API client
│   └── handleUpdate.js            Shared message-handling logic
├── scripts/
│   ├── set-webhook.js     Registers your Vercel URL with Telegram
│   └── delete-webhook.js   Removes the webhook (for local testing)
├── bot.js                Local dev only — long-polling test runner
├── package.json
├── vercel.json
├── .env.example
└── README.md
```

`bot.js` at the root is **not** what runs in production — Vercel functions
can't run a persistent polling loop. It's a small long-polling script for
testing the bot locally without a public URL or webhook. Production uses
`api/bot.js`, which Vercel exposes at `/api/bot`. Both share the same
logic from `lib/handleUpdate.js`, so they never behave differently.

## 1. Create the Telegram bot

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → follow the
   prompts.
2. Save the token it gives you (`TELEGRAM_BOT_TOKEN`).

## 2. Deploy to Vercel

Push this project to a GitHub repo, then either:

- **Dashboard:** [vercel.com/new](https://vercel.com/new) → import the repo → deploy.
- **CLI:**
  ```bash
  npm i -g vercel
  vercel
  vercel --prod
  ```

Then add environment variables (Project → Settings → Environment
Variables), or via CLI:

```bash
vercel env add TELEGRAM_BOT_TOKEN
vercel env add TELEGRAM_WEBHOOK_SECRET
```

See `.env.example` for the full list and what each one does. Only
`TELEGRAM_BOT_TOKEN` is required; everything else has a sensible default.

**Never commit `.env` or paste your token into client-side code** — the
token only ever lives in Vercel's environment variables and is read
server-side by `api/bot.js` / `lib/telegram.js`. `api/tiktok.js` doesn't
need the bot token at all.

## 3. Point Telegram at your deployment

```bash
TELEGRAM_BOT_TOKEN=xxxx \
BOT_URL=https://your-app.vercel.app \
TELEGRAM_WEBHOOK_SECRET=some-long-random-string \
node scripts/set-webhook.js
```

This calls Telegram's `setWebhook` with `https://your-app.vercel.app/api/bot`
and the `secret_token`. Use the *same* `TELEGRAM_WEBHOOK_SECRET` value here
and in your Vercel env vars — `api/bot.js` checks it on every request so
random callers can't trigger your bot logic by guessing the URL.

Message your bot on Telegram with any TikTok link to test it.

## Local development

Two options:

**A. Test the webhook flow with `vercel dev`:**
```bash
vercel dev
```
This runs `api/tiktok.js` and `api/bot.js` locally, but Telegram can't
reach `localhost` directly — tunnel it (e.g. with `ngrok http 3000`) and
point `set-webhook.js` at the tunnel URL if you want to test the real
webhook path locally.

**B. Just run the bot with long polling (simpler, no tunnel needed):**
```bash
node scripts/delete-webhook.js   # only one delivery mode works at a time
TELEGRAM_BOT_TOKEN=xxxx node bot.js
```

## Testing the API directly

```bash
curl -X POST https://your-app.vercel.app/api/tiktok \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.tiktok.com/@username/video/1234567890123456789"}'
```

Response shape:
```json
{
  "ok": true,
  "sourceUrl": "https://www.tiktok.com/@username/video/...",
  "data": {
    "author": { "username": "...", "nickname": "...", "avatar": "..." },
    "video": { "id": "...", "title": "...", "region": "US", "createdAt": "2026-...Z", "durationSeconds": 15, "durationClock": "00:15" },
    "stats": { "views": 0, "likes": 0, "comments": 0, "shares": 0, "favorites": 0 },
    "music": { "id": "...", "title": "...", "author": "...", "original": true },
    "media": { "cover": "...", "originalCover": "...", "playUrl": "...", "hdPlayUrl": "..." }
  },
  "technical": {
    "resolution": "1080x1920", "fps": 30, "videoCodec": "H264",
    "videoBitrate": "2.10 Mbps", "audioCodec": "AAC", "audioBitrate": "128 kbps",
    "fileSize": "3.85 MB", "container": "mov,mp4,m4a,3gp,3g2,mj2"
  }
}
```
On failure: `{ "ok": false, "error": "<CODE>", "message": "..." }` with an
appropriate HTTP status (400 invalid input, 401 unauthorized, 429 rate
limited, 502 upstream failure, 500 unexpected).

Set `"includeTechnical": false` in the request body to skip ffprobe and
get a faster response.

## Error handling

| Situation | Code | Behavior |
|---|---|---|
| Malformed / non-TikTok URL | `INVALID_URL` | Rejected before any network call |
| Video deleted / can't be resolved | `UNRESOLVED_URL` | Friendly error, no retry |
| Private video | `PRIVATE_OR_DELETED` | Friendly error, no retry |
| TikWM returns an error code | `TIKWM_ERROR` | Friendly error |
| TikWM doesn't respond in time | `TIKWM_TIMEOUT` | Friendly error, safe to retry |
| TikWM unreachable (network) | `TIKWM_UNREACHABLE` | Friendly error, safe to retry |
| Too many requests | `RATE_LIMITED` | 429 / chat told to slow down |
| ffprobe missing, fails, or times out | — | Silently skipped — report still sends without the Technical section |

The Telegram bot always edits the "🔍 Checking TikTok…" message into
either the final report or a one-line error — it never leaves the chat
hanging.

## Notes on ffprobe and Vercel function duration

Technical video analysis runs `ffprobe` (via the `ffprobe-static` prebuilt
binary) directly against TikTok's CDN URL over HTTP range requests, so it
doesn't need to download the whole file first. It's still the slowest
part of the pipeline and is the first thing to disable if you hit
timeouts:

- Set `ENABLE_FFPROBE=false` to skip it entirely.
- Lower `FFPROBE_TIMEOUT_MS` so a slow probe fails fast instead of eating
  your function's whole duration budget.
- `vercel.json` sets `maxDuration: 30` for `api/*.js`. Vercel's Hobby plan
  allows up to 60s per function, Pro up to several minutes — raise this
  if you consistently hit timeouts on larger/HD videos, but check the
  current limits for your plan at
  [vercel.com/docs/functions/limitations](https://vercel.com/docs/functions/limitations),
  since these have changed over time.

## Notes on rate limiting

`lib/rateLimit.js` is a simple in-memory counter (default: 5 requests per
60s per Telegram chat / per caller IP). It resets on cold start and is
scoped to a single warm Lambda instance — enough to stop one chat from
looping requests at TikWM, but not a strict cross-instance guarantee
under heavy concurrent traffic. If you need that, swap the `Map` in
`lib/rateLimit.js` for Upstash Redis (`@upstash/ratelimit`) or Vercel KV
behind the same `assertNotRateLimited(key)` call — nothing else needs to
change.

## Security checklist

- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` live only in Vercel's
  environment variables — never in code, never in a frontend bundle.
- `api/bot.js` rejects any request missing the correct
  `X-Telegram-Bot-Api-Secret-Token` header when `TELEGRAM_WEBHOOK_SECRET`
  is set.
- `api/tiktok.js` never touches the bot token and can optionally be
  gated with `API_ACCESS_KEY` if you don't want it fully public.
- `.env` is git-ignored; only `.env.example` (no real secrets) is committed.
