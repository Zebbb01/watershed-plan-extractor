import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { createClient } from '../src/llm/client';
import { effortFor, readEnv } from '../src/llm/provider';
import type { CategoryKey, ExtractionResult } from '../src/schema';
import { CATEGORY_KEYS } from '../src/schema';
import { DOCS, EVAL_DIR, pdfPath, type EvalDoc } from './doc-set';
import { loadEnv } from './env';
import { pageTexts } from './page-text';
import { runDoc } from './run-doc';
import { score, type DocScore, type GroundTruth } from './score';

/*
 * npm run eval -w backend -- --set dev|heldout|all|smoke|<doc id>[,<doc id>...] [--model id] [--ocr-model id]
 *   [--provider anthropic|openai] [--effort low|medium|high] [--concurrency 4] [--repeat 3] [--latest]
 *   [--merge <result file>]
 * Runs the production pipeline on the eval PDFs, scores it against ground truth, and writes
 * eval/results/<date>-<model>.json (and latest.json with --latest or --set all). --merge takes the
 * plans not run now from a saved result file, so a change that alters only some plans' input can be
 * measured on those plans alone; the output lists which plans came from where.
 */

const { values: args } = parseArgs({
  options: {
    set: { type: 'string', default: 'dev' },
    model: { type: 'string' },
    'ocr-model': { type: 'string' },
    provider: { type: 'string' },
    effort: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    label: { type: 'string' },
    repeat: { type: 'string', default: '1' },
    latest: { type: 'boolean', default: false },
    merge: { type: 'string' },
  },
});

const env = loadEnv();
if (args.provider) env.LLM_PROVIDER = args.provider;
if (args.effort) env.EXTRACTION_EFFORT = args.effort;
const client = createClient(env, { extractionModel: args.model, ocrModel: args['ocr-model'] ?? args.model });
if (!client) {
  console.error('No API key found. Put ANTHROPIC_API_KEY or OPENAI_API_KEY in frontend/.env.local.');
  process.exit(1);
}
const cfg = readEnv(env);
const ocrModel = args['ocr-model'] ?? args.model ?? cfg.ocrModel;

const set = args.set!;
const docs: EvalDoc[] = ['dev', 'heldout', 'smoke'].includes(set)
  ? DOCS.filter((d) => d.role === set)
  : set === 'all'
    ? DOCS.filter((d) => d.role !== 'smoke')
    : DOCS.filter((d) => set.split(',').includes(d.id));
if (!docs.length) {
  console.error(`No documents match --set ${set}.`);
  process.exit(1);
}

const RESULTS = join(EVAL_DIR, 'results');
mkdirSync(join(RESULTS, 'runs'), { recursive: true });
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

interface DocRow {
  id: string;
  role: EvalDoc['role'];
  format: string;
  pages: number;
  timeMs: number;
  costUsd: number | null;
  counts: Record<CategoryKey, number>;
  failedUnits: number;
  rejected: number;
  score: DocScore | null;
  /** core F1 of each run, when the plan was run more than once */
  runs?: number[];
}
const rows: DocRow[] = [];

type Totals = { gt: number; predicted: number; matched: number };
const f = (t: Totals) => {
  const p = t.predicted ? t.matched / t.predicted : 0;
  const r = t.gt ? t.matched / t.gt : 0;
  return { ...t, precision: p, recall: r, f1: p + r ? (2 * p * r) / (p + r) : 0 };
};

/** Several runs of one plan as one score: counts averaged over the runs, rates computed from those averages. */
function meanScore(scores: DocScore[]): DocScore {
  const mean = (pick: (s: DocScore) => number) => scores.reduce((a, s) => a + pick(s), 0) / scores.length;
  const totals = (pick: (s: DocScore) => Totals) =>
    f({ gt: mean((s) => pick(s).gt), predicted: mean((s) => pick(s).predicted), matched: mean((s) => pick(s).matched) });
  const n = { correct: mean((s) => s.numeric.correct), total: mean((s) => s.numeric.total), predictedCorrect: mean((s) => s.numeric.predictedCorrect), predicted: mean((s) => s.numeric.predicted) };
  return {
    ...scores[scores.length - 1],
    categories: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, totals((s) => s.categories[k])])) as DocScore['categories'],
    core: totals((s) => s.core),
    all: totals((s) => s.all),
    numeric: { ...n, accuracy: n.total ? n.correct / n.total : 1, precision: n.predicted ? n.predictedCorrect / n.predicted : 1 },
    categoryAccuracy: mean((s) => s.categoryAccuracy),
    kindAccuracy: mean((s) => s.kindAccuracy),
    verbatimViolations: [...new Set(scores.flatMap((s) => s.verbatimViolations))],
  };
}

