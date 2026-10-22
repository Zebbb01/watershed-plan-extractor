# Tuning log

Tuning used the tuning plans only (Broken Pumpkin 2019, Bell Creek 2012, Buttahatchee 2004).
Each line: the change, then core F1 / numbers before → after, per plan and model.

| # | Change | Plan | Model | Core F1 | Numbers |
| --- | --- | --- | --- | --- | --- |
| 0 | First run (6-page units, one call per unit) | Broken Pumpkin | Sonnet 5.5 | 84.7% (4 sections timed out) | 50.0% |
| 0 | First run | Broken Pumpkin | Haiku 5.5 | 68.0% (6 sections failed) | 1.6% |
| 1 | Streamed calls, connection errors retried, 3-page / 40-row units, two calls per unit | Broken Pumpkin | Sonnet 5.5 | 84.7% → 92.8% | 50.0% → 88.0% |
| 1 | same | Broken Pumpkin | Haiku 5.5 | 68.0% → 89.3% | 1.6% → 90.2% |
| 1 | same (first run of this plan) | Bell Creek | Sonnet 5.5 | 65.4% | 80.6% |
| 1 | same (first run of this plan) | Bell Creek | Haiku 5.5 | 63.9% | 82.4% |
| 2 | Prompt: every list item and table row, headings are not items, each call told which categories the other call covers | Bell Creek | Sonnet 5.5 | 65.4% → 78.9% | 80.6% → 75.8% |
| 2 | same | Bell Creek | Haiku 5.5 | 63.9% → 71.6% | 82.4% → 82.9% |
| 3 | Scanned pages: sub-bullet glyphs, numbered section titles, running dates; action lists are activities | Buttahatchee | Haiku 5.5 | 66.7% → 65.2% (no change beyond run-to-run spread) | |
| 4 | Running heads removed from transcribed pages too | all | — | measured in the dev-set runs below | |

Dev-set runs on the final tuning settings (micro-averaged over the three plans):

| Model | Core F1 | Precision | Recall | Numbers | Verbatim violations | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| Haiku 5.5 (extraction and OCR) | 77.8% | 76.4% | 79.2% | 88.1% (111/126) | 0 | $0.24 |
| Sonnet 5.5 (OCR on Haiku 5.5) | 79.0% | 75.4% | 83.0% | 84.3% (107/127) | 0 | $2.73 |
| Opus 5.5, Broken Pumpkin only | 91.3% (Haiku 93.3%) | 89.2% | 93.5% | 87.8% | 0 | $0.69 (Haiku $0.02) |

Decision: Haiku 5.5 is the default for extraction and OCR.

Final run on the final settings (2026-10-21, Haiku 5.5, all four labelled plans, scored once):

| Set | Core F1 | Precision | Recall | Numbers | Verbatim violations | Cost |
| --- | --- | --- | --- | --- | --- | --- |
| Tuning plans | 81.5% | 81.3% | 81.8% | 87.3% (110/126) | 0 | $0.23 |
| Held-out plan (Owl Creek) | 81.0% | 78.0% | 84.2% | 100% (24/24) | 0 | $0.015 |
| All four | 81.4% | 80.6% | 82.2% | 89.3% (134/150) | 0 | $0.24 |

Buttahatchee has ranged from 58.8% to 68.1% across Haiku runs, so change 4 cannot be told
apart from run-to-run spread.

Tried after the final run (2026-10-21, not kept):

| # | Change | Plan | Core F1 | Numbers | Goals matched |
| --- | --- | --- | --- | --- | --- |
| 5 | Whatever the plan calls a goal or objective is a goal, education objectives included | Broken Pumpkin | 93.3% → 92.6% | 89.0% → 89.1% | 0/2 → 0/2 (2 predicted) |
| 5 | same | Bell Creek | 76.3% → 72.7% | 85.3% → 76.5% | 6/17 → 6/17 (11 predicted) |

More goals were found, but named by their lead-in ("The ultimate goal", "The goal and
objective"), so none more matched. The held-out and scanned plans lost sections to API
timeouts in that run, so it says nothing about them. Reverted; the final run stands.

Long and scanned plans (2026-10-23, Haiku 5.5, effort low; result files carry the UTC date 2026-10-22):

| # | Change | Plan | Core F1 | Result file |
| --- | --- | --- | --- | --- |
| 6 | End of the page before sent with each unit as context; "o" sub-bullets and "3-1" page numbers on transcribed pages | Buttahatchee | 68.1% → 88.9% | `…-lead-buttahatchee-2004.json` |
| 6 | same | Bell Creek | 76.3% → 76.7% | `…-lead-bell-creek-2012.json` |
| 6 | same | Broken Pumpkin | 93.3% → 92.6% | `…-lead-broken-pumpkin-2019.json` |
| 7 | Goals prompt: education objectives, outcome-word names, one goal per goal. Not kept | BP, Bell Creek, Buttahatchee | 93.4%, 75.2%, 82.8% | `…-goals-dev.json` |
| 7 | Stricter wording, plus outreach cost lines excluded in the prompt. Not kept | BP, Bell Creek, Buttahatchee | 92.9%, 71.9%, 54.9% | `…-goals2-dev.json` |
| 8 | Effort medium. Not kept | Bell Creek, BP | 75.5%, 93.4% (1.5× time and cost) | `…-lead-medium-*.json` |
| 9 | Change 6 alone, second run, all plans | BP, Bell Creek, Buttahatchee, Owl Creek | 93.3%, 66.3%, 55.6%, 80.5% | `…-lead-all.json` |
| 10 | Action-list rule in code; running heads at 40% of pages | Buttahatchee (saved runs rescored) | 55.6% → 82.4%, 88.9% → 88.9% | — |
| 11 | Section labels and outreach cost rows rejected as not-an-item | Bell Creek | — | — |

Final settings (changes 6, 10, 11), three runs per plan (`--repeat 3`), `2026-10-22-claude-haiku-5-5-all.json`:

| Plan | Core F1, mean | Each run |
| --- | --- | --- |
| Broken Pumpkin | 93.4% | 93.4%, 92.6%, 94.3% |
| Bell Creek | 75.4% | 74.0%, 72.2%, 80.6% |
| Buttahatchee | 87.2% | 85.7%, 86.3%, 89.8% |
| Owl Creek (held out) | 82.2% | 81.0%, 87.2%, 78.5% |
| All four | 83.7% (numbers 88.3%, 0 verbatim violations) | |
