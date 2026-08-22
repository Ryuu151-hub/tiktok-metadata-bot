'use strict';

const { spawn } = require('child_process');
const { AppError, ErrorCodes } = require('./errors');

let ffprobePath = null;
try {
  // ffprobe-static ships a prebuilt binary for the current platform and
  // gets bundled into the serverless function automatically.
  ffprobePath = require('ffprobe-static').path;
} catch (err) {
  ffprobePath = null;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.FFPROBE_TIMEOUT_MS || 12000);

function runFfprobe(videoUrl, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!ffprobePath) {
      reject(new AppError(ErrorCodes.FFPROBE_FAILED, 'ffprobe binary is not available in this deployment.'));
      return;
    }

    // ffprobe reads directly from the remote URL over HTTP range requests
    // (TikTok's CDN supports these) — no need to download the file first.
    const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', videoUrl];

    const child = spawn(ffprobePath, args);

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new AppError(ErrorCodes.FFPROBE_TIMEOUT, 'ffprobe took too long to analyze the video.'));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new AppError(ErrorCodes.FFPROBE_FAILED, `Could not launch ffprobe: ${err.message}`));
    });

    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (exitCode !== 0) {
        reject(
          new AppError(ErrorCodes.FFPROBE_FAILED, `ffprobe exited with code ${exitCode}: ${stderr.slice(0, 300)}`)
        );
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(new AppError(ErrorCodes.FFPROBE_FAILED, 'Could not parse ffprobe output.'));
      }
    });
  });
}

function bitsToHuman(bitsPerSecond) {
  const n = Number(bitsPerSecond);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} Mbps`;
  return `${(n / 1000).toFixed(0)} kbps`;
}

function bytesToHuman(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

function parseFps(videoStream) {
  const rate = videoStream.avg_frame_rate || videoStream.r_frame_rate;
  if (!rate || rate === '0/0') return null;
  const [num, den] = rate.split('/').map(Number);
  if (!den) return num || null;
  return Math.round((num / den) * 100) / 100;
}

/**
 * Probes a remote video URL and returns a normalized technical summary,
 * or `null` on any failure (missing binary, timeout, unreachable URL).
 * This is a nice-to-have — a probe failure never breaks the rest of the
 * report, it just means the "Technical" section is omitted.
 */
async function probeVideo(videoUrl, opts = {}) {
  if (process.env.ENABLE_FFPROBE === 'false') return null;
  if (!videoUrl) return null;

  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;

  let raw;
  try {
    raw = await runFfprobe(videoUrl, timeoutMs);
  } catch (err) {
    return null;
  }

  const format = raw.format || {};
  const streams = raw.streams || [];
  const videoStream = streams.find((s) => s.codec_type === 'video') || {};
  const audioStream = streams.find((s) => s.codec_type === 'audio') || {};

  return {
    resolution: videoStream.width && videoStream.height ? `${videoStream.width}x${videoStream.height}` : null,
    fps: parseFps(videoStream),
    videoCodec: videoStream.codec_name ? videoStream.codec_name.toUpperCase() : null,
    videoBitrate: bitsToHuman(videoStream.bit_rate || format.bit_rate),
    audioCodec: audioStream.codec_name ? audioStream.codec_name.toUpperCase() : null,
    audioBitrate: bitsToHuman(audioStream.bit_rate),
    durationSeconds: format.duration ? Number(format.duration) : null,
    fileSize: bytesToHuman(format.size),
    container: format.format_name || null,
  };
}

module.exports = { probeVideo };
