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
