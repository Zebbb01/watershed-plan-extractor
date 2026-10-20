import { z } from 'zod';
import type { Rejection, UnitItems, Usage } from './schema';

/** Hard caps on one request. Sized so a call finishes well inside a 60 s function limit. */
export const LIMITS = {
  unitPages: 12,
  unitChars: 60_000,
  unitImages: 6,
  ocrImages: 8,
  imageBase64Chars: 1_500_000,
  bodyBytes: 4_000_000,
} as const;

export const ERROR_CODES = [
  'INVALID_INPUT',
  'INPUT_TOO_LARGE',
  'RATE_LIMITED',
  'NO_PROVIDER',
  'UPSTREAM_ERROR',
  'TIMEOUT',
  'OUTPUT_TRUNCATED',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const PageInputSchema = z
  .object({
    n: z.number().int().positive(),
    markup: z.string(),
    source: z.enum(['text', 'ocr']),
  })
  .strict();

const ImageSchema = z
  .object({
    page: z.number().int().positive(),
    jpegBase64: z.string().min(4).max(LIMITS.imageBase64Chars),
  })
  .strict();

export const ExtractRequestSchema = z
  .object({
    docId: z.string().min(1).max(128),
    unit: z
      .object({
        index: z.number().int().min(0),
        pages: z.array(PageInputSchema).min(1).max(LIMITS.unitPages),
        context: z
          .object({
            title: z.string().max(500).nullable(),
            outline: z.string().max(8_000),
            totalPages: z.number().int().positive(),
            hints: z.array(z.string().max(200)).max(200),
          })
          .strict(),
      })
      .strict()
      .refine((u) => u.pages.reduce((sum, p) => sum + p.markup.length, 0) <= LIMITS.unitChars, {
        message: `unit text exceeds ${LIMITS.unitChars} characters`,
      }),
    images: z.array(ImageSchema).max(LIMITS.unitImages),
  })
  .strict();
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

export const OcrRequestSchema = z
  .object({
    docId: z.string().min(1).max(128),
    pages: z
      .array(z.object({ n: z.number().int().positive(), jpegBase64: z.string().min(4).max(LIMITS.imageBase64Chars) }).strict())
      .min(1)
      .max(LIMITS.ocrImages),
  })
  .strict();
export type OcrRequest = z.infer<typeof OcrRequestSchema>;

export interface ExtractResponse {
  unitIndex: number;
  items: UnitItems;
  rejected: Rejection[];
  usage: Usage;
}

export interface OcrResponse {
  pages: { n: number; text: string }[];
  usage: Usage;
}

export interface ApiError {
  error: { code: ErrorCode; message: string; retryAfter?: number; requestId: string };
}
