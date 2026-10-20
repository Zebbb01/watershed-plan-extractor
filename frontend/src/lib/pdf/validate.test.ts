import { describe, expect, it } from 'vitest';
import { readErrorMessage, validatePdfFile } from './validate';

const enc = (s: string) => new TextEncoder().encode(s);

describe('validatePdfFile', () => {
  it('accepts a file that starts with %PDF-', () => {
    expect(validatePdfFile({ name: 'plan.pdf', size: 2_000, head: enc('%PDF-1.7\n') })).toEqual({ ok: true });
  });

  it('accepts a PDF with a few bytes of junk before the header', () => {
    expect(validatePdfFile({ name: 'plan.pdf', size: 2_000, head: enc('\r\n  %PDF-1.4') })).toEqual({ ok: true });
  });

  it('names a renamed image as not a PDF', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(validatePdfFile({ name: 'photo.pdf', size: 2_000, head: png })).toEqual({ ok: false, reason: 'This file is not a PDF.' });
  });

  it('names the size limit', () => {
    expect(validatePdfFile({ name: 'big.pdf', size: 301 * 1024 * 1024, head: enc('%PDF-1.7') })).toEqual({
      ok: false, reason: 'This PDF is larger than 300 MB.',
    });
  });

  it('names an empty file', () => {
    expect(validatePdfFile({ name: 'empty.pdf', size: 0, head: new Uint8Array() })).toEqual({ ok: false, reason: 'This file is empty.' });
  });
});

describe('readErrorMessage', () => {
  it('explains a password-protected PDF', () => {
    expect(readErrorMessage({ name: 'PasswordException' })).toBe('This PDF is password-protected. Remove the password and try again.');
  });

  it('explains a damaged PDF', () => {
    expect(readErrorMessage({ name: 'InvalidPDFException' })).toBe('This file is damaged or not a PDF.');
  });

  it('falls back to a plain sentence', () => {
    expect(readErrorMessage(new Error('x'))).toBe('This PDF could not be read.');
  });
});
