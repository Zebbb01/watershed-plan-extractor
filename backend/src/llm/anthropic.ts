import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { ExtractRequest, OcrRequest, OcrResponse } from '../api';
import { fromWire, WIRE_HALVES, type UnitExtraction, type Usage, type WireUnit } from '../schema';
import { priceUsd } from './prices';
import { buildUserText, OCR_PROMPT, SYSTEM_PROMPT } from './prompt';
import { effortFor, LlmError, OcrSchema, type Effort, type LlmClient } from './provider';

interface Options {
  apiKey: string;
  extractionModel: string;
  ocrModel: string;
  effort: Effort | null;
}

type Block = Anthropic.Beta.Messages.BetaContentBlockParam;

const image = (jpegBase64: string): Block => ({
  type: 'image',
  source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 },
});

function toLlmError(e: unknown): LlmError {
  if (e instanceof LlmError) return e;
  // Our 50 s deadline aborts the call: too much work for one call, so the pipeline splits it.
  if (e instanceof Anthropic.APIUserAbortError) return new LlmError('TIMEOUT', 'The model took too long on these pages.');
  // The SDK's own timeout is the connection, not the work: retried as it is, never split.
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new LlmError('UPSTREAM_ERROR', 'Could not reach the model service.');
  if (e instanceof Anthropic.RateLimitError) {
    return new LlmError('RATE_LIMITED', 'The model is busy.', Number(e.headers?.get('retry-after')) || 10);
  }
  if (e instanceof Anthropic.APIError) return new LlmError('UPSTREAM_ERROR', `The model service returned ${e.status ?? 'an error'}.`);
  if (e instanceof Anthropic.AnthropicError) return new LlmError('OUTPUT_TRUNCATED', 'The answer could not be read in full.');
  if (e instanceof Error && e.name === 'AbortError') return new LlmError('TIMEOUT', 'The model took too long on these pages.');
  return new LlmError('UPSTREAM_ERROR', 'The model call failed.');
}

const sumUsage = (us: Usage[]): Usage => ({
  inputTokens: us.reduce((a, u) => a + u.inputTokens, 0),
  outputTokens: us.reduce((a, u) => a + u.outputTokens, 0),
  costUsd: us.some((u) => u.costUsd === null) ? null : us.reduce((a, u) => a + u.costUsd!, 0),
});

/** The SDK client. It never retries on its own: the pipeline waits, splits or retries with the deadline in view. */
export const anthropicSdk = (apiKey: string) => new Anthropic({ apiKey, maxRetries: 0 });

// Server-side refusal fallback exists for the Opus 5 line; Haiku 5.5 rejects the field with a 400.
const takesFallback = (model: string) => /^claude-opus-5/.test(model);

/** Claude through the official SDK: structured output, cached instructions, refusal fallback where offered. */
export function createAnthropicClient(opts: Options, sdk = anthropicSdk(opts.apiKey)): LlmClient {
  async function call<T>(
    model: string,
    system: string,
    content: Block[],
    format: ReturnType<typeof betaZodOutputFormat<never>>,
    signal: AbortSignal,
  ): Promise<{ data: T; usage: Usage }> {
    const effort = effortFor(model, opts.effort);
    try {
      // Streamed, then read whole: a request that sends nothing for many seconds can be dropped
      // by networks between here and the API ("other side closed"); a stream keeps bytes moving.
      const res = await sdk.beta.messages
        .stream(
          {
            model,
            max_tokens: 16_000,
            ...(takesFallback(model) ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
            system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
            messages: [{ role: 'user', content }],
            output_config: { format, ...(effort ? { effort } : {}) },
          },
          { signal },
        )
        .finalMessage();
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
    async extract(req: ExtractRequest, signal: AbortSignal): Promise<{ data: UnitExtraction; usage: Usage }> {
      // Two calls side by side, three categories each (see WIRE_HALVES); each returns about half the output.
      const halves = await Promise.all(
        WIRE_HALVES.map(({ ask, schema }) => {
          const content: Block[] = [];
          for (const img of req.images) content.push({ type: 'text', text: `Image of page ${img.page}:` }, image(img.jpegBase64));
          content.push({ type: 'text', text: buildUserText(req, ask) });
          return call<Partial<WireUnit>>(opts.extractionModel, SYSTEM_PROMPT, content, betaZodOutputFormat(schema) as never, signal);
        }),
      );
      const data = Object.assign({}, ...halves.map((h) => h.data)) as WireUnit;
      return { data: fromWire(data), usage: sumUsage(halves.map((h) => h.usage)) };
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
