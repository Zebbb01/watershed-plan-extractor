import { LIMITS } from '@app/backend';
import { connection } from 'next/server';
import { readEnv } from '@/server/llm';

// Whether a provider is configured, and the limits the client should respect. Never a key.
export async function GET() {
  await connection(); // read the environment at request time, not at build time
  const env = readEnv();
  return Response.json({
    ok: true,
    provider: env.provider,
    model: env.provider ? env.extractionModel : null,
    ocrModel: env.provider ? env.ocrModel : null,
    limits: { maxPages: env.maxPages, unitPages: LIMITS.unitPages, unitImages: LIMITS.unitImages, ocrImages: LIMITS.ocrImages, bodyBytes: LIMITS.bodyBytes },
  });
}
