// Duplicate-request protection + result caching, with an optional
// persistent usage log.
//
// Primary backend: any Upstash Redis REST-compatible store (this is what
// Vercel KV exposes under the hood) via KV_REST_API_URL / KV_REST_API_TOKEN.
// Fallback: an in-memory Map. The fallback only survives within a single
// warm serverless instance — fine for light traffic, but configure KV for
// reliable dedupe/caching under real load or multiple concurrent instances.

const memoryStore = new Map();

function memGet(key) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expires && entry.expires < Date.now()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key, value, ttlSeconds) {
  memoryStore.set(key, {
    value,
    expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
  });
}

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const hasKv = Boolean(KV_URL && KV_TOKEN);

async function kvCommand(args) {
  const res = await fetch(KV_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`KV command failed (${res.status})`);
  const json = await res.json();
  return json.result;
}

async function kvGet(key) {
  const result = await kvCommand(['GET', key]);
  return result ? JSON.parse(result) : null;
}

async function kvSet(key, value, ttlSeconds) {
  const args = ['SET', key, JSON.stringify(value)];
  if (ttlSeconds) args.push('EX', String(ttlSeconds));
  await kvCommand(args);
}

async function get(key) {
  if (hasKv) {
    try {
      return await kvGet(key);
    } catch (err) {
      console.warn('KV get failed, falling back to memory cache:', err.message);
    }
  }
  return memGet(key);
}

async function set(key, value, ttlSeconds) {
  if (hasKv) {
    try {
      return await kvSet(key, value, ttlSeconds);
    } catch (err) {
      console.warn('KV set failed, falling back to memory cache:', err.message);
    }
  }
  return memSet(key, value, ttlSeconds);
}

/**
 * Returns true if this Telegram update_id has already been handled
 * (Telegram retries webhook deliveries that don't get a fast 200 OK).
 * Marks it as seen for 5 minutes as a side effect.
 */
export async function wasRecentlyProcessed(updateId) {
  const key = `update:${updateId}`;
  const seen = await get(key);
  if (seen) return true;
  await set(key, true, 300);
  return false;
}

export async function getCachedResult(videoId) {
  if (!videoId) return null;
  return get(`video:${videoId}`);
}

export async function setCachedResult(videoId, data) {
  if (!videoId) return;
  const ttl = Number(process.env.CACHE_TTL_SECONDS || 600);
  await set(`video:${videoId}`, data, ttl);
}

// --- Optional persistent usage log (Postgres) -------------------------
// Entirely optional: skipped silently if DATABASE_URL isn't set, and
// never throws — a logging failure must never break a user-facing reply.

let pgPoolPromise = null;

async function getPgPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pgPoolPromise) {
    pgPoolPromise = (async () => {
      const { Pool } = await import('pg');
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
      });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS analysis_log (
          id SERIAL PRIMARY KEY,
          chat_id TEXT,
          video_id TEXT,
          username TEXT,
          success BOOLEAN,
          created_at TIMESTAMPTZ DEFAULT now()
        )
      `);
      return pool;
    })().catch((err) => {
      console.warn('Postgres init failed (logging disabled):', err.message);
      return null;
    });
  }
  return pgPoolPromise;
}

export async function logAnalysis({ chatId, videoId, username, success }) {
  try {
    const pool = await getPgPool();
    if (!pool) return;
    await pool.query(
      'INSERT INTO analysis_log (chat_id, video_id, username, success) VALUES ($1, $2, $3, $4)',
      [String(chatId), videoId, username, success]
    );
  } catch (err) {
    console.warn('logAnalysis failed (non-fatal):', err.message);
  }
}
