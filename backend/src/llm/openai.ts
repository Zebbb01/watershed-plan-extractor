import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import type { ExtractRequest, OcrRequest, OcrResponse } from '../api';
import { fromWire, WireUnitSchema, type UnitExtraction, type Usage, type WireUnit } from '../schema';
import { priceUsd } from './prices';
import { buildUserText, OCR_PROMPT, SYSTEM_PROMPT } from './prompt';
import { effortFor, LlmError, OcrSchema, type Effort, type LlmClient } from './provider';

interface Options {
  apiKey: string;
  extractionModel: string;
  ocrModel: string;
  effort: Effort | null;
}

type InputContent = OpenAI.Responses.ResponseInputContent;

const image = (jpegBase64: string): InputContent => ({
  type: 'input_image',
  detail: 'high',
  image_url: `data:image/jpeg;base64,${jpegBase64}`,
});

function toLlmError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  if (e instanceof OpenAI.APIUserAbortError || e instanceof OpenAI.APIConnectionTimeoutError) {
    return new LlmError('TIMEOUT', 'The model took too long on these pages.');
  }
  if (e instanceof OpenAI.RateLimitError) {
    return new LlmError('RATE_LIMITED', 'The model is busy.', Number(e.headers?.get('retry-after')) || 10);
  }
  if (e instanceof OpenAI.APIError) return new LlmError('UPSTREAM_ERROR', `The model service returned ${e.status ?? 'an error'}.`);
  if (e instanceof OpenAI.OpenAIError) return new LlmError('OUTPUT_TRUNCATED', 'The answer could not be read in full.');
  if (e instanceof Error && e.name === 'AbortError') return new LlmError('TIMEOUT', 'The model took too long on these pages.');
  return new LlmError('UPSTREAM_ERROR', 'The model call failed.');
}

/** The SDK client. It never retries on its own: the pipeline waits, splits or retries with the deadline in view. */
export const openaiSdk = (apiKey: string) => new OpenAI({ apiKey, maxRetries: 0 });

/** OpenAI through the official SDK (Responses API with structured output). */
export function createOpenAIClient(opts: Options, sdk = openaiSdk(opts.apiKey)): LlmClient {
  async function call<T>(
    model: string,
    instructions: string,
    content: InputContent[],
    format: ReturnType<typeof zodTextFormat>,
    signal: AbortSignal,
  ): Promise<{ data: T; usage: Usage }> {
    const effort = effortFor(model, opts.effort);
    try {
      const res = await sdk.responses.parse(
        {
          model,
          instructions,
          input: [{ role: 'user', content }],
          text: { format },
          max_output_tokens: 16_000,
          ...(effort ? { reasoning: { effort } } : {}),
        },
        { signal },
      );
      if (res.status === 'incomplete' || !res.output_parsed) throw new LlmError('OUTPUT_TRUNCATED', 'The answer was cut off.');
      const inputTokens = res.usage?.input_tokens ?? 0;
      const outputTokens = res.usage?.output_tokens ?? 0;
      return { data: res.output_parsed as T, usage: { inputTokens, outputTokens, costUsd: priceUsd(model, inputTokens, outputTokens) } };
    } catch (e) {
      throw toLlmError(e);
    }
  }

  return {
    provider: 'openai',
    model: opts.extractionModel,
    async extract(req: ExtractRequest, signal: AbortSignal): Promise<{ data: UnitExtraction; usage: Usage }> {
      const content: InputContent[] = [];
      for (const img of req.images) content.push({ type: 'input_text', text: `Image of page ${img.page}:` }, image(img.jpegBase64));
      content.push({ type: 'input_text', text: buildUserText(req) });
      const { data, usage } = await call<WireUnit>(opts.extractionModel, SYSTEM_PROMPT, content, zodTextFormat(WireUnitSchema, 'unit_extraction'), signal);
      return { data: fromWire(data), usage };
    },
    async ocr(req: OcrRequest, signal: AbortSignal): Promise<OcrResponse> {
      const content: InputContent[] = [];
      for (const p of req.pages) content.push({ type: 'input_text', text: `Page ${p.n}:` }, image(p.jpegBase64));
      content.push({ type: 'input_text', text: `Transcribe pages ${req.pages.map((p) => p.n).join(', ')}.` });
      const { data, usage } = await call<{ pages: { n: number; text: string }[] }>(
        opts.ocrModel, OCR_PROMPT, content, zodTextFormat(OcrSchema, 'transcription'), signal,
      );
      return { pages: data.pages, usage };
    },
  };
}