// The model is not deterministic: --repeat runs each labelled plan several times and reports the mean, with
// each run's F1. A plan without an answer key runs once: it has no score to average.
const repeat = Math.max(1, Number(args.repeat) || 1);
for (const doc of docs) {
  const path = pdfPath(doc.id);
  if (!existsSync(path)) {
    console.error(`${doc.id}: missing PDF, run npm run eval:fetch -w backend`);
    continue;
  }
  const gtFile = join(EVAL_DIR, 'ground-truth', `${doc.id}.json`);
  const gt: GroundTruth | null = existsSync(gtFile) ? JSON.parse(readFileSync(gtFile, 'utf8')) : null;
  const runs: { result: ExtractionResult; pages: number; s: DocScore | null }[] = [];
  const times = gt ? repeat : 1;
  for (let i = 0; i < times; i++) {
    process.stdout.write(`${doc.id}${times > 1 ? ` (run ${i + 1})` : ''} ... `);
    const { result, pages } = await runDoc(doc, client, Number(args.concurrency));
    // The last run's output is kept for the samples, not the best one.
    writeFileSync(join(RESULTS, 'runs', `${doc.id}.${client.model}.json`), JSON.stringify(result, null, 1));
    const s = gt ? score(result, gt, pageTexts(pages)) : null;
    runs.push({ result, pages: pages.length, s });
    console.log(
      `${(result.quality.durationMs / 1000).toFixed(0)} s, $${result.quality.usage.costUsd?.toFixed(3) ?? '?'}` +
        (s ? `, core F1 ${pct(s.core.f1)}, numbers ${pct(s.numeric.accuracy)}, verbatim violations ${s.verbatimViolations.length}` : ', no ground truth'),
    );
  }
  const last = runs[runs.length - 1].result;
  const mean = (pick: (r: (typeof runs)[number]) => number) => runs.reduce((a, r) => a + pick(r), 0) / runs.length;
  const costs = runs.map((r) => r.result.quality.usage.costUsd);
  rows.push({
    id: doc.id, role: doc.role, format: doc.format, pages: runs[0].pages, timeMs: mean((r) => r.result.quality.durationMs),
    costUsd: costs.includes(null) ? null : mean((r) => r.result.quality.usage.costUsd!),
    counts: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, last.report[k].length])) as Record<CategoryKey, number>,
    failedUnits: runs.reduce((a, r) => a + r.result.quality.failedUnits.length, 0), rejected: last.quality.rejected.length,
    score: gt ? meanScore(runs.map((r) => r.s!)) : null,
    ...(gt && repeat > 1 ? { runs: runs.map((r) => r.s!.core.f1) } : {}),
  });
}

// Micro-averaged totals per role, so a long document weighs by its items, not as one vote.
function aggregate(role: string) {
  const scored = rows.filter((r) => r.score && (role === 'all' || r.role === role));
  if (!scored.length) return null;
  const tot = (pick: (s: DocScore) => { gt: number; predicted: number; matched: number }) =>
    scored.reduce((a, r) => {
      const x = pick(r.score!);
      return { gt: a.gt + x.gt, predicted: a.predicted + x.predicted, matched: a.matched + x.matched };
    }, { gt: 0, predicted: 0, matched: 0 });
  const numeric = scored.reduce((a, r) => ({ correct: a.correct + r.score!.numeric.correct, total: a.total + r.score!.numeric.total }), { correct: 0, total: 0 });
  return {
    docs: scored.length,
    core: f(tot((s) => s.core)),
    categories: Object.fromEntries(CATEGORY_KEYS.map((k) => [k, f(tot((s) => s.categories[k]))])),
    numeric: { ...numeric, accuracy: numeric.total ? numeric.correct / numeric.total : 1 },
    verbatimViolations: scored.reduce((a, r) => a + r.score!.verbatimViolations.length, 0),
    timeMs: scored.reduce((a, r) => a + r.timeMs, 0),
    costUsd: scored.reduce((a, r) => a + (r.costUsd ?? 0), 0),
  };
}

const merged: string[] = [];
if (args.merge) {
  const saved: { date: string; docs: DocRow[] } = JSON.parse(readFileSync(args.merge, 'utf8'));
  for (const r of saved.docs) if (!rows.some((x) => x.id === r.id)) rows.push(r), merged.push(r.id);
  const order = DOCS.map((d) => d.id);
  rows.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

const date = new Date().toISOString().slice(0, 10);
const out = {
  date,
  provider: client.provider,
  model: client.model,
  ocrModel,
  effort: effortFor(client.model, cfg.effort) ?? 'none',
  set,
  repeat,
  ...(args.merge ? { mergedFrom: { file: args.merge.split(/[\\/]/).pop(), docs: merged } } : {}),
  docs: rows,
  aggregate: { dev: aggregate('dev'), heldout: aggregate('heldout'), all: aggregate('all') },
};
const name = `${date}-${client.model}${args.label ? `-${args.label}` : ''}-${set.includes(',') ? 'some' : set}.json`;
writeFileSync(join(RESULTS, name), JSON.stringify(out, null, 1));
if (args.latest || set === 'all') {
  writeFileSync(join(RESULTS, 'latest.json'), JSON.stringify(out, null, 1));
  // The site's Accuracy page imports this copy at build time.
  writeFileSync(join(EVAL_DIR, '..', '..', 'frontend', 'src', 'data', 'accuracy.json'), `${JSON.stringify(out)}\n`);
}

console.log(`\n| Document | Set | Core F1 | Precision | Recall | Numbers | Verbatim violations | Time | Cost |`);
console.log(`|---|---|---|---|---|---|---|---|---|`);
for (const r of rows) {
  const s = r.score;
  console.log(
    `| ${r.id} | ${r.role} | ${s ? pct(s.core.f1) : '–'}${r.runs ? ` (runs: ${r.runs.map(pct).join(', ')})` : ''} | ${s ? pct(s.core.precision) : '–'} | ${s ? pct(s.core.recall) : '–'} | ` +
      `${s ? `${pct(s.numeric.accuracy)} (${+s.numeric.correct.toFixed(1)}/${+s.numeric.total.toFixed(1)})` : '–'} | ${s ? s.verbatimViolations.length : '–'} | ` +
      `${(r.timeMs / 1000).toFixed(0)} s | ${r.costUsd === null ? '–' : `$${r.costUsd.toFixed(3)}`} |`,
  );
}
console.log(`\nwrote eval/results/${name}`);
