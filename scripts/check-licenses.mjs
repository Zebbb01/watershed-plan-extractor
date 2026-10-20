#!/usr/bin/env node
// Lists the licences of every production dependency and fails on anything outside the
// permissive set. The codebase is handed over with full rights to use and distribute it,
// so no strong-copyleft (GPL/AGPL) code may ship with it.
import { execFileSync } from 'node:child_process';

const ALLOWED = new Set(['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'BlueOak-1.0.0', 'CC0-1.0', 'CC-BY-4.0', 'Unlicense', 'Python-2.0']);
// Allowed with a note: sharp's prebuilt libvips binaries, used unmodified and dynamically linked.
const NOTED = new Set(['LGPL-3.0-or-later']);

const tree = JSON.parse(execFileSync('npm', ['ls', '--omit=dev', '--all', '--long', '--json'], { encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 256 * 1024 * 1024 }));
const seen = new Map();
const walk = (deps = {}) => {
  for (const [name, info] of Object.entries(deps)) {
    const id = `${name}@${info.version}`;
    // Optional and platform packages that are not installed have no version; nothing of them ships.
    if (seen.has(id) || !info.version) continue;
    // The workspaces themselves are this codebase; only their dependencies are third-party.
    if (!name.startsWith('@app/')) seen.set(id, typeof info.license === 'string' ? info.license : info.license?.type ?? 'UNKNOWN');
    walk(info.dependencies);
  }
};
walk(tree.dependencies);

const ok = (expr) => {
  const clean = expr.replace(/[()]/g, '');
  if (clean.includes(' OR ')) return clean.split(' OR ').some((x) => ok(x.trim()));
  if (clean.includes(' AND ')) return clean.split(' AND ').every((x) => ok(x.trim()));
  return ALLOWED.has(clean) || NOTED.has(clean);
};
const bad = [...seen].filter(([, lic]) => !ok(lic));
const noted = [...seen].filter(([, lic]) => [...NOTED].some((n) => lic.includes(n)));
const counts = {};
for (const [, lic] of seen) counts[lic] = (counts[lic] ?? 0) + 1;
console.log(`${seen.size} production packages:`, Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`).join(', '));
if (noted.length) console.log(`Noted (prebuilt binaries, unmodified, dynamically linked): ${noted.map(([id, l]) => `${id} (${l})`).join(', ')}`);
if (bad.length) {
  console.error(`Licence check FAILED:\n  ${bad.map(([id, l]) => `${id}: ${l}`).join('\n  ')}`);
  process.exit(1);
}
console.log('Licence check passed.');
