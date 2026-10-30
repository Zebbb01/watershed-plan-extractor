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
| Yazoo Pass 2021 | Nine key elements | 14 | Held out (added 2026-10-29) | 74 |
| Coldwater River 2013 | Narrative (MRBI implementation plan), draft chapter headers | 35 | Held out (added 2026-10-29) | 45 (pages 6, 12–14, 17, 21, 24, 28–32) |
| Lake Washington 2007 | Narrative, organised by management action, DRAFT stamp | 98 | Held out (added 2026-10-29) | 46 (pages 49–52, 55, 56, 58–61) |
| West Boley Creek 2007 | Scanned (JPEG 2000) community action plan, numbered strategy lists | 40 | Held out (added 2026-10-29) | 73 (pages 6, 15–18) |
| Luxapallila Creek 2004 | Scanned basin plan, diamond sub-bullets | 112 | Held out (added 2026-10-29) | 34 (pages 3, 17, 18) |
| Bear Creek 2007, Bee Lake 2006, Deer Creek 2008, Ellison Creek 2021, Hickahala Creek 2009, Jasper Creek 2019, Pickwick Reservoir 2009, Red Bud – Catalpa Creek 2016 and 2017, Tarebreeches Creek 2012 | Narrative and nine key elements | 13 to 137 | Tuning, not labelled (added 2026-10-29) | none |
| Fuller Creek – Town Creek 2022 | Nine key elements | 13 | Unseen, not labelled | none |
| Tchoutacabouffa River 2007 | Community action plan | 22 | Unseen, not labelled | none |
| Ross Barnett Reservoir 2011 | Two-column consultant report, 61 MB | 647 | Smoke test (size) | none |
| Columbia County, Washington, VSP Work Plan 2018 | Voluntary Stewardship Program work plan: goals, benchmarks, practices by county | 212 | Smoke test (another state's format) | none |

The first round (2026-10-21 to 10-23) tuned on three plans and held out one. Its best number,
87% on the scanned Buttahatchee plan, came from one plan that had been tuned on, so it said
little about another plan. On 2026-10-29 the set was widened to test whether the tool
generalises:

- **Five more held-out plans** with answer keys, chosen to differ from the tuning plans:
  another nine-key-element plan, a 2013 MRBI implementation plan, a 98-page plan organised by
  management action, a JPEG 2000 scan written as strategy lists, and a second 112-page scan
  from the Buttahatchee series. Their answer keys were written from the PDFs before the tool
  ran on them. The code as it stood was then scored on them once (the baseline), and they
  were not used to choose any later change; the exceptions are disclosed under "What tuning
  changed".
- **Ten unlabelled tuning plans** (13 to 137 pages), run before and after each change and read
  for wrong, missing and badly named items. Changes were chosen from these and the three
  labelled tuning plans only.

The plans cover the variations found in the MDEQ collection: nine-key-element plans
(elements a–i, cost tables, numbered schedules), narratives from 2006 to 2019 (bulleted
practice lists, quantity lists, milestones repeated in an appended grant proposal, action
items with indicators and budgets), and scans. Six of the nine plans with answer keys are
held out: two of each format.

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
- Long and scanned plans are labelled on the pages that state their goals, practices and
  actions (listed in the table above), because transcribing 100 pages by hand was not
  feasible. Extracted items cited on other pages of those plans are not scored.
- The two held-out scans have no text layer, so their quotes were transcribed from the page
  images by eye and the script check does not apply to them.

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
  kept. A hyphen at a line end counts both as a split word and as part of a compound, and a
  name may follow a list number printed without a space. Goal and activity names are short labels the model may phrase, so they are not
  counted. Items read only from scanned pages are not counted either, because the PDF has
  no text there to check against (this covers the whole scanned plan).
- **Time and cost** come from the run itself: wall-clock time with four parallel calls, and
  token usage priced at the provider's list prices.
- **Repeats:** the model is not deterministic, and a single run of a plan has differed from
  the next by up to 33 points of F1 (Buttahatchee: 88.9% and 55.6% on the same settings).
  `--repeat 3` runs each plan three times; a plan's counts are averaged over its runs and its
  rates computed from those averages, and each run's F1 is kept beside the mean. The Accuracy
  page shows both. The plan output kept for the samples is the last run's, not the best one.

The eval runs the production pipeline and passes every request through the API routes' own
schema and size checks before calling the same handlers, so a request the live site would
refuse fails in the eval too. Run it with `npm run eval -- --set dev`, `--set heldout` or
`--set all`, `--repeat 3` to run each plan three times, and `--model <id>` to compare models. Each run writes
`backend/eval/results/<date>-<model>-<set>.json` and the per-plan outputs. `--set` also takes a list of
plan ids, and `--merge <result file>` takes the plans not run from a saved result, so a change that
alters only some plans' input is measured on those plans alone; the result file records which plans
came from where (`mergedFrom`). `npm run eval:rescore -w backend -- <model> [folder]` scores saved
outputs again without calling the model.

## Results

Final settings: Claude Haiku 5.5 for extraction and OCR, with the changes listed under "What
tuning changed" (final settings at the end of that section). Each labelled plan runs three
times (`--repeat 3`); the table gives the mean, with each run's core F1 beside it. The scores
are in `backend/eval/results/latest.json` (a copy of
`2026-10-30-claude-haiku-5-5-chain-luxapallila-2004.json`) and each plan's last run in
`backend/eval/results/runs/`.

That file was built with `--merge`, because changes 19 and 20 alter the work units of only some
plans and the credits for a full run were limited. Luxapallila ran on the final code;
Buttahatchee, Owl Creek and Yazoo Pass ran with change 19 (`2026-10-30-…-lists-some.json`),
which gives them the same units as change 20; the other five labelled plans ran on 2026-10-29
with change 18 (`2026-10-29-claude-haiku-5-5-all.json`), whose units changes 19 and 20 leave
as they are. For the text plans that is checked exactly; for the scans it was checked on each
plan's saved transcript, and another transcript could be grouped differently.

| Plan | Role | Core F1 (mean) | Each run | Precision | Recall | Numbers | Names not in the PDF | Time | Cost |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Broken Pumpkin Creek 2019 | Tuning | 94.5% | 96.7%, 92.6%, 94.3% | 96.1% | 93.0% | 87.7% | 0 | 26 s | $0.017 |
| Bell Creek 2012 | Tuning | 72.4% | 72.0%, 72.7%, 72.4% | 67.3% | 78.2% | 80.8% | 0 | 50 s | $0.045 |
| Buttahatchee River 2004 (scanned) | Tuning | 85.1% | 79.1%, 90.9%, 84.0% | 86.3% | 84.0% | 0 of 1 | not checkable | 220 s | $0.170 |
| **Owl Creek 2020** | **Held out** | **91.9%** | 89.2%, 94.4%, 92.1% | 94.4% | 89.5% | 91.8% | 0 | 21 s | $0.015 |
| **Yazoo Pass 2021** | **Held out** | **78.2%** | 73.9%, 77.8%, 83.1% | 79.7% | 76.8% | 73.1% | 0 | 20 s | $0.015 |
| **Coldwater River 2013** | **Held out** | **76.7%** | 75.0%, 76.2%, 79.1% | 72.9% | 81.0% | 71.8% | 0 | 38 s | $0.024 |
| **Lake Washington 2007** | **Held out** | **67.0%** | 71.4%, 73.2%, 55.9% | 71.4% | 63.1% | 100% (2.7 of 2.7) | 0 | 168 s | $0.137 |
| **West Boley Creek 2007 (scanned)** | **Held out** | **78.3%** | 77.0%, 80.7%, 77.4% | 83.9% | 73.4% | none in key | not checkable | 76 s | $0.049 |
| **Luxapallila Creek 2004 (scanned)** | **Held out** | **78.0%** | 63.4%, 86.3%, 81.6% | 83.3% | 73.3% | none in key | not checkable | 302 s | $0.222 |
| Tuning plans (micro-average) | | 82.6% | | 80.4% | 84.9% | 85.2% | 0 | | $0.232 |
| **Held-out plans (micro-average)** | | **78.6%** | | 81.6% | 75.8% | **80.8%** | **0** | | $0.462 |
| **All nine plans** | | **80.3%** | | 81.1% | 79.5% | **83.7%** | **0** | | $0.694 |

### Generalisation: the held-out plans before and after

"Before" is the code of 2026-10-23: one run on each new held-out plan, made after its answer key
was written and before any change of this round (outputs in
`backend/eval/results/baseline-2026-10-29/`), and Owl Creek's three-run mean of 2026-10-22.

| Plan | Before | After |
| --- | --- | --- |
| Owl Creek 2020 | 82.2% | 91.9% |
| Yazoo Pass 2021 | 81.7% | 78.2% |
| West Boley Creek 2007 (scanned) | 80.3% | 78.3% |
| Coldwater River 2013 | 58.5% | 76.7% |
| Lake Washington 2007 | 80.0% | 67.0% |
| Luxapallila Creek 2004 (scanned) | 53.3% | 78.0% |
| **Six held-out plans** | **76.2%** | **78.6%** |
| Fully blind: Owl Creek, Yazoo Pass, West Boley | 81.3% | 81.8% |
| Format seen while labelling: Coldwater, Lake Washington, Luxapallila | 66.7% | 72.9% |

Read this with the run-to-run spread in mind: single runs of one plan differ by up to 17 points
here (Lake Washington 55.9% to 73.2%, Luxapallila 63.4% to 86.3%), and the "before" of five
plans is one run each, so a per-plan difference under about 10 points says little. The totals
are steadier. The clear gains are where a format rule applied: Luxapallila's diamond-bulleted
action list (change 14) and Coldwater's chapter headers (change 13), both seen while labelling
those plans. On the fully blind plans the tool is as good as before, not better. Lake
Washington lost most of its stated targets in the final runs (see Known misses). The four plans
of the 2026-10-22 report score 84.3% together, against 83.7% then.

Against the bars:

- **Goals, BMPs and activities, ≥ 75%:** met over all nine plans (80.3%), the tuning plans
  (82.6%) and the held-out plans (78.6%). Not by every plan: Bell Creek (72.4%) and Lake
  Washington (67.0%) are below, and single runs go as low as 55.9%.
- **Quantitative metrics, ≥ 75%:** met. 83.7% of numbers exact over the nine plans (161 of 192
  per run on average) and 80.8% on the held-out plans; Yazoo Pass (73.1%) and Coldwater (71.8%)
  are just below. Number precision is 65% to 89% on the text plans: the tool also reports
  numbers the answer key does not list.
- **No false positives for copied content:** 0 extracted BMP, outreach, area or parameter names
  that are not written in the PDF, in every run of the six labelled text plans, and in the saved
  output of each of the twelve unlabelled text plans and the two smoke tests
  (`npm run eval:rescore -w backend -- claude-haiku-5-5`). The scorer's own check first had to be
  fixed: it read a list number printed without a space ("11.Develop") and a hyphen at a line end
  ("re-" then "vegetating") as other words, and so flagged 5 names on two unlabelled plans that
  are written in the PDF. Before display, the verifier rejected 11 to 328 items per plan; they
  are listed under Quality with their reasons.
- **Categorisation:** 95% to 99% of found items are in the answer key's category, and 84% to
  100% have its kind (main, sub-item or example).

By category, over the nine plans (per run, averaged over the three):

| Category | In answer key | Extracted | Matched | Precision | Recall | F1 |
| --- | --- | --- | --- | --- | --- | --- |
| Goals | 62 | 46.7 | 36.3 | 77.9% | 58.6% | 66.9% |
| BMPs | 72 | 72.0 | 65.7 | 91.2% | 91.2% | 91.2% |
| Implementation activities | 191 | 188.3 | 151.7 | 80.5% | 79.4% | 80.0% |
| Outreach activities | 65 | 75.3 | 56.3 | 74.8% | 86.7% | 80.3% |
| Monitoring metrics (not in core) | 81 | 78.3 | 59.7 | 76.2% | 73.7% | 74.9% |
| Geographic areas (not in core) | 85 | 87.7 | 67.0 | 76.4% | 78.8% | 77.6% |

The twelve unlabelled plans (13 to 137 pages) ran without a failed section; one run of all
twelve cost $0.62. One run of all nine labelled plans costs $0.69.

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
same plans scored 81.5%; part of that rise is run-to-run spread, which single runs of one plan
have since shown to reach 33 points (Results, Repeats).

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

| 6 | The end of the page before goes with each unit as context; on transcribed pages, an "o" sub-bullet is read as a sub-item and a chapter-page number ("3-1") as a page number | Buttahatchee, Bell Creek, Broken Pumpkin | Haiku 5.5 | 68.1% → 88.9%, 76.3% → 76.7%, 93.3% → 92.6%. On Buttahatchee the page-21 action list was found in full (19 of 19 activities) | |
| 7 | Prompt: education objectives are goals; a goal is named by its outcome words, without its lead-in; a sentence with several goals gives several. **Not kept** | the three tuning plans | Haiku 5.5 | 93.4%, 75.2%, 82.8%; a stricter wording (and outreach cost lines excluded in the prompt): 92.9%, 71.9%, 54.9%. Bell Creek found more goals (5, then 8, then 11 of 17), but names elsewhere grew longer and stopped matching, and on Buttahatchee the page-21 actions went back to goals | |
| 8 | Effort medium instead of low. **Not kept** | Bell Creek, Broken Pumpkin | Haiku 5.5 | 75.5% and 93.4%: no gain, at 1.5 times the time and cost | |
| 9 | Change 6 alone, run again on all plans | all four | Haiku 5.5 | Buttahatchee 55.6%: with the lead-in in view, the page-21 list was filed as goals and BMPs again. Bell Creek 66.3%, Broken Pumpkin 93.3%, Owl Creek 80.5% | |
| 10 | In code: the items of a list whose lead-in calls them actions, and the items nested under them, move to implementation; running heads are lines repeated on 40% of pages, not half | Buttahatchee | — | rescoring the saved runs: 55.6% → 82.4%; 88.9% unchanged. On the saved runs of all eight plans the rule moves the ten page-21 items and nothing else | |
| 11 | In code: a name made only of section words ("Goals/Objectives", "BMPs"), and an outreach "activity" that is a cost row priced per piece, are rejected as not-an-item | Bell Creek | — | such items were in 4 of 6 earlier Bell Creek runs (labels) and 3 of 6 (cost rows) | |

Generalisation round (2026-10-29). Each change was checked on the three labelled tuning plans and
read on the ten unlabelled ones, before and after:

| # | Change | Plan | Model | Core F1 | Numbers |
| --- | --- | --- | --- | --- | --- |
| 12 | Baseline: the settings above, one run on each new held-out plan, before any change of this round | Yazoo Pass, Coldwater, Lake Washington, West Boley, Luxapallila | Haiku 5.5 | 81.7%, 58.5%, 80.0%, 80.3%, 53.3% | |
| 13 | Layout: a short line in the header band repeated on a tenth of the pages (at least five) is a running head too, and a "DRAFT" or "CONFIDENTIAL" stamp is removed wherever it sits | all | — | of the 20 text plans, changes the pages of Coldwater, Lake Washington, Deer Creek and Ross Barnett only | |
| 14 | Transcribed pages: diamonds, arrows and ticks (♦ ◆ ► ✓) are list markers, sub-items when they follow a bullet | scanned plans | — | | |
| 15 | In code: a label or list number in front of a name is cut ("Goal 2: ", "1b. "), and a goal named by its lead-in ("The long-term goal of the plan") takes the outcome after "is to" | all | — | on the unlabelled plans, goals such as "Long-term goal of the Pickwick Reservoir watershed plan" became "restore water quality in Caney Creek" | |
| 16 | Definitions: rows of a water-quality criteria table and problems listed with their causes are not goals; a role or organisation named alone is not an activity or an outreach activity; concerns, and an agency, programme or report named without a parameter, are not monitoring; examples made generic instead of one tuning plan's names and codes | all | Haiku 5.5 | BP 94.2%, Bell Creek 79.2%, Buttahatchee 86.8% (one run each, changes 13–16) | 90.2%, 85.3%, — |
| 17 | The first wording of change 16 said "the names of programs" are not monitoring; on one Ellison Creek run the model then left the plan's list of MDEQ education programmes out of outreach. Reworded; two more runs found the list | Ellison Creek, Bee Lake, BP | Haiku 5.5 | BP 93.4% | 89.1% |
| 18 | Changes 13–17, all plans, three runs each. Buttahatchee fell to 79.7%: in two of its runs the model skipped most of the page-21 action list. The cause: with this round's page text, the units shifted and page 21 opened a unit, so the list's lead-in on page 20 reached the model only as context | all | Haiku 5.5 | tuning 81.8% (BP 94.5%, Bell Creek 72.4%, Buttahatchee 79.7%), held out 79.0% | 85.8%, 82.4% |
| 19 | Units: a page that ends with a list or its lead-in opens the next unit when the next page goes on with the list. Replaying the page-21 request: a unit starting at page 21 returned at most one of the list's eight sub-items in 6 of 11 trials; with page 20 in it, all eight in 5 of 5. The category definitions were ruled out the same way (6 trials each, old and new: 5 of 6 full lists both) | Buttahatchee, Owl Creek, Yazoo Pass, Luxapallila (the labelled plans whose units it changes) | Haiku 5.5 | 85.1%, 91.9%, 78.2%, and Luxapallila 84.4% → 66.2% | |
| 20 | The same, but every page the list runs through moves back to its lead-in: moving only the last page had cut Luxapallila's page 18 from its lead-in on page 17. Changes only Luxapallila's units among the labelled plans | Luxapallila | Haiku 5.5 | 66.2% → 78.0% | |

Three of these changes come from reading held-out plans while writing their answer keys, before
any extraction of them: the chapter header and the draft stamp (change 13) were seen in Coldwater
and Lake Washington, and the diamond bullets (change 14) in Luxapallila. They are format rules,
not content, and they apply to any plan, but those three plans are not fully blind to them. Owl
Creek, Yazoo Pass and West Boley are; Results gives both groups.

The final settings are changes 1–4, 6, 10, 11, 13–17, 19 and 20; their scores, three runs per
plan, are under Results. Change 9 is why the plans run three times: a single run can land far
from the next, and change 6 on its own fixed the scanned plan in some runs only. Changes 18 to
20 also show how fragile one list can be: the same page-21 list was found or skipped depending
on where a unit boundary fell, which moved with small changes to the page text.

Change 5 was tried after the final run. In the same run the held-out and scanned plans lost
sections to API timeouts, so it says nothing about them; their reported scores are still the
final run's.

The jump in step 1 is mostly reliability: the first runs lost whole sections to timeouts and
dropped connections, and every item in a lost section counts as a miss.

## Known misses

Where the tool loses points, from reading the final runs item by item against the answer keys
(after scoring; nothing here was used to change the held-out plans' settings):

- **Goals** are the weakest category: 36 of 62 found per run (59% recall). Goals stated in prose
  are missed most: Bell Creek's "remove the impaired segments of Muddy Creek from Mississippi's
  303(d) list", the nine-key-element plans' education goal "bring about behavior changes and the
  use of best management practices" (Owl Creek, Yazoo Pass), Lake Washington's "reduce
  sediments/siltation by about 55%" and "100% elimination of all sewage discharge". In Lake
  Washington's worst run 2 of its 10 goals were found, against 8 in its baseline run, which is
  most of that plan's drop. Prompt changes that found more goals broke other categories
  (changes 5 and 7).
- **Run-to-run spread on long plans.** Single runs range from 55.9% to 73.2% on Lake Washington,
  63.4% to 86.3% on Luxapallila and 79.1% to 90.9% on Buttahatchee. Most of it is one list found
  in one run and skipped in another, more often when the list's lead-in is not on a page of the
  same unit (changes 18 to 20 removed the common case; 2 such boundaries remain on the text plans).
- **Activities in narrative plans:** reporting duties, evaluation steps and the schedule lines of
  outreach are listed as activities the answer key does not count. Bell Creek extracts 48 for
  the key's 32 (precision 62%), most of its spread from run to run.
- **Long names on schedule rows.** A row named by its whole sentence ("Establish Watershed
  Implementation Team to begin refinement of Watershed Based Plan for Yazoo Pass watershed")
  does not match the key's short name ("Establish Watershed Implementation Team"): the scorer
  allows three extra words. Several Yazoo Pass and Owl Creek misses are this.
- **Outreach the plan describes in general terms** is extracted item by item: the ways
  stakeholders take part on page 6 of the nine-key-element plans, and West Boley's list of what
  its website will hold ("General information and map of the watershed"). Outreach precision is
  75% over the nine plans. Whether those count is a judgement call; the answer keys were not
  changed after seeing the output.
- **Practices named inside a sentence on scans:** West Boley's "streamside buffers, bankfull
  benches, log riffles" (2 of 5 BMPs found).
- **Geographic areas mentioned in passing** (tributaries, neighbouring watersheds) are extracted
  beyond the ones the answer key lists; areas are not part of the core score.
- **Numbers** on found items are right 84% of the time (161 of 192 per run). Most misses on
  Broken Pumpkin are one cost of two: a BMP has one estimated-cost field, so when a plan prices
  the same practice in a full-project table and a Phase 1 table, one of the two costs is not
  kept. Both quantities are kept.

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

`npm run test:e2e` runs the Playwright tests in `e2e/` against a production build in Chromium.
They need no API key: the samples open from saved results, and the upload test answers the two
API routes itself. They cover:

- the home page: the sample list (held-out samples marked) opens a report;
- a scanned sample's overview: the plan diagram, the page map with its table view, and the
  reduction-target, responsibility and timeline charts;
- a step of the plan diagram opens its tab, a row opens its evidence, and "Show on page"
  opens the PDF page with the quote;
- the Quality tab lists what the checks rejected;
- the accuracy page (scores per plan, held-out plans) and the how-it-works page;
- a PDF dropped on the home page is read in the browser, split into units, sent to the
  extract route, merged and opened as a report.

## What was not measured

- Scanned plans end to end through a browser on the live site, with timing. A JPEG 2000 scan
  (West Boley Creek 2007, 40 pages) was run through the live site's API routes from the eval
  code, with its pages drawn by pdf.js's wasm decoders in Node: 77 s, $0.048, no failed
  section, 108 items. The same plan uploaded in a browser took 29 minutes while the eval was
  using the account's output-token limit at the same time (see "Running a whole document" in
  EXTRACTION_LOGIC.md); the browser's own share of the time (drawing the pages) was not
  measured. The plan has had an answer key since 2026-10-29; its scores are under Results.
- The OpenAI path (`gpt-6.1-sol` through the Responses API with a strict JSON schema). It is
  built and unit-tested with mocked responses, but no OpenAI key was used, so it was never run
  against the live API.
- The verbatim check on the scanned plan, which has no text layer.
- How often a quote gets marked across a whole scanned plan. Tesseract reads the page image in
  the browser only to place the highlight. On five Buttahatchee pages (3, 32, 34, 35 and 105,
  three of them tables), read by the same Tesseract build and settings in Node, 71 of the
  sample's 73 quotes are marked. Before two changes it was 51: Tesseract.js reads a page as one
  block of text by default, which skipped many words of ruled tables (automatic page
  segmentation finds them), and a table row is not always one stretch in reading order (a
  wrapped cell's second line comes after the row), so rows are now also read left to right.
  The two misses are a goal written in a narrow cell over five lines. When a quote is not
  found, the page says so and the quote stays shown above it.
- Agreement between two annotators: the ground truth has one author and the script check.
- Plans from outside Mississippi beyond the smoke test.
- Memory use on phones for files far above 100 MB.
