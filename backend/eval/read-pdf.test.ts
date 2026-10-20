import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pdfPath } from './doc-set';
import { readPdfNode, renderPageJpeg } from './read-pdf';

const brokenPumpkin = pdfPath('broken-pumpkin-2019');
const buttahatchee = pdfPath('buttahatchee-2004');

describe.runIf(existsSync(brokenPumpkin))('readPdfNode on a text PDF', () => {
  it('reads every page with positioned text', async () => {
    const { pages } = await readPdfNode(brokenPumpkin);
    expect(pages).toHaveLength(11);
    const firstPage = pages[0].items.map((i) => i.str).join(' ');
    expect(firstPage).toContain('Identification of Causes');
    expect(pages[0].items.every((i) => i.y >= 0 && i.y <= pages[0].height)).toBe(true);
  });

  it('renders a page to a JPEG no larger than 1400 px', async () => {
    const jpeg = await renderPageJpeg(brokenPumpkin, 4);
    expect(jpeg.startsWith('/9j/')).toBe(true);
    const bytes = Buffer.from(jpeg, 'base64');
    // JPEG SOF0/SOF2 marker holds height then width
    const sof = bytes.findIndex((b, i) => b === 0xff && (bytes[i + 1] === 0xc0 || bytes[i + 1] === 0xc2));
    const height = bytes.readUInt16BE(sof + 5);
    const width = bytes.readUInt16BE(sof + 7);
    expect(Math.max(width, height)).toBeLessThanOrEqual(1400);
  });
});

describe.runIf(existsSync(buttahatchee))('readPdfNode on a scanned PDF', () => {
  it('finds no text and an image on page 1', async () => {
    const { pages } = await readPdfNode(buttahatchee, { lastPage: 2 });
    expect(pages[0].items).toHaveLength(0);
    expect(pages[0].hasImage).toBe(true);
  });
});
