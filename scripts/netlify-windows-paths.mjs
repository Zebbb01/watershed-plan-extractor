#!/usr/bin/env node
// Netlify's Next.js runtime writes Windows paths into its generated server handler when the
// build runs on Windows ('\var\task\frontend' instead of '/var/task/frontend'), and the
// deployed function cannot start. Run this after `netlify build` and before
// `netlify deploy --no-build` (see DEPLOYMENT.md). Builds on Linux do not need it.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const file = join('frontend', '.netlify', 'functions-internal', '___netlify-server-handler', '___netlify-server-handler.mjs');
const before = readFileSync(file, 'utf8');
let fixed = 0;
const after = before.replace(/'(\\var\\task[^']*)'/g, (_, path) => {
  fixed++;
  return `'${path.replace(/\\/g, '/')}'`;
});
writeFileSync(file, after);
console.log(fixed ? `Rewrote ${fixed} Windows paths in ${file}.` : `No Windows paths in ${file}; nothing to do.`);
