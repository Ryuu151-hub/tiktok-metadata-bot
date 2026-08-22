// Standalone metadata endpoint — useful for testing the pipeline directly
// (curl/Postman) without going through Telegram, and reusable by other
// callers. Protected with the same shared secret used to talk to the
// ffprobe worker.
import { isTikTokUrl, fetchTikTokData } from '../../lib/tiktok.js';
import { analyzeVideo } from '../../lib/metadata.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const secret = process.env.METADATA_WORKER_SECRET;
  const auth = req.headers.authorization;
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== 'string' || !isTikTokUrl(url)) {
    return res.status(400).json({ ok: false, error: 'A valid TikTok URL is required' });
  }

  try {
    const tiktok = await fetchTikTokData(url);

    let technical = null;
    let warning = null;

    if (tiktok.directVideoUrl) {
      try {
        technical = await analyzeVideo({ videoUrl: tiktok.directVideoUrl, headers: tiktok.videoHeaders });
      } catch (err) {
        warning = err.message;
      }
    } else {
      warning = 'No direct video URL available for technical analysis';
    }

    return res.status(200).json({ ok: true, tiktok, technical, warning });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
}
