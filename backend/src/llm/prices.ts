// USD per million tokens [input, output, cache read], first-party list prices as of 2026-10.
// Cache writes cost 1.25x input. Haiku 5.5's price applies to prompts of 100K tokens or fewer,
// which every unit here is. Unknown models report no cost.
const PRICES: Record<string, [number, number, number]> = {
  'claude-opus-5-5': [4, 20, 0.2],
  'claude-opus-5': [5, 25, 0.5],
  'claude-sonnet-5-5': [2, 10, 0.2],
  'claude-sonnet-5': [2, 10, 0.2],
  'claude-haiku-5-5': [0.1, 0.5, 0.01],
};

export function priceUsd(model: string, inputTokens: number, outputTokens: number, cacheRead = 0, cacheWrite = 0): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (inputTokens * p[0] + cacheRead * p[2] + cacheWrite * p[0] * 1.25 + outputTokens * p[1]) / 1_000_000;
}
