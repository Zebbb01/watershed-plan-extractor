// USD per million tokens [input, output], Anthropic first-party prices as of 2026-10.
// Cache reads cost 0.1x input and cache writes 1.25x input. Unknown models report no cost.
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-sonnet-5-5': [2, 10],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};

export function priceUsd(model: string, inputTokens: number, outputTokens: number, cacheRead = 0, cacheWrite = 0): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (inputTokens * p[0] + cacheRead * p[0] * 0.1 + cacheWrite * p[0] * 1.25 + outputTokens * p[1]) / 1_000_000;
}
