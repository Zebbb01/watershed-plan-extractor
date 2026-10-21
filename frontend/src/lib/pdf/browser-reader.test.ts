import { describe, expect, it, vi } from 'vitest';

const getDocument = vi.fn(() => ({ promise: Promise.resolve({ numPages: 1 }) }));
vi.mock('pdfjs-dist', () => ({ getDocument, GlobalWorkerOptions: {} }));

const { isBlankImage, openPdf } = await import('./browser-reader');

describe('openPdf', () => {
  it('tells pdf.js where its WebAssembly decoders are, so JPEG 2000 and JBIG2 scans can be drawn', async () => {
    const data = new Uint8Array([1, 2, 3]);
    await openPdf(data);
    expect(getDocument).toHaveBeenCalledWith(expect.objectContaining({ data, wasmUrl: '/pdfjs/wasm/' }));
  });
});

describe('isBlankImage', () => {
  const pixels = (rgba: number[], count: number) => Uint8ClampedArray.from(Array.from({ length: count }, () => rgba).flat());

  it('is true for a page that came out all white', () => {
    expect(isBlankImage(pixels([255, 255, 255, 255], 5000))).toBe(true);
  });

  it('is false once any sampled pixel holds ink', () => {
    const img = pixels([255, 255, 255, 255], 5000);
    img.set([20, 20, 20, 255], 4 * 2100);
    expect(isBlankImage(img)).toBe(false);
  });
});
