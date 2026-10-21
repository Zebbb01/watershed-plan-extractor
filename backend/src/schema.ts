import { z } from 'zod';

/*
 * The data contract. `ExtractedReportSchema` matches the interface in ChowaCo's brief
 * key for key; item fields are ours. Two families of schemas live here:
 *  - report schemas: what the app shows and exports (verified, ids assigned, numbers parsed);
 *  - LLM schemas: what the model is asked to return (spans only, every field required,
 *    no ids, no computed numbers). Code turns the second into the first (verify.ts).
 */

export const CATEGORY_KEYS = ['goals', 'bmps', 'implementation', 'monitoring', 'outreach', 'geographicAreas'] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

export const KindSchema = z.enum(['main', 'sub', 'example']);
export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
export const SourceSchema = z.enum(['text', 'table', 'ocr']);
export const ComparatorSchema = z.enum(['=', '>=', '<=', 'range', '~']);
export const STATUS_VALUES = ['planned', 'in-progress', 'completed'] as const;
export const AREA_TYPES = ['watershed', 'subwatershed', 'huc', 'county', 'waterbody', 'state', 'wria', 'other'] as const;

export type Kind = z.infer<typeof KindSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Comparator = z.infer<typeof ComparatorSchema>;

// ---------------------------------------------------------------- report schemas

export const EvidenceSchema = z.object({ page: z.number().int().positive(), quote: z.string().min(1) });
export type Evidence = z.infer<typeof EvidenceSchema>;

export const QuantitySchema = z.object({
  raw: z.string(),
  value: z.number().nullable(),
  valueMax: z.number().nullable(),
  unit: z.string().nullable(),
  comparator: ComparatorSchema.nullable(),
  scope: z.string().nullable(),
});
export type Quantity = z.infer<typeof QuantitySchema>;

const itemBase = {
  id: z.string(),
  name: z.string(),
  text: z.string(),
  kind: KindSchema,
  parentId: z.string().nullable(),
  evidence: z.array(EvidenceSchema),
  verified: z.boolean(),
  confidence: ConfidenceSchema,
  source: SourceSchema,
  needsReview: z.string().nullable(),
};

export const GoalSchema = z.object({
  ...itemBase,
  targets: z.array(QuantitySchema),
  pollutant: z.string().nullable(),
  deadline: z.string().nullable(),
});
export const BmpSchema = z.object({
  ...itemBase,
  quantities: z.array(QuantitySchema),
  unitCost: QuantitySchema.nullable(),
  estimatedCost: QuantitySchema.nullable(),
  pollutants: z.array(z.string()),
});
export const ActivitySchema = z.object({
  ...itemBase,
  responsible: z.array(z.string()),
  timeframe: z.string().nullable(),
  start: z.number().nullable(),
  end: z.number().nullable(),
  timeUnit: z.enum(['month', 'year']).nullable(),
  status: z.enum(STATUS_VALUES).nullable(),
  milestone: z.boolean(),
});
export const MetricSchema = z.object({
  ...itemBase,
  parameter: z.string(),
  threshold: QuantitySchema.nullable(),
  location: z.string().nullable(),
  frequency: z.string().nullable(),
});
export const OutreachSchema = z.object({
  ...itemBase,
  audience: z.string().nullable(),
  quantity: QuantitySchema.nullable(),
  timeframe: z.string().nullable(),
});
export const AreaSchema = z.object({
  ...itemBase,
  type: z.enum(AREA_TYPES),
  code: z.string().nullable(),
  areaAcres: z.number().nullable(),
  role: z.enum(['primary', 'mentioned']),
});

export type GoalItem = z.infer<typeof GoalSchema>;
export type BmpItem = z.infer<typeof BmpSchema>;
export type ActivityItem = z.infer<typeof ActivitySchema>;
export type MetricItem = z.infer<typeof MetricSchema>;
export type OutreachItem = z.infer<typeof OutreachSchema>;
export type AreaItem = z.infer<typeof AreaSchema>;
export type AnyItem = GoalItem | BmpItem | ActivityItem | MetricItem | OutreachItem | AreaItem;

export const SummarySchema = z.object({
  totalGoals: z.number(),
  totalBMPs: z.number(),
  completionRate: z.number(),
});

/** ChowaCo's `ExtractedReport`, exactly. */
export const ExtractedReportSchema = z.object({
  summary: SummarySchema,
  goals: z.array(GoalSchema),
  bmps: z.array(BmpSchema),
  implementation: z.array(ActivitySchema),
  monitoring: z.array(MetricSchema),
  outreach: z.array(OutreachSchema),
  geographicAreas: z.array(AreaSchema),
});
export type ExtractedReport = z.infer<typeof ExtractedReportSchema>;
export type UnitItems = Omit<ExtractedReport, 'summary'>;

export interface Rejection {
  category: CategoryKey;
  name: string;
  page: number | null;
  reason: 'quote-not-found' | 'name-not-in-source' | 'number-not-in-quote' | 'detail-not-in-source' | 'invalid';
}
export interface Conflict {
  category: CategoryKey;
  name: string;
  values: { raw: string; page: number }[];
}
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}
export interface FailedUnit {
  index: number;
  pages: number[];
  error: string;
}
export type LineKind = 'heading' | 'bullet' | 'numbered' | 'para' | 'table' | 'admin' | 'aside';
export interface StructureLine {
  page: number;
  kind: LineKind;
  level: number;
  text: string;
}

