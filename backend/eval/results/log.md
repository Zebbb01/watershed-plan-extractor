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
