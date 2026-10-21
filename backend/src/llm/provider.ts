import { z } from 'zod';
import type { ErrorCode, ExtractRequest, OcrRequest, OcrResponse } from '../api';
import type { UnitExtraction, Usage } from '../schema';

export type Provider = 'anthropic' | 'openai';
export type Effort = 'low' | 'medium' | 'high';

export interface LlmEnv {
  provider: Provider | null;
  extractionModel: string;
  ocrModel: string;
  /** set only by EXTRACTION_EFFORT; otherwise each model gets effortFor()'s default */
  effort: Effort | null;
  maxPages: number;
  ratePerMin: number;
}

export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: 'claude-opus-5-5',
  openai: 'gpt-6.1-sol',
};

// Models that accept an effort setting. Older ones (gpt-4.1, claude-haiku-4-5) reject the field.
const TAKES_EFFORT = /^(claude-(opus|sonnet|haiku|fable|mythos)-[5-9]|claude-opus-4-[5-9]|claude-sonnet-4-6|gpt-[5-9]|o\d)/;

/** The effort to send: an explicit EXTRACTION_EFFORT always, else "low" where the model takes one. */
export const effortFor = (model: string, explicit: Effort | null): Effort | null => explicit ?? (TAKES_EFFORT.test(model) ? 'low' : null);

/** A failure the pipeline knows how to react to (retry, wait, split the unit, or give up). */
export class LlmError extends Error {
  constructor(public code: ErrorCode, message: string, public retryAfter?: number) {
    super(message);
    this.name = 'LlmError';
  }
}

export interface LlmClient {
  provider: Provider;
  model: string;
  extract(req: ExtractRequest, signal: AbortSignal): Promise<{ data: UnitExtraction; usage: Usage }>;
  ocr(req: OcrRequest, signal: AbortSignal): Promise<OcrResponse>;
}

export const OcrSchema = z.object({
  pages: z.array(z.object({ n: z.number(), text: z.string() })),
});

type Env = Record<string, string | undefined>;
const value = (env: Env, key: string) => env[key]?.trim() || undefined;
const positiveInt = (s: string | undefined, fallback: number) => {
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/** Which provider and settings this deployment runs with. Never returns key values. */
export function readEnv(env: Env = process.env): LlmEnv {
  const keys: Record<Provider, boolean> = {
    anthropic: Boolean(value(env, 'ANTHROPIC_API_KEY')),
    openai: Boolean(value(env, 'OPENAI_API_KEY')),
  };
  const wanted = value(env, 'LLM_PROVIDER') as Provider | undefined;
  const provider: Provider | null =
    wanted && keys[wanted] ? wanted : keys.anthropic ? 'anthropic' : keys.openai ? 'openai' : null;
  const model = provider ? DEFAULT_MODELS[provider] : '';
  const effort = value(env, 'EXTRACTION_EFFORT');
  return {
    provider,
    extractionModel: value(env, 'EXTRACTION_MODEL') ?? model,
    ocrModel: value(env, 'OCR_MODEL') ?? model,
    effort: effort === 'low' || effort === 'medium' || effort === 'high' ? effort : null,
    maxPages: positiveInt(value(env, 'MAX_PAGES'), 800),
    ratePerMin: positiveInt(value(env, 'RATE_LIMIT_PER_MIN'), 60),
  };
}
