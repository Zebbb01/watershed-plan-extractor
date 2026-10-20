#!/usr/bin/env node
// Builds the submission zip from committed files only (no .env, node_modules, .next or test
// PDFs), after the secret scan passes, and checks it is small enough to email.
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { resolve } from 'node:path';

const MAX_MB = 20;
const out = resolve('..', 'watershed-extractor-submission.zip');
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error(`Commit or stash these changes first; the zip is built from the last commit:\n${dirty}`);
  process.exit(1);
}
// The docs hold {{PLACEHOLDERS}} for numbers that only exist after the final eval and deploy.
let placeholders = '';
try {
  placeholders = execFileSync('git', ['grep', '-nE', '\\{\\{[A-Z_]+\\}\\}', '--', '*.md'], { encoding: 'utf8' }).trim();
} catch (e) {
  if (e.status !== 1) throw e; // git grep exits 1 when nothing matches
}
if (placeholders) {
  console.error(`Fill these placeholders first:\n${placeholders}`);
  process.exit(1);
}
execFileSync('node', ['scripts/check-secrets.mjs'], { stdio: 'inherit' });
execFileSync('git', ['archive', '--format=zip', '--prefix=watershed-extractor/', '-o', out, 'HEAD'], { stdio: 'inherit' });
const mb = statSync(out).size / 1024 / 1024;
console.log(`Wrote ${out} (${mb.toFixed(1)} MB, commit ${execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()})`);
if (mb > MAX_MB) {
  console.error(`The zip is over ${MAX_MB} MB, too large to email.`);
  process.exit(1);
}
