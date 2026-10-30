import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

// The whole upload flow in the browser (read the PDF, build units, call the API, merge, open the
// report), with the two model routes answered by the test instead of the AI service.

const usage = { inputTokens: 100, outputTokens: 20, costUsd: 0.0001 };
const empty = { goals: [], bmps: [], implementation: [], monitoring: [], outreach: [], geographicAreas: [] };
const bmp = (name: string, page: number) => ({
  id: name, name, text: name, kind: 'main', parentId: null, parentName: null, evidence: [{ page, quote: name }],
  verified: true, source: 'text', needsReview: null, confidence: 'high', quantities: [], unitCost: null, estimatedCost: null, pollutants: [],
});

test('a PDF dropped on the home page is read, extracted and opened as a report', async ({ page }) => {
  await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, provider: 'anthropic', model: 'claude-haiku-5-5', ocrModel: 'claude-haiku-5-5', limits: { maxPages: 800, unitPages: 12, unitImages: 6, ocrImages: 8, bodyBytes: 4_000_000 } } }));
  let calls = 0;
  await page.route('**/api/extract', async (r) => {
    const req = r.request().postDataJSON() as { unit: { index: number; pages: { n: number }[] } };
    calls++;
    const items = req.unit.pages.some((p) => p.n === 5) ? { ...empty, bmps: [bmp('Cover Crop', 5)] } : empty;
    await r.fulfill({ json: { unitIndex: req.unit.index, items, rejected: [], usage } });
  });

  await page.goto('/');
  const pdf = readFileSync(join(__dirname, '..', 'frontend', 'public', 'samples', 'broken-pumpkin-2019.pdf'));
  await page.getByLabel('Choose a PDF file').setInputFiles({ name: 'test-plan.pdf', mimeType: 'application/pdf', buffer: pdf });

  await expect(page).toHaveURL(/\/report\/[0-9a-f]{64}/, { timeout: 60_000 });
  expect(calls).toBeGreaterThan(0);
  await expect(page.getByRole('region', { name: 'Plan at a glance' }).getByRole('button', { name: /^Practices: 1\b/ })).toBeVisible();
});
