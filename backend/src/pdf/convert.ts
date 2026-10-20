import type { TextItemLite } from '../schema';

/*
 * Turns pdf.js text content into positioned runs in top-left page coordinates.
 * Shared by the browser reader and the Node reader so both feed the same layout code.
 * Typed structurally so this file does not import pdf.js.
 */

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
}

/** Same as pdf.js Util.transform: multiply two 2D affine matrices. */
function multiply(m1: number[], m2: number[]): number[] {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

export function toTextItems(items: unknown[], viewportTransform: number[]): TextItemLite[] {
  const out: TextItemLite[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || !('str' in raw)) continue; // skip marked-content markers
    const it = raw as PdfTextItem;
    if (!it.str) continue;
    const t = multiply(viewportTransform, it.transform);
    const fontHeight = Math.hypot(t[2], t[3]) || it.height || 1;
    const scale = Math.hypot(viewportTransform[0], viewportTransform[1]) || 1;
    out.push({
      str: it.str,
      x: t[4],
      y: t[5],
      w: it.width * scale,
      h: fontHeight,
      font: it.fontName,
      bold: /bold|black|heavy/i.test(it.fontName),
    });
  }
  return out;
}

const IMAGE_OPS = [
  'paintImageXObject',
  'paintInlineImageXObject',
  'paintImageMaskXObject',
  'paintImageXObjectRepeat',
  'paintInlineImageXObjectGroup',
  'paintImageMaskXObjectGroup',
  'paintImageMaskXObjectRepeat',
];

/** Does an operator list paint any image? Used to tell a scanned page from a blank one. */
export function hasImageOps(fnArray: ArrayLike<number>, OPS: Record<string, number>): boolean {
  const wanted = new Set(IMAGE_OPS.map((k) => OPS[k]).filter((v) => typeof v === 'number'));
  for (let i = 0; i < fnArray.length; i++) if (wanted.has(fnArray[i])) return true;
  return false;
}
