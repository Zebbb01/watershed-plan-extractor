# Watershed Plan Extractor

Reads a watershed plan PDF and returns its goals, best management practices (BMPs),
implementation activities, monitoring metrics, outreach activities and geographic areas.
Every item links to the page it came from and the exact words that support it.

Built for ChowaCo's Document Extraction Tool assessment.

**Live demo: {{LIVE_URL}}** (no login; the sample plans open instantly)

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
   area, organisation or parameter name must appear there verbatim. Every number must be
   written in the source. An item that fails is listed with its reason under Quality and
   is never shown as data.
6. **Code merges and counts.** Duplicates across sections become one item with all its
   evidence. Two different amounts for the same thing are flagged for review. Totals and
   the completion rate are computed in code, never by the model.

{{ACCURACY_SUMMARY}} The method and the per-plan results are in [TESTING.md](TESTING.md).

## Using it

- **Drop a PDF** (text or scanned, up to 300 MB) or open a sample plan. Plans over 100
  pages show the page count and an estimated time first.
- **Progress** is shown per stage. Items appear as sections finish, and you can cancel.
- **Overview:** counts, the completion rate with its basis, and charts for items by
  category, BMP amounts by unit, BMP costs and the implementation timeline. Every chart
  has a table view.
- **One tab per category:** a sortable table with search, an area filter, kind and
  "needs review" filters. Each row opens its evidence: the PDF page with the quote
  highlighted.
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
| `EXTRACTION_MODEL` | no | `claude-opus-5-5`, or `gpt-6.1-sol` on OpenAI | Model for extraction |
| `OCR_MODEL` | no | the same provider default | Model for scanned pages |
| `EXTRACTION_EFFORT` | no | `low` | `low`, `medium` or `high` |
| `MAX_PAGES` | no | `800` | Largest document one run accepts |
| `RATE_LIMIT_PER_MIN` | no | `60` | API calls per minute per client address |
| `NODE_ENV` | set by the host | | `production` on the live site |

Keys are read only on the server. They never reach the browser, and `/api/health` reports
which provider is configured, never a key.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3100 |
| `npm run build` then `npm start -w frontend` | Production build and server |
| `npm test` | Unit tests in both workspaces |
| `npm run typecheck` | TypeScript in both workspaces |
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
  src/proxy.ts            per-request CSP nonce
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
- A per-client rate limit slows bursts; the provider's spend limit is the hard cap.
- Document text is passed to the model as data inside delimiters. The model has no tools,
  its output must match the schema, and the verifier drops anything not found in the
  source.
- Pages are served with a nonce-based Content Security Policy, HSTS, `nosniff`,
  `frame-ancestors 'none'`, a strict referrer policy and a permissions policy.
- CSV export escapes cells that a spreadsheet would run as formulas.
- Logs record the request id, timings and token counts, never document content.
- The PDF stays in the browser. The server stores nothing. Anthropic and OpenAI do not
  train on API data by default.

## Known limits

- The rate limit is kept per server instance, so on serverless hosting it slows a burst
  from one browser but is not a global cap.
- A section that still fails after its retries is reported with its pages; re-running the
  file retries it.
- The area filter shows items that mention the chosen area. Plans rarely tie each item to
  one county, so it is not a strict partition.
- Files far above 100 MB are read in the browser, so a phone may run short of memory where
  a laptop does not.

The test PDFs are public documents from the Mississippi Department of Environmental
Quality.
