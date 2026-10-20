# Testing

Accuracy is the largest part of this assessment, so it is measured the same way every
time: the production pipeline runs on Mississippi watershed plans and is scored against
hand-checked ground truth by a script. The live site's Accuracy page shows the latest run.

## What is measured

| Requirement | Metric | Bar |
| --- | --- | --- |
| Main goals, BMPs and activities | F1 over goals, BMPs, implementation activities and outreach activities (precision and recall reported too) | ≥ 75% |
| Quantitative metrics | Share of ground-truth numbers on found items whose value and unit match exactly | ≥ 75% |
| No false positives for copied content | Extracted names that do not appear in the PDF text | 0 |
| Proper categorisation | Items found in the right category ÷ items found in any category; `kind` (main, sub, example) agreement on found items | reported |

## The evaluation set

The PDFs are pinned by SHA-256 in `backend/eval/docs.json`;
`npm run eval:fetch -w backend` downloads them from MDEQ and checks them.

| Plan | Format | Pages | Role | Ground-truth items |
| --- | --- | --- | --- | --- |
| Broken Pumpkin Creek 2019 | Nine key elements, cost tables | 11 | Tuning | 90 |
| Bell Creek – West Prong Muddy Creek 2012 | Narrative, Wingdings bullets | 53 | Tuning | 97 |
| Buttahatchee River 2004 | Scanned, no text layer | 108 | Tuning | 33 (pages 3, 4, 20, 21) |
| Owl Creek – Little Hatchie River 2020 | Nine key elements | 12 | Held out | {{GT_OWL}} |
| Fuller Creek – Town Creek 2022 | Nine key elements | 13 | Held out | {{GT_FULLER}} |
| Tchoutacabouffa River 2007 | Community action plan | 22 | Held out | {{GT_TCHOU}} |
| Ross Barnett Reservoir 2011 | Two-column consultant report, 61 MB | 647 | Smoke test (size) | none |
| Columbia County, Washington, VSP Work Plan 2018 | Voluntary Stewardship Program work plan: goals, benchmarks, practices by county | 212 | Smoke test (another state's format) | none |

Prompts and rules were tuned only on the tuning plans. The held-out plans were labelled
after tuning ended and scored once, on the final settings, so their numbers estimate
performance on plans the tool has not seen.

The four formats cover the variations found in the MDEQ collection: nine-key-element plans
(elements a–i, cost tables, numbered schedules), 2012 narratives (bulleted practice lists,
quantity lists, milestones repeated in an appended grant proposal), 2006–2007 action plans
(action items with indicators and budgets), and scans.

## How the ground truth was made

- Each plan was read page by page and every goal, BMP, activity, monitoring metric,
  outreach activity and geographic area was recorded with its page, a verbatim quote, its
  kind and its numbers. The draft was written with an AI assistant from the PDF alone,
  before any extraction had run, so no model output was copied into it.
- `npm run eval:gt -w backend` checks every quote and every name that must be verbatim
  against the PDF text. It reports 0 problems on the text plans.
- {{GT_SPOTCHECK}}
- Names that legitimately vary within a plan (a plural in one section, an abbreviation in
  a table) carry aliases, so a correct extraction is not scored as a miss.
- The scanned plan is labelled on four pages (its goals, BMP and schedule sections), because
  hand-transcribing 108 pages was not feasible. Extracted items from other pages of that
  plan are not scored.

## How items are scored

`backend/eval/score.ts`

- **Matching:** within each category, ground-truth and extracted items are paired
  one-to-one, best pair first. Names are compared on word stems with stop words removed,
  so "Terraces" matches "terrace". When one name contains the other with at most three
  extra words, the pair scores at least 0.9; otherwise the score is the word overlap. A pair
  needs 0.6. Evidence within one page of the labelled page breaks ties.
- **Precision** is matched ÷ extracted, **recall** matched ÷ ground truth, **F1** their
  harmonic mean.
- **Numbers** are scored on matched items: each ground-truth number must be among the
  item's numbers with the same value (exactly, so 5,500 is not 5,509) and the same unit.
  Counted things ("12 grade stabilization structures") compare as counts. A number on a
  missed item is not scored here; the miss already counts against recall.
- **Verbatim violations** are extracted BMP, outreach, area and monitoring names that are
  not in the PDF's text, after the normalisation the verifier uses. Goal and activity
  names are short labels the model may phrase, so they are not counted. The scanned plan
  has no text layer to check against, so it is not counted there either.
- **Time and cost** come from the run itself: wall-clock time with four parallel calls, and
  token usage priced at the provider's list prices.

Run it with `npm run eval -- --set dev`, `--set heldout` or `--set all`, and
`--model <id>` to compare models. Each run writes `backend/eval/results/<date>-<model>-<set>.json`
and the per-plan outputs.

## Results

{{RESULTS}}

## Model comparison

{{MODEL_COMPARISON}}

## What tuning changed

Each change was measured on the tuning plans before it was kept.

{{TUNING_LOG}}

## Known misses

{{KNOWN_MISSES}}

## Smoke tests

{{SMOKE_TESTS}}

## Automated tests

`npm test` runs the unit tests in both workspaces (Vitest). They cover:

- text normalisation and quote matching, including Wingdings glyphs, hyphenation and
  OCR tolerance;
- quantity and timeframe parsing (ranges, comparators, dollar amounts, units, word numbers);
- layout: baselines, columns and sidebars, bullets and indent levels, tables, headings,
  running headers, contents pages, plus fixtures captured from real plan pages;
- work units, page skipping and regex hints;
- verification: every rejection reason, confidence levels and the cost arithmetic check;
- merging, conflicts and parent links; the summary and completion rate;
- the pipeline: OCR batching, rate-limit backoff, splitting a unit that times out, a
  failed unit not failing the run, cancellation;
- both LLM adapters with mocked SDK responses, and the API handlers;
- request validation, size caps, error codes, the rate limiter and the security headers;
- file validation (extension, `%PDF-` signature, size, encrypted or corrupt files),
  the run orchestration and the cache;
- CSV export, including formula-injection escaping.

`npm run typecheck` checks both workspaces.

## What was not measured

- {{OPENAI_NOTE}}
- The verbatim check on the scanned plan, which has no text layer.
- Agreement between two annotators: the ground truth has one author and a spot-check.
- Plans from outside Mississippi beyond the smoke test.
- Memory use on phones for files far above 100 MB.
