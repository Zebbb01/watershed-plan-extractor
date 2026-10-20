// Checks done before a PDF is opened, so a wrong file gets a named reason at once.
export const MAX_PDF_BYTES = 300 * 1024 * 1024;
const PDF_MAGIC = '%PDF-';

export function validatePdfFile(
  file: { name: string; size: number; head: Uint8Array },
  maxBytes = MAX_PDF_BYTES,
): { ok: true } | { ok: false; reason: string } {
  if (file.size === 0) return { ok: false, reason: 'This file is empty.' };
  if (file.size > maxBytes) return { ok: false, reason: `This PDF is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  // The header may follow a few bytes of junk; PDF readers search the first kilobyte.
  const head = new TextDecoder('latin1').decode(file.head.slice(0, 1024));
  if (!head.includes(PDF_MAGIC)) return { ok: false, reason: 'This file is not a PDF.' };
  return { ok: true };
}

export function readErrorMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'PasswordException') return 'This PDF is password-protected. Remove the password and try again.';
  if (name === 'InvalidPDFException' || name === 'MissingPDFException') return 'This file is damaged or not a PDF.';
  if (name === 'AbortError') return 'Cancelled.';
  return 'This PDF could not be read.';
}
