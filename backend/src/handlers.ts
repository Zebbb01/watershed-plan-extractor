import { moveActionItems } from './action-lists';
import type { ExtractRequest, ExtractResponse, OcrRequest, OcrResponse } from './api';
import type { LlmClient } from './llm/provider';
import { verifyUnit } from './verify';

/*
 * What the API routes do, minus HTTP: call the model, then verify its answer against the
 * unit's own text before anything is returned. The eval CLI calls these directly.
 */

export async function handleExtract(req: ExtractRequest, client: LlmClient, signal: AbortSignal): Promise<ExtractResponse> {
  const { data, usage } = await client.extract(req, signal);
  const sorted = moveActionItems(data, req.unit.pages, req.unit.context.lead);
  const { items, rejected } = verifyUnit(sorted, req.unit.pages, req.images.map((i) => i.page));
  return { unitIndex: req.unit.index, items, rejected, usage };
}

export function handleOcr(req: OcrRequest, client: LlmClient, signal: AbortSignal): Promise<OcrResponse> {
  return client.ocr(req, signal);
}
