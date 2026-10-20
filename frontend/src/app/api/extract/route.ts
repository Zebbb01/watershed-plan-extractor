import { ExtractRequestSchema } from '@app/backend';
import { handleExtract } from '@/server/llm';
import { handleModelRoute } from '@/server/handle';

// One work unit (a few pages) in, verified items out. See backend/src/handlers.ts.
export const maxDuration = 60;

export function POST(req: Request) {
  return handleModelRoute(req, 'extract', ExtractRequestSchema, (input, client, signal) => handleExtract(input, client, signal));
}
