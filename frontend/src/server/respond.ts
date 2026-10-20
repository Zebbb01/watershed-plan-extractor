import type { ErrorCode } from '@app/backend';

const STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  INPUT_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  NO_PROVIDER: 503,
  UPSTREAM_ERROR: 502,
  TIMEOUT: 504,
  OUTPUT_TRUNCATED: 422,
};

// What a user may read; the internal error never leaves the server.
export const MESSAGES: Record<ErrorCode, string> = {
  INVALID_INPUT: 'The request was not in the expected format.',
  INPUT_TOO_LARGE: 'This request is too large. Send fewer pages at once.',
  RATE_LIMITED: 'Too many requests. Please wait a moment.',
  NO_PROVIDER: 'No AI provider is configured on this server.',
  UPSTREAM_ERROR: 'The AI service returned an error.',
  TIMEOUT: 'The AI service took too long on these pages.',
  OUTPUT_TRUNCATED: 'The answer for these pages was cut off.',
};

export const newRequestId = () => crypto.randomUUID();

export function jsonError(code: ErrorCode, requestId: string, retryAfter?: number, message = MESSAGES[code]): Response {
  const headers: Record<string, string> = { 'x-request-id': requestId };
  if (retryAfter) headers['retry-after'] = String(retryAfter);
  return Response.json({ error: { code, message, requestId, ...(retryAfter ? { retryAfter } : {}) } }, { status: STATUS[code], headers });
}

/** One line per request: ids, timings and token counts. Never request bodies or document text. */
export function logRequest(entry: { requestId: string; route: string; status: number; ms: number; inputTokens?: number; outputTokens?: number }) {
  console.log(JSON.stringify(entry));
}
