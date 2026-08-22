'use strict';

/**
 * Application-level error carrying a stable `code`, so callers (the API
 * response, the Telegram bot) can map it to a user-facing message without
 * parsing free-text strings.
 */
class AppError extends Error {
  constructor(code, message, meta = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.meta = meta;
  }
}

const ErrorCodes = {
  INVALID_URL: 'INVALID_URL',
  UNRESOLVED_URL: 'UNRESOLVED_URL',
  PRIVATE_OR_DELETED: 'PRIVATE_OR_DELETED',
  TIKWM_ERROR: 'TIKWM_ERROR',
  TIKWM_TIMEOUT: 'TIKWM_TIMEOUT',
  TIKWM_UNREACHABLE: 'TIKWM_UNREACHABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  FFPROBE_FAILED: 'FFPROBE_FAILED',
  FFPROBE_TIMEOUT: 'FFPROBE_TIMEOUT',
  UNAUTHORIZED: 'UNAUTHORIZED',
  BAD_REQUEST: 'BAD_REQUEST',
  UNKNOWN: 'UNKNOWN',
};

module.exports = { AppError, ErrorCodes };
