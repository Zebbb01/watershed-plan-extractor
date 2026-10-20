import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOCS, PDF_DIR, EVAL_DIR } from './doc-set';

// Puts every eval PDF in eval/pdfs/: copies it from ../../../test_data when present,
// otherwise downloads it from MDEQ, then checks its sha256 against docs.json.

const LOCAL = join(EVAL_DIR, '..', '..', '..', 'test_data');
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

mkdirSync(PDF_DIR, { recursive: true });
for (const doc of DOCS) {
  const target = join(PDF_DIR, doc.file);
  if (!existsSync(target)) {
    const local = join(LOCAL, doc.file);
    if (existsSync(local)) {
      copyFileSync(local, target);
    } else {
      process.stdout.write(`downloading ${doc.file} ... `);
      const res = await fetch(doc.url);
      if (!res.ok) throw new Error(`${doc.url}: HTTP ${res.status}`);
      writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    }
  }
  const ok = sha256(target) === doc.sha256;
  console.log(`${ok ? 'ok  ' : 'BAD '} ${doc.id}`);
  if (!ok) process.exitCode = 1;
}