export interface DocumentInfo {
  /** sha256 of the file bytes, hex */
  id: string;
  fileName: string;
  pages: number;
  title: string | null;
  year: number | null;
}

export interface QualityInfo {
  verifiedRate: number;
  rejected: Rejection[];
  conflicts: Conflict[];
  ocrPages: number[];
  skippedPages: { page: number; reason: string }[];
  emptyPages: number[];
  failedUnits: FailedUnit[];
  provider: string;
  model: string;
  durationMs: number;
  usage: Usage;
  completionBasis: string;
  structure: StructureLine[];
}

export interface ExtractionResult {
  report: ExtractedReport;
  document: DocumentInfo;
  quality: QualityInfo;
}

// ---------------------------------------------------------------- raw pdf input

/** One positioned text run from pdf.js, in top-left page coordinates (points). */
export interface TextItemLite {
  str: string;
  x: number;
  /** baseline, measured from the top of the page */
  y: number;
  w: number;
  h: number;
  /** pdf.js font id; used to tell body text from headings */
  font: string;
  bold: boolean;
}

export interface RawPage {
  n: number;
  width: number;
  height: number;
  items: TextItemLite[];
  /** true when the page paints an image; only checked for pages with almost no text */
  hasImage: boolean;
}

// ---------------------------------------------------------------- LLM schemas

// Every field is required and nullable rather than optional: structured outputs need it.
const LlmQuantity = z.object({
  raw: z.string().describe('The exact words from the page that state the amount, e.g. "no fewer than 1,000 informational fact sheets" or "500" from a table cell plus its unit column.'),
  scope: z.string().nullable().describe('Which plan, phase or table the amount belongs to, copied from its heading, e.g. "Cost Estimate: Phase 1 Implementation". Null if the document does not distinguish.'),
});
const LlmEvidence = z.object({
  page: z.number().describe('Page number from the <page n="..."> tag.'),
  quote: z.string().describe('A short exact quote (5–40 words) copied character for character from that page that supports the item.'),
});
const llmBase = {
  name: z.string().describe('The item name copied exactly as written in the document (keep typos and capitals).'),
  text: z.string().describe('One sentence saying what the item is, close to the document wording.'),
  kind: KindSchema.describe('main = a top-level item; sub = a sub-item or detail of another item; example = an illustration ("e.g.", "such as").'),
  parentName: z.string().nullable().describe('For kind sub or example: the exact name of the parent item. Otherwise null.'),
  evidence: z.array(LlmEvidence),
};

export const LlmGoalSchema = z.object({
  ...llmBase,
  targets: z.array(LlmQuantity),
  pollutant: z.string().nullable(),
  deadline: z.string().nullable().describe('Deadline or time frame exactly as written, or null.'),
});
export const LlmBmpSchema = z.object({
  ...llmBase,
  quantities: z.array(LlmQuantity),
  unitCost: LlmQuantity.nullable(),
  estimatedCost: LlmQuantity.nullable(),
  pollutants: z.array(z.string()),
});
export const LlmActivitySchema = z.object({
  ...llmBase,
  responsible: z.array(z.string()).describe('Organizations or people named as responsible, each copied exactly.'),
  timeframe: z.string().nullable().describe('Schedule text exactly as written, e.g. "Months 1-36".'),
  status: z.enum(STATUS_VALUES).nullable().describe('Only if the document states it (e.g. "Completed"); otherwise null.'),
  milestone: z.boolean().describe('True for rows of a milestones table or list.'),
});
export const LlmMetricSchema = z.object({
  ...llmBase,
  parameter: z.string().describe('Parameter or measure name exactly as written.'),
  threshold: LlmQuantity.nullable(),
  location: z.string().nullable().describe('Station ids or locations exactly as written.'),
  frequency: z.string().nullable(),
});
export const LlmOutreachSchema = z.object({
  ...llmBase,
  audience: z.string().nullable(),
  quantity: LlmQuantity.nullable(),
  timeframe: z.string().nullable(),
});
export const LlmAreaSchema = z.object({
  ...llmBase,
  type: z.enum(AREA_TYPES),
  code: z.string().nullable().describe('HUC, segment or station code exactly as written, e.g. "031601060307".'),
  areaAcres: LlmQuantity.nullable(),
  role: z.enum(['primary', 'mentioned']).describe('primary = an area the plan covers; mentioned = referred to only.'),
});

export const UnitExtractionSchema = z.object({
  goals: z.array(LlmGoalSchema),
  bmps: z.array(LlmBmpSchema),
  implementation: z.array(LlmActivitySchema),
  monitoring: z.array(LlmMetricSchema),
  outreach: z.array(LlmOutreachSchema),
  geographicAreas: z.array(LlmAreaSchema),
});
export type UnitExtraction = z.infer<typeof UnitExtractionSchema>;
export type LlmQuantityValue = z.infer<typeof LlmQuantity>;
