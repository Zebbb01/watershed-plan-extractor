// Copies pdf.js's WebAssembly image decoders (JPEG 2000, JBIG2, colour profiles) and their
// plain-JS fallbacks into frontend/public/pdfjs/wasm/, where the browser reader points pdf.js.
// Runs before every dev and build, so the files always match the installed pdfjs-dist.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const from = join(dirname(require.resolve('pdfjs-dist/package.json', { paths: [join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend')] })), 'wasm');
const to = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'public', 'pdfjs', 'wasm');

mkdirSync(to, { recursive: true });
// quickjs-eval is for form scripts in PDFs, which this app never runs.
const files = readdirSync(from).filter((f) => !f.startsWith('quickjs') && (f.endsWith('.wasm') || f.endsWith('_fallback.js') || f.startsWith('LICENSE')));
for (const f of files) copyFileSync(join(from, f), join(to, f));
console.log(`pdf.js decoders: copied ${files.length} files to frontend/public/pdfjs/wasm`);
