#!/usr/bin/env node
// Fails if any tracked file holds something that looks like a credential, or if an env file
// other than .env.example is tracked. The submission zip is built from exactly these files.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PATTERNS = [
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI key', /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{36,}/],
  ['Netlify token', /nfp_[A-Za-z0-9]{30,}/],
  ['Vercel token', /\bvercel_[A-Za-z0-9]{24,}/i],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];
const BINARY = /\.(pdf|png|jpe?g|gif|ico|webp|woff2?|ttf|zip)$/i;

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const problems = [];
for (const file of files) {
  if (/(^|\/)\.env(\..+)?$/.test(file) && !file.endsWith('.env.example')) problems.push(`${file}: env file is tracked`);
  if (BINARY.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const [name, re] of PATTERNS) if (re.test(text)) problems.push(`${file}: looks like a ${name}`);
  if (file.endsWith('.env.example')) {
    for (const line of text.split(/\r?\n/)) {
      if (/^[A-Z_]*(KEY|TOKEN|SECRET)[A-Z_]*=.+/.test(line)) problems.push(`${file}: "${line.split('=')[0]}" has a value`);
    }
  }
}
if (problems.length) {
  console.error(`Secret scan FAILED (${problems.length}):\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`Secret scan passed: ${files.length} tracked files, no credentials found.`);
