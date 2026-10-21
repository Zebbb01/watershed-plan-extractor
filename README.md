# Watershed Plan Extractor

Reads a watershed plan PDF and returns its goals, best management practices (BMPs),
implementation activities, monitoring metrics, outreach activities and geographic areas.
Every item links to the page it came from and the exact words that support it.

Built for ChowaCo's Document Extraction Tool assessment.

**Live demo: https://watershed-plan-extractor.netlify.app** (no login; the sample plans open instantly)

## The approach in one minute

Code and an LLM each do the part they are reliable at.

1. **The browser reads the PDF** with pdf.js. A 100 MB+ file is never uploaded: only page
   text, and images of table or scanned pages, are sent for analysis.
2. **Code rebuilds the layout.** Columns, headings, bullet levels, tables and captions are
   recovered from text positions. Running headers, page numbers, contents pages,
   acknowledgements and references are removed. The model sees `## Heading`,
   `• [L1] item`, `• [L2] sub-item` and `| cell | cell |`, not a stream of words.
3. **Scanned pages are transcribed** by a vision model and then go through the same steps.
4. **The LLM extracts** a few pages at a time into a strict schema. It must quote the page
   for every item and copy every name and amount exactly as printed. Table pages go with
   their image, so rows and columns line up.
5. **Code verifies every item and fails closed.** The quote must be on the page. A BMP,
   area, organisation or parameter name must appear there verbatim, as whole words. An
   amount must be written as reported, in the quote or on the item's own table row, and
   timeframes, audiences, pollutants and statuses are kept only when the document states
   them. Whatever fails is listed with its reason under Quality and never shown as data.
6. **Code merges and counts.** Duplicates across sections become one item with all its
   evidence. Two different amounts for the same thing are flagged for review. Totals and
   the completion rate are computed in code, never by the model.

**Accuracy**, scored by script against answer keys for four Mississippi plans:
81.4% F1 on goals, BMPs and activities (81.0% on a plan held out from tuning), 89.3% of
numbers exact, and 0 extracted names that are not written in the PDF. The method and the
per-plan results are in [TESTING.md](TESTING.md).

## Using it

- **Drop a PDF** (text or scanned, up to 300 MB) or open a sample plan. Plans over 100
  pages show the page count and an estimated time first.
- **Progress** is shown as one bar plus per-stage steps, with time elapsed and left. Items
  are counted as sections finish. Stopping asks first. The run keeps going if you open
  another page; the header shows where it stands.
- **Run again:** a report with failed sections, or with no readable page, has a button that
  runs the file again in place. If the file is no longer open in the tab, it asks for it and
  checks it is the same file (SHA-256) first.
- **Overview:** tiles that open their tab, the completion rate with its basis, how many
  proposed items passed the checks, and charts for items by category, activity status, BMP
  amounts by unit, BMP costs and the implementation timeline. Every chart has a table view.
- **One tab per category:** a sortable table with kind and "needs review" filters. Each row
  opens its evidence: the PDF page with the quote highlighted.
- **Search and area filter** apply to every tab, the overview's tiles and charts included,
  and a bar under the tabs shows what is filtered.
- **Compare with PDF** (wide screens): the results and the original PDF side by side.
  Picking an item turns the PDF to its page with the quote highlighted; the items found on
  the shown page are listed under it. A report reopened later asks for the same file again
  and checks its SHA-256 before showing it.
- **Quality tab:** the verified share, rejected items with reasons, conflicting amounts,
  OCR pages, skipped pages, the reconstructed outline, and the model, time and cost.
- **Export:** JSON (the `ExtractedReport` interface plus document and quality data), CSV of
  the current tab, or a printable report.
- **Recent extractions** stay in this browser (IndexedDB), so reopening a file costs
  nothing.

## Framework

| Part | Choice | Why |
| --- | --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript | One deployable unit: pages plus thin API routes |
| Styling and UI | Tailwind CSS 4, Radix primitives, lucide icons | Accessible custom controls instead of browser defaults |
| Charts | Recharts | Bars and a timeline, each with a table view |
| Upload | react-dropzone | Drag and drop with a keyboard-reachable Browse button |
| PDF | pdf.js (`pdfjs-dist`) in the browser | Text with positions, page rendering, no upload |
| Engine | `backend/`: framework-free TypeScript | The same code runs in the browser, the API routes and the eval CLI |
| LLM | Anthropic (`@anthropic-ai/sdk`) or OpenAI (`openai`) | Structured output against a Zod schema; either key works |
| Validation | Zod | Model output, API requests and environment |
| Tests | Vitest | Unit tests in both workspaces; the eval measures accuracy |

## Run it locally

You need Node.js 20.9 or later (22 recommended), npm, and an Anthropic or OpenAI API key.

```bash
npm install
cp .env.example frontend/.env.local    # then set ANTHROPIC_API_KEY or OPENAI_API_KEY
npm run dev                            # http://localhost:3100
```

Without a key the app still runs: the samples work and a banner says live extraction is
off.

With Docker: `docker compose up --build`, then open http://localhost:3000. The container
reads the keys from `frontend/.env.local` when it starts; the image holds none.

## Environment variables

| Name | Required | Default | Purpose |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | one of the two | | Claude for extraction and OCR |
| `OPENAI_API_KEY` | one of the two | | OpenAI for extraction and OCR |
| `LLM_PROVIDER` | no | the key that is set, Anthropic first | `anthropic` or `openai` when both keys are set |
| `EXTRACTION_MODEL` | no | `claude-haiku-5-5` (chosen on the eval), or `gpt-6.1-sol` on OpenAI | Model for extraction |
| `OCR_MODEL` | no | the same provider default | Model for scanned pages |
| `EXTRACTION_EFFORT` | no | `low` on models that take an effort setting | `low`, `medium` or `high` |
| `MAX_PAGES` | no | `800` | Pages read from one document; later pages are left out |
| `RATE_LIMIT_PER_MIN` | no | `60` | API calls per minute per client address |
| `NODE_ENV` | set by the host | | `production` on the live site |

