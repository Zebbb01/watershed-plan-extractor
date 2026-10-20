import { createAnthropicClient } from './anthropic';
import { createOpenAIClient } from './openai';
import { readEnv, type LlmClient } from './provider';

type Env = Record<string, string | undefined>;

/** The configured provider's client, or null when no key is set. */
export function createClient(env: Env = process.env, overrides: { extractionModel?: string; ocrModel?: string } = {}): LlmClient | null {
  const cfg = readEnv(env);
  if (!cfg.provider) return null;
  const opts = {
    extractionModel: overrides.extractionModel ?? cfg.extractionModel,
    ocrModel: overrides.ocrModel ?? cfg.ocrModel,
    effort: cfg.effort,
  };
  return cfg.provider === 'anthropic'
    ? createAnthropicClient({ ...opts, apiKey: env.ANTHROPIC_API_KEY!.trim() })
    : createOpenAIClient({ ...opts, apiKey: env.OPENAI_API_KEY!.trim() });
}
