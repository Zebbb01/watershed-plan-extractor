import { OcrRequestSchema } from '@app/backend';
import { handleOcr } from '@/server/llm';
import { handleModelRoute } from '@/server/handle';

// Up to eight scanned page images in, their transcribed text out.
export const maxDuration = 60;

export function POST(req: Request) {
  return handleModelRoute(req, 'ocr', OcrRequestSchema, (input, client, signal) => handleOcr(input, client, signal));
}