Keys are read only on the server. They never reach the browser, and `/api/health` reports
which provider is configured, never a key.

## Choosing a model

The default is Claude Haiku 5.5, because on this task a larger model did not buy accuracy.
On the tuning plans (one run each), Sonnet 5.5 scored 1.2 points higher F1 at 11 times the
cost and was worse on numbers; Opus 5.5 scored below Haiku on the one plan it ran, at 36
times the cost ([TESTING.md](TESTING.md), model comparison). Most of the accuracy comes from
small sections and the checks, not from the model's size.

To try another model, set `EXTRACTION_MODEL` (and `OCR_MODEL` for scanned pages) on the
server. It is a server setting on purpose: visitors to a public demo cannot pick an expensive
model and run up the bill.

## Long plans

Length does not change what the model is given. Every request carries at most three pages
(12,000 characters or 40 table rows) plus the document outline, so a 600-page plan is many
small requests, not one long prompt, and every item is checked against its own page. Length
adds time and cost (647 pages: 9 minutes, $0.55) and repeated content, which the merge step
joins. Accuracy was scored on plans of 11 to 108 pages; the 647-page plan was run for time,
cost and names not in the PDF (0), not scored against an answer key.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3100 |
| `npm run build` then `npm start -w frontend` | Production build and server |
| `npm test` | Unit tests in both workspaces |
| `npm run typecheck` | TypeScript in both workspaces |
| `npm run lint -w frontend` | ESLint with the Next.js and React hooks rules |
| `npm run eval:fetch -w backend` | Downloads the evaluation PDFs from MDEQ and checks their SHA-256 |
| `npm run eval:gt -w backend` | Checks every ground-truth quote against the PDF text |
| `npm run eval -- --set dev` | Runs the real pipeline on the tuning plans and scores it (`--set heldout`, `--set all`, `--model <id>`) |
| `npm run samples -w backend` | Rebuilds the sample results shown on the home page |
| `node scripts/check-secrets.mjs` | Fails if a tracked file holds a credential |
| `node scripts/check-licenses.mjs` | Fails on a production dependency outside the permissive licences |
| `node scripts/package-submission.mjs` | Builds the submission zip from the last commit after the secret scan |

## Project structure

```
frontend/                 Next.js app
  src/app/                pages (home, report, accuracy) and API routes
    api/extract/          one work unit -> verified items
    api/ocr/              scanned page images -> verbatim text
    api/health/           provider configured? limits (never a key)
  src/components/         home, processing, report tabs, charts, evidence panel, UI primitives
  src/lib/                browser PDF reading, run orchestration, storage, export
  src/server/             the only code that reads keys; rate limit, errors, security headers
backend/                  extraction engine (plain TypeScript, no framework)
  src/layout/             layout reconstruction: lines, columns, tables, headings, admin text
  src/text/               normalisation, quote matching, quantity parsing
  src/llm/                prompts and the Anthropic and OpenAI adapters
  src/units.ts            work units and regex hints
  src/verify.ts           the fail-closed checks
  src/merge.ts            cross-section dedupe and conflicts
  src/summary.ts          totals and completion rate
  src/pipeline.ts         the whole run: OCR, parallel extraction, retries, progress
  eval/                   ground truth, scorer and the eval CLI
scripts/                  secret scan, licence check, submission zip
```

## Documentation

- [EXTRACTION_LOGIC.md](EXTRACTION_LOGIC.md): each step of the pipeline and why it is there.
- [TESTING.md](TESTING.md): how accuracy was measured, the results, and what was not measured.
- [DEPLOYMENT.md](DEPLOYMENT.md): how the live demo is configured, its limits, and Docker.

## Security and privacy

- API keys live only in server environment variables. The module that reads them is
  marked `server-only`, so a build fails if browser code imports it.
- Every API request is validated with a strict Zod schema and size caps. Errors carry a
  code and a request id, never a stack trace.
- A per-client rate limit slows bursts; the provider account's prepaid balance or spend
  limit is the hard cap.
- Document text is passed to the model as data inside delimiters. The model has no tools,
  its output must match the schema, and the verifier drops anything not found in the
  source.
- Every response carries a Content Security Policy (scripts, connections and workers from
  this origin only, no framing, no plugins; WebAssembly may compile, for pdf.js's image
  decoders, but JavaScript eval may not), HSTS, `nosniff`, a strict referrer policy and a
  permissions policy. No document text is ever rendered as HTML.
- CSV export escapes cells that a spreadsheet would run as formulas.
- Logs record the request id, timings and token counts, never document content.
- The PDF stays in the browser. The server stores nothing. Anthropic and OpenAI do not
  train on API data by default.

## Known limits

- The rate limit is kept per server instance, so on serverless hosting it slows a burst
  from one browser but is not a global cap.
- A section that still fails after its retries is reported with its pages; dropping the
  same file again runs it again (complete results are reused, results with failed sections
  are not).
- Documents longer than `MAX_PAGES` (800) are read up to that page.
- The area filter shows items that mention the chosen area. Plans rarely tie each item to
  one county, so it is not a strict partition.
- Files far above 100 MB are read in the browser, so a phone may run short of memory where
  a laptop does not.

The test PDFs are public documents from the Mississippi Department of Environmental
Quality.
