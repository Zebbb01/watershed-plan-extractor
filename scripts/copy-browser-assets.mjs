// Copies the files the browser loads at run time from installed packages into frontend/public/,
// before every dev and build, so they always match the installed versions:
// - pdf.js's WebAssembly image decoders (JPEG 2000, JBIG2, colour profiles) and their plain-JS
//   fallbacks, into pdfjs/wasm/, where the browser reader points pdf.js;
// - Tesseract's worker, its LSTM engines (the worker picks one by the browser's SIMD support) and
//   the English model, into tesseract/, for marking quotes on scanned pages.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const frontend = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend');
const pkg = (name) => dirname(require.resolve(`${name}/package.json`, { paths: [frontend] }));

function copy(from, to, files) {
  mkdirSync(to, { recursive: true });
  for (const f of files) copyFileSync(join(from, f), join(to, f));
  return files.length;
}

const pdfjs = join(pkg('pdfjs-dist'), 'wasm');
// quickjs-eval is for form scripts in PDFs, which this app never runs.
const decoders = readdirSync(pdfjs).filter((f) => !f.startsWith('quickjs') && (f.endsWith('.wasm') || f.endsWith('_fallback.js') || f.startsWith('LICENSE')));
console.log(`pdf.js decoders: copied ${copy(pdfjs, join(frontend, 'public', 'pdfjs', 'wasm'), decoders)} files to frontend/public/pdfjs/wasm`);

const tesseract = join(frontend, 'public', 'tesseract');
const core = pkg('tesseract.js-core');
let n = copy(join(pkg('tesseract.js'), 'dist'), tesseract, ['worker.min.js', 'worker.min.js.LICENSE.txt']);
n += copy(core, tesseract, ['LICENSE', ...readdirSync(core).filter((f) => f.endsWith('-lstm.wasm.js'))]);
n += copy(join(pkg('@tesseract.js-data/eng'), '4.0.0_best_int'), tesseract, ['eng.traineddata.gz']);
console.log(`Tesseract: copied ${n} files to frontend/public/tesseract`);
