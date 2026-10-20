import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { docById, EVAL_DIR } from './doc-set';
import type { GroundTruth } from './score';

// Writes a spot-check list per document (a fixed-seed 20% sample) for a human reviewer:
//   tsx eval/gt-review.ts <output dir>
const out = process.argv[2] ?? join(EVAL_DIR, '..', '..', '..', 'planning', 'gt-review');
mkdirSync(out, { recursive: true });

// mulberry32: a small seeded generator so the sample is the same on every run
const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const dir = join(EVAL_DIR, 'ground-truth');
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const gt: GroundTruth = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const next = rng(42);
  const sample = gt.items
    .map((item) => ({ item, key: next() }))
    .sort((a, b) => a.key - b.key)
    .slice(0, Math.max(5, Math.ceil(gt.items.length * 0.2)))
    .map((x) => x.item)
    .sort((a, b) => a.page - b.page);
  const doc = docById(gt.doc);
  const lines = [
    `# Ground-truth spot check — ${doc.title}`,
    '',
    `PDF: \`watershed-extractor/backend/eval/pdfs/${doc.file}\` · ${sample.length} of ${gt.items.length} items, chosen at random.`,
    '',
    'For each line, open the page and check three things: it belongs in that category, the name is copied exactly, and any numbers are right. Tick it, or write what is wrong after it.',
    '',
    ...sample.map((i) => {
      const nums = i.quantities?.length ? ` — numbers: ${i.quantities.map((q) => `${q.value}${q.unit ? ` ${q.unit}` : ''}`).join(', ')}` : '';
      return `- [ ] p.${i.page} · ${i.category} · **${i.name}** (${i.kind}) — “${i.quote}”${nums}`;
    }),
    '',
  ];
  writeFileSync(join(out, `${gt.doc}.md`), lines.join('\n'));
  console.log(`${gt.doc}: ${sample.length} items -> ${join(out, `${gt.doc}.md`)}`);
}
