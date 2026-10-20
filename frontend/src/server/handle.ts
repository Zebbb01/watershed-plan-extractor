import { LIMITS, type ErrorCode } from '@app/backend';
import type { z } from 'zod';
import { createClient, LlmError, readEnv } from './llm';
import { clientAddress, takeToken } from './rate-limit';
import { jsonError, logRequest, newRequestId } from './respond';

type LlmClient = NonNullable<ReturnType<typeof createClient>>;

/*
 * The shared path of both model routes: provider check, rate limit, size limit, JSON and schema
 * validation, then the work with a 50 s deadline (the host allows 60 s). Every failure becomes
 * a coded error a user can act on.
 */
export async function handleModelRoute<S extends z.ZodTypeAny, R extends { usage?: { inputTokens: number; outputTokens: number } }>(
  req: Request,
  route: string,
  schema: S,
  work: (input: z.infer<S>, client: LlmClient, signal: AbortSignal) => Promise<R>,
): Promise<Response> {
  const requestId = newRequestId();
  const started = Date.now();
  const done = (res: Response, usage?: R['usage']) => {
    logRequest({ requestId, route, status: res.status, ms: Date.now() - started, inputTokens: usage?.inputTokens, outputTokens: usage?.outputTokens });
    return res;
  };

  const env = readEnv();
  const client = env.provider ? createClient() : null;
  if (!client) return done(jsonError('NO_PROVIDER', requestId));

  const limit = takeToken(clientAddress(req), Date.now(), env.ratePerMin);
  if (!limit.ok) return done(jsonError('RATE_LIMITED', requestId, limit.retryAfter));

  if (Number(req.headers.get('content-length') ?? 0) > LIMITS.bodyBytes) return done(jsonError('INPUT_TOO_LARGE', requestId));
  const text = await req.text();
  if (text.length > LIMITS.bodyBytes) return done(jsonError('INPUT_TOO_LARGE', requestId));

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return done(jsonError('INVALID_INPUT', requestId, undefined, 'The request body is not valid JSON.'));
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return done(jsonError('INVALID_INPUT', requestId));

  try {
    const result = await work(parsed.data, client, AbortSignal.any([req.signal, AbortSignal.timeout(50_000)]));
    return done(Response.json(result, { headers: { 'x-request-id': requestId } }), result.usage);
  } catch (e) {
    const code: ErrorCode = e instanceof LlmError ? e.code : 'UPSTREAM_ERROR';
    return done(jsonError(code, requestId, e instanceof LlmError ? e.retryAfter : undefined));
  }
}
