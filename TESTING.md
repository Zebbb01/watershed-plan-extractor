# Testing

Accuracy is the largest part of this assessment, so it is measured the same way every
time: the production pipeline runs on Mississippi watershed plans and a script scores it
against ground truth written from the PDFs. The live site's Accuracy page shows the latest run.

## What is measured

| Requirement | Metric | Bar |
| --- | --- | --- |
| Main goals, BMPs and activities | F1 over goals, BMPs, implementation activities and outreach activities (precision and recall reported too) | ≥ 75% |
| Quantitative metrics | Share of ground-truth numbers on found items whose value and unit match exactly (number precision reported too) | ≥ 75% |
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
| Owl Creek – Little Hatchie River 2020 | Nine key elements | 12 | Held out | 64 |
| Fuller Creek – Town Creek 2022 | Nine key elements | 13 | Unseen, not labelled | none |
| Tchoutacabouffa River 2007 | Community action plan | 22 | Unseen, not labelled | none |
| Ross Barnett Reservoir 2011 | Two-column consultant report, 61 MB | 647 | Smoke test (size) | none |
| Columbia County, Washington, VSP Work Plan 2018 | Voluntary Stewardship Program work plan: goals, benchmarks, practices by county | 212 | Smoke test (another state's format) | none |

Prompts and rules were tuned only on the tuning plans. The held-out plan was labelled after
tuning ended and scored once, on the final settings, so its numbers estimate performance on
a plan the tool has not seen. Fuller Creek and Tchoutacabouffa were planned as further
held-out plans; there was not time to label them, so they were run as unseen plans and
checked for failures, counts and violations only.

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
- No second person checked the items one by one; the script check above is the only
  verification, and no item was changed after seeing an extraction's output.
- Names that legitimately vary within a plan (a plural in one section, an abbreviation in
  a table) carry aliases, so a correct extraction is not scored as a miss.
- The scanned plan is labelled on four pages (its goals, BMP and schedule sections), because
  hand-transcribing 108 pages was not feasible. Extracted items from other pages of that
  plan are not scored.

## How items are scored

`backend/eval/score.ts`

- **Matching:** within each category, ground-truth and extracted items are paired
  one-to-one, best pair first. Names are compared on word stems with stop words removed,
  so "Terraces" matches "terrace". When a name of two or more words is contained in the
  other with at most three extra words, the pair scores at least 0.9; otherwise the score
  is the word overlap, so a single word ("Protection") never matches a longer name by
  containment. A pair needs 0.6, and a name that is only similar (not the same stems) must
  be cited within one page of the labelled page.
- **Precision** is matched ÷ extracted, **recall** matched ÷ ground truth, **F1** their
  harmonic mean.
- **Numbers** are scored on matched items: each ground-truth number must be among the
  item's numbers with the same value (exactly, so 5,500 is not 5,509) and the same unit.
  Counted things ("12 grade stabilization structures") compare as counts. A number on a
  missed item is not scored here; the miss already counts against recall. **Number
  precision** is the reverse: of the numbers the tool reports on found items whose numbers
  the ground truth lists, the share that are right, so a wrong extra number counts.
- **Verbatim violations** are extracted BMP, outreach and area names and monitoring
  parameters that are not written in the PDF's text. The scorer checks this with its own
  test, not the verifier's matcher: the words in order, as whole words, with decimal points
  kept. Goal and activity names are short labels the model may phrase, so they are not
  counted. Items read only from scanned pages are not counted either, because the PDF has
  no text there to check against (this covers the whole scanned plan).
- **Time and cost** come from the run itself: wall-clock time with four parallel calls, and
  token usage priced at the provider's list prices.

The eval runs the production pipeline and passes every request through the API routes' own
schema and size checks before calling the same handlers, so a request the live site would
refuse fails in the eval too. Run it with `npm run eval -- --set dev`, `--set heldout` or
`--set all`, and `--model <id>` to compare models. Each run writes
`backend/eval/results/<date>-<model>-<set>.json` and the per-plan outputs.

## Results

Final settings: Claude Haiku 5.5 for extraction and OCR, run on 2026-10-21. The scores are in
`backend/eval/results/2026-10-21-claude-haiku-5-5-all.json` and each plan's full output in
`backend/eval/results/runs/`. Each plan was run once on these settings. The model is not
deterministic, so a second run gives somewhat different figures; that spread was not measured.

| Plan | Role | Core F1 | Precision | Recall | Numbers | Names not in the PDF | Time | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Broken Pumpkin Creek 2019 | Tuning | 93.3% | 96.6% | 90.3% | 89.0% (81/91) | 0 | 31 s | $0.017 |
| Bell Creek 2012 | Tuning | 76.3% | 72.5% | 80.6% | 85.3% (29/34) | 0 | 60 s | $0.046 |
| Buttahatchee River 2004 (scanned) | Tuning | 68.1% | 72.7% | 64.0% | 0/1 | not checkable | 210 s | $0.166 |
| **Owl Creek 2020** | **Held out** | **81.0%** | 78.0% | 84.2% | **100% (24/24)** | **0** | 33 s | $0.015 |
| **All four plans** (micro-average) | | **81.4%** | 80.6% | 82.2% | **89.3% (134/150)** | **0** | | $0.244 |

Against the bars:

- **Goals, BMPs and activities, ≥ 75%:** met. 81.4% F1 over the four plans and 81.0% on the
  held-out plan. The scanned plan is below the bar (68.1%, on 25 labelled items).
- **Quantitative metrics, ≥ 75%:** met. 89.3% of numbers exact over the four plans, 24 of 24
  on the held-out plan. Number precision is lower (67% to 76% on the text plans): the tool
  also reports numbers the answer key does not list. Those were not analysed one by one.
- **No false positives for copied content:** 0 extracted BMP, outreach, area or parameter names
  that are not written in the PDF, on all five text plans that were checked (the four above
  without the scan, plus Fuller Creek and Tchoutacabouffa). Before display, the verifier
  rejected 10 to 84 items per plan; they are listed under Quality with their reasons.
- **Categorisation:** 88% to 100% of found items are in the answer key's category, and 91% to
  100% have its kind (main, sub-item or example).

By category, over the four plans:

| Category | In answer key | Extracted | Matched | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- |
| Goals | 28 | 22 | 14 | 63.6% | 50.0% | 56.0% |
| BMPs | 51 | 51 | 50 | 98.0% | 98.0% | 98.0% |
| Implementation activities | 90 | 90 | 72 | 80.0% | 80.0% | 80.0% |
| Outreach activities | 28 | 38 | 26 | 68.4% | 92.9% | 78.8% |
| Monitoring metrics (not in core) | 42 | 43 | 33 | 76.7% | 78.6% | 77.6% |
| Geographic areas (not in core) | 45 | 51 | 33 | 64.7% | 73.3% | 68.8% |

The two unlabelled plans ran without a failed section: Fuller Creek (13 pages) in 34 s for
$0.013, Tchoutacabouffa (22 pages) in 26 s for $0.019. The six plans together cost $0.28.

## Model comparison

The tuning plans, before the last tuning change (running heads on transcribed pages). Same
settings and scorer for each model; one run each.

| Model | Broken Pumpkin | Bell Creek | Buttahatchee | Core F1, three plans | Numbers | Names not in the PDF | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Haiku 5.5 | 93.3% | 71.9% | 58.8% | 77.8% | 88.1% (111/126) | 0 | $0.24 |
| Sonnet 5.5 (OCR on Haiku 5.5) | 92.1% | 74.4% | 61.5% | 79.0% | 84.3% (107/127) | 0 | $2.73 |
| Opus 5.5 | 91.3% | not run | not run | | 87.8% (79/90) | 0 | $0.69 for one plan |

Haiku 5.5 is the default. Sonnet scored 1.2 points higher on F1 for 11 times the cost, and
lower on numbers; Opus did not beat Haiku on the plan it was run on. Haiku's final run on the
same plans scored 81.5%; part of that rise is run-to-run spread, which was not measured.

## What tuning changed

Each change was measured on the tuning plans before it was kept. The log with every run is
`backend/eval/results/log.md`.

| # | Change | Plan | Model | Core F1 | Numbers |
| --- | --- | --- | --- | --- | --- |
| 0 | First run (6-page units, one call per unit) | Broken Pumpkin | Sonnet 5.5 | 84.7% (4 sections timed out) | 50.0% |
| 0 | First run | Broken Pumpkin | Haiku 5.5 | 68.0% (6 sections failed) | 1.6% |
| 1 | Streamed calls, connection errors retried, 3-page / 40-row units, two calls per unit | Broken Pumpkin | Sonnet 5.5 | 84.7% → 92.8% | 50.0% → 88.0% |
| 1 | same | Broken Pumpkin | Haiku 5.5 | 68.0% → 89.3% | 1.6% → 90.2% |
| 2 | Prompt: every list item and table row; headings are not items; each call told which categories the other call covers | Bell Creek | Sonnet 5.5 | 65.4% → 78.9% | 80.6% → 75.8% |
| 2 | same | Bell Creek | Haiku 5.5 | 63.9% → 71.6% | 82.4% → 82.9% |
| 3 | Scanned pages: sub-bullet glyphs, numbered section titles, running dates; action lists are activities | Buttahatchee | Haiku 5.5 | 66.7% → 65.2% (within run-to-run spread) | |
| 4 | Running heads removed from transcribed pages too | Buttahatchee | Haiku 5.5 | 58.8% → 68.1% (final run); this plan's runs have ranged from 58.8% to 68.1%, so the change cannot be told apart from spread | |
| 5 | Prompt: whatever the plan calls a goal or objective is a goal, education objectives included. **Not kept** | Broken Pumpkin, Bell Creek | Haiku 5.5 | 93.3% → 92.6% and 76.3% → 72.7%. More goals were found, but named by their lead-in ("The ultimate goal"), so none more matched | 89.0% → 89.1%, 85.3% → 76.5% |

Change 5 was tried after the final run. In the same run the held-out and scanned plans lost
sections to API timeouts, so it says nothing about them; their reported scores are still the
final run's.

The jump in step 1 is mostly reliability: the first runs lost whole sections to timeouts and
dropped connections, and every item in a lost section counts as a miss.

## Known misses

Where the tool loses points, from reading the tuning runs item by item:

- **Goals** are the weakest category (14 of 28 found). In narrative plans (Bell Creek, 6 of
  17) objectives written inside paragraphs, or split between a goal and its sub-objectives,
  are often merged or missed.
- **Activities in narrative plans:** evaluation procedures and reporting duties are listed as
  activities the answer key does not count, so precision there is 67% (29 of 43).
- **Actions worded like outcomes on scanned pages** (Buttahatchee pages 20–21: "Reduce
  sediment loads to streams" under "The following actions will need to be taken") are often
  filed as goals instead of activities (10 of 19 activities found).
- **Outreach the plan describes in general terms** is extracted item by item. Page 6 of the
  held-out plan lists training workshops, festival planning, field days, tree boards and
  poster projects as ways stakeholders take part; the answer key counts only the outreach the
  plan schedules, so outreach precision there is 57% (8 of 14). Whether those count is a
  judgement call, and the answer key was not changed after seeing the output.
- **Geographic areas mentioned in passing** (tributaries, neighbouring watersheds) are
  extracted beyond the ones the answer key lists (25 for 15 on Bell Creek), which lowers area
  precision; areas are not part of the core score.
- **Numbers** on found items are right 89% of the time (134 of 150); the misses were not
  analysed one by one.

## Smoke tests

The largest file and a plan from another state, run once on the final settings to check that
they complete. They ran through the eval CLI, which runs the site's pipeline and API checks
but reads the PDF in Node rather than the browser. Neither is labelled, so neither has an
accuracy score.

| Plan | Pages | Time | Cost | Failed sections | Scanned pages | Items kept | Rejected by the verifier | Names not in the PDF |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ross Barnett Reservoir 2011 (61 MB) | 647 | 554 s | $0.55 | 0 | 12 | 747 | 384 | 0 |
| Columbia County, Washington, VSP 2018 | 212 | 146 s | $0.15 | 0 | 0 | 218 | 129 | 0 |

From reading the output (not scored):

- **Ross Barnett** restarts "Objective 1" to "Objective 7" in each sub-watershed section. The
  merge joined the four "Objective 1"s into one item that showed one objective's text with
  four unrelated quotes. Fixed after the run: items under a bare label now merge only when
  their texts match. The plan was not run again to save cost, so the unit tests in
  `merge.test.ts` are the only check of the fix.
- **Columbia County** (another state's format): the benchmarks, NRCS practices with their codes
  ("Cover Crop (340)") and outreach are found. Some appendix descriptions were taken as items
  ("Describes the organization leads that provide technical assistance in the County"), and
  benchmark headings appear both as goals and as monitoring metrics.

## Automated tests

`npm test` runs the unit tests in both workspaces (Vitest). They cover:

- text normalisation and quote matching, including Wingdings glyphs, hyphenation, decimal
  points, whole-word names and OCR tolerance;
- quantity and timeframe parsing (ranges, comparators, dollar amounts, units, word numbers,
  practice codes in brackets);
- layout: baselines, columns and sidebars, bullets and indent levels, tables, headings,
  running headers (also when a page reads them as a table row), contents pages, plus
  fixtures captured from real plan pages;
- work units, page skipping and regex hints;
- verification: every rejection reason, confidence levels, the cost arithmetic check, and
  the cases a model gets wrong in practice (a moved decimal point, a changed unit, a number
  from another table row, a spelled-out number, an invented timeframe, status, pollutant,
  audience or scope, a name found only inside other words);
- merging, conflicts, parent links and lowest-confidence joins, and labels such as
  "Objective 1" that restart in each section; the summary and completion rate;
- the pipeline: OCR in pairs with splitting and rate-limit retries, rate-limit backoff,
  splitting a unit that times out, failed work reported rather than lost, cancellation;
- both LLM adapters with mocked SDK responses (request shape, no SDK retries, effort and
  fallback only where a model takes them), and the API handlers;
- the scorer itself (stems, aliases, page proximity, number precision, its own verbatim
  test);
- request validation, size caps, error codes, the rate limiter and the security headers;
- file validation (extension, `%PDF-` signature, size, encrypted or corrupt files),
  the run orchestration and the cache (a stored result with failed sections runs again);
- CSV export, including formula-injection escaping.

`npm run typecheck` checks both workspaces.

## What was not measured

- Scanned plans end to end through the live site. The eval reads PDFs in Node, where pdf.js
  finds its image decoders on its own; in the browser it needs them served and allowed by the
  CSP. A JPEG 2000 scan (West Boley Creek 2007) first came out as blank pages on the live site
  and was fixed. The fix was checked in a local production build up to the AI call: every page
  image now carries the scan. The AI's reading of those pages was not run again.
- The OpenAI path (`gpt-6.1-sol` through the Responses API with a strict JSON schema). It is
  built and unit-tested with mocked responses, but no OpenAI key was used, so it was never run
  against the live API.
- The verbatim check on the scanned plan, which has no text layer.
- How often a quote gets marked on a scanned page. Tesseract reads the page image in the
  browser only to place the highlight. It was checked on Buttahatchee pages 104 and 106 in a
  local production build (both quotes marked on the right line), not across the plan. When
  it cannot find a quote, the page says so and the quote stays shown above it.
- Agreement between two annotators: the ground truth has one author and the script check.
- Plans from outside Mississippi beyond the smoke test.
- Memory use on phones for files far above 100 MB.
