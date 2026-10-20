import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface EvalDoc {
  id: string;
  title: string;
  file: string;
  url: string;
  sha256: string;
  role: 'dev' | 'heldout' | 'smoke';
  format: string;
  pages: number;
}

export const EVAL_DIR = dirname(fileURLToPath(import.meta.url));
export const PDF_DIR = join(EVAL_DIR, 'pdfs');
export const DOCS: EvalDoc[] = JSON.parse(readFileSync(join(EVAL_DIR, 'docs.json'), 'utf8'));

export const docById = (id: string): EvalDoc => {
  const d = DOCS.find((x) => x.id === id);
  if (!d) throw new Error(`unknown eval document: ${id}`);
  return d;
};

export const pdfPath = (id: string) => join(PDF_DIR, docById(id).file);
