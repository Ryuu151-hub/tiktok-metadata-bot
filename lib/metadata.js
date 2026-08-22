// Client for the separate FFprobe/FFmpeg worker service. The worker does
// the heavy lifting (fetching the video, running ffprobe); this module
// just calls it with a timeout + a single retry and normalizes errors.

export async function analyzeVideo({ videoUrl, headers }) {
  const workerUrl = process.env.METADATA_WORKER_URL;
  const secret = process.env.METADATA_WORKER_SECRET;

  if (!workerUrl) throw new Error('METADATA_WORKER_URL is not configured');
  if (!secret) throw new Error('METADATA_WORKER_SECRET is not configured');
  if (!videoUrl) throw new Error('No direct video URL available to analyze');

  const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 45000);
  let lastErr;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ videoUrl, headers }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Worker responded ${res.status}: ${body.slice(0, 200)}`);
      }

      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Worker returned an error');
      return json.data;
    } catch (err) {
      lastErr = err;
      if (attempt === 1) await new Promise((r) => setTimeout(r, 1000));
    }
  }

  throw lastErr;
}
