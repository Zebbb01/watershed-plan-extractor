import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { ExtractRequest, OcrRequest, OcrResponse } from '../api';
import { UnitExtractionSchema, type UnitExtraction, type Usage } from '../schema';
import { priceUsd } from './prices';
import { buildUserText, OCR_PROMPT, SYSTEM_PROMPT } from './prompt';
import { LlmError, OcrSchema, type Effort, type LlmClient } from './provider';

interface Options {
  apiKey: string;
  extractionModel: string;
  ocrModel: string;
  effort: Effort;
}

type Block = Anthropic.Beta.Messages.BetaContentBlockParam;

const image = (jpegBase64: string): Block => ({
  type: 'image',
  source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 },
});

function toLlmError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  if (e instanceof Anthropic.APIUserAbortError || e instanceof Anthropic.APIConnectionTimeoutError) {
    return new LlmError('TIMEOUT', 'The model took too long on these pages.');
  }
  if (e instanceof Anthropic.RateLimitError) {
    return new LlmError('RATE_LIMITED', 'The model is busy.', Number(e.headers?.get('retry-after')) || 10);
  }
  if (e instanceof Anthropic.APIError) return new LlmError('UPSTREAM_ERROR', `The model service returned ${e.status ?? 'an error'}.`);
  if (e instanceof Anthropic.AnthropicError) return new LlmError('OUTPUT_TRUNCATED', 'The answer could not be read in full.');
  if (e instanceof Error && e.name === 'AbortError') return new LlmError('TIMEOUT', 'The model took too long on these pages.');
  return new LlmError('UPSTREAM_ERROR', 'The model call failed.');
}

/** Claude through the official SDK: structured output, cached instructions, refusal fallback. */
export function createAnthropicClient(opts: Options, sdk = new Anthropic({ apiKey: opts.apiKey, maxRetries: 1 })): LlmClient {
  async function call<T>(
    model: string,
    system: string,
    content: Block[],
    format: ReturnType<typeof betaZodOutputFormat<never>>,
    signal: AbortSignal,
  ): Promise<{ data: T; usage: Usage }> {
    try {
      const res = await sdk.beta.messages.parse(
        {
          model,
          max_tokens: 16_000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content }],
          output_config: { format, effort: opts.effort },
        },
        { signal },
      );
      if (res.stop_reason === 'refusal') throw new LlmError('UPSTREAM_ERROR', 'The model declined these pages.');
      if (res.stop_reason === 'max_tokens' || !res.parsed_output) {
        throw new LlmError('OUTPUT_TRUNCATED', 'The answer was cut off.');
      }
      const u = res.usage;
      const cacheRead = u.cache_read_input_tokens ?? 0;
      const cacheWrite = u.cache_creation_input_tokens ?? 0;
      return {
        data: res.parsed_output as T,
        usage: {
          inputTokens: u.input_tokens + cacheRead + cacheWrite,
          outputTokens: u.output_tokens,
          costUsd: priceUsd(model, u.input_tokens, u.output_tokens, cacheRead, cacheWrite),
        },
      };
    } catch (e) {
      throw toLlmError(e);
    }
  }

  return {
    provider: 'anthropic',
    model: opts.extractionModel,
    extract(req: ExtractRequest, signal: AbortSignal) {
      const content: Block[] = [];
      for (const img of req.images) content.push({ type: 'text', text: `Image of page ${img.page}:` }, image(img.jpegBase64));
      content.push({ type: 'text', text: buildUserText(req) });
      return call<UnitExtraction>(opts.extractionModel, SYSTEM_PROMPT, content, betaZodOutputFormat(UnitExtractionSchema) as never, signal);
    },
    async ocr(req: OcrRequest, signal: AbortSignal): Promise<OcrResponse> {
      const content: Block[] = [];
      for (const p of req.pages) content.push({ type: 'text', text: `Page ${p.n}:` }, image(p.jpegBase64));
      content.push({ type: 'text', text: `Transcribe pages ${req.pages.map((p) => p.n).join(', ')}.` });
      const { data, usage } = await call<{ pages: { n: number; text: string }[] }>(
        opts.ocrModel, OCR_PROMPT, content, betaZodOutputFormat(OcrSchema) as never, signal,
      );
      return { pages: data.pages, usage };
    },
  };
}
