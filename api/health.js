export default async function handler(req, res) {
  const checks = {
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_WEBHOOK_SECRET),
    workerConfigured: Boolean(process.env.METADATA_WORKER_URL && process.env.METADATA_WORKER_SECRET),
    cacheBackend: process.env.KV_REST_API_URL ? 'kv' : 'in-memory (best-effort)',
    databaseConfigured: Boolean(process.env.DATABASE_URL),
  };

  let workerHealthy = null;
  if (process.env.METADATA_WORKER_URL) {
    try {
      const healthUrl = process.env.METADATA_WORKER_URL.replace(/\/analyze\/?$/, '/health');
      const r = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
      workerHealthy = r.ok;
    } catch {
      workerHealthy = false;
    }
  }

  res.status(200).json({
    ok: true,
    uptime: process.uptime(),
    checks,
    workerHealthy,
    timestamp: new Date().toISOString(),
  });
}
