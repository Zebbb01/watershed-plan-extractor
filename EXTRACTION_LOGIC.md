# Extraction logic

Watershed plans state the same kinds of things in very different ways. A 2019
nine-key-element plan puts its practices in a cost table and its schedule in a numbered
list with "(Months 1-36)". A 2012 narrative plan lists practices as bullets drawn with
Wingdings glyphs. A 2007 action plan uses action items with indicators and budgets. A 2004
plan is a scan with no text at all.

The tool has to return only what the document says, in the right category, with the right
numbers, and never a name that is not in the PDF. The design follows one rule:
**the model selects, code checks and computes.**

```
PDF
 │  1  Read          browser, pdf.js         text with positions; scanned pages found
 │  2  Layout        code                    lines, columns, tables, headings, bullet levels;
 │                                           headers, contents and references removed
 │  3  OCR           LLM vision              scanned pages only, verbatim
 │  4  Units         code + regex            a few pages per call, table images, hints
 │  5  Extract       LLM                     strict schema, a quote for every item
 │  6  Verify        code, fails closed      quote, name and every number checked on the page
 │  7  Merge         code                    duplicates joined, conflicts flagged
 │  8  Summary       code                    totals and completion rate
 ▼
report + quality data (rejections, conflicts, skipped pages, outline, cost)
```

Steps 1–4, 7 and 8 run in the browser. Steps 5 and 6 run in the API route, so the browser
never sees a key and never receives an unverified item. The eval CLI runs the same code in
Node (`backend/src/pipeline.ts`), so the accuracy in [TESTING.md](TESTING.md) measures what
the site does.

| Job | Done by | Why |
| --- | --- | --- |
| Structure (columns, headings, levels, tables, admin text) | Code | Positions and font sizes are exact; a model would guess |
| Codes, acreages, counties, timeframes, dollar amounts | Regex | Cheap and exact; used as hints and checks, never as output on their own |
| Deciding what a sentence is (goal, practice, activity, example, background) | LLM | Needs reading comprehension |
| Reading scanned pages and table images | LLM vision | The text layer is missing or scrambled |
| Whether a quote, name or number is really in the PDF | Code | Must be certain, so it is a string check, not a judgement |
| Numbers, units, ranges, totals, rates | Code | A model may round or compute; code does not |

## 1. Read the PDF in the browser

`frontend/src/lib/pdf/browser-reader.ts`, `backend/src/pdf/convert.ts`

pdf.js (in its Web Worker) returns every text item with its position, size and font, and
the drawing operations show whether a page contains an image. A page with fewer than 30
characters of text and an image is a scan.

Why in the browser: a 100 MB plan would not fit through any serverless function's request
limit (4.5–6 MB), and there is nothing to store. The file is hashed (SHA-256) so a plan
that was already extracted reopens from this browser's storage at no cost.

## 2. Rebuild the layout (code)

`backend/src/layout/page-model.ts`, `document.ts`, `markup.ts`

This is where "context-aware parsing" starts. The model receives structure, not a stream
of words, and administrative text never reaches it.

**Each page:**
- **Lines.** Items on one baseline are joined left to right. A wide gap splits a line into
  cells, except the gap after a bullet or list number.
- **Columns.** A page is split at its widest vertical gutter and read column by column. A
  narrow column (a sidebar or photo caption) is tagged `[ASIDE]`.
- **Tables.** A page with at least three rows of three or more cells that are 30% numbers
  (cost tables), or at least five multi-cell rows (milestone tables), is table-like. Its
  multi-cell rows become `| cell | cell |` rows, and the page image is sent with the text.
- **Body size and margin** are measured on prose lines only, so a table in small type does
  not make every paragraph look like a heading.
- **Headings:** text at least 15% larger than the body that is short and not part of a long
  run of same-size lines; "Element a" to "Element i"; short all-capitals lines; short
  numbered titles.
- **List items:** bullets (•, Wingdings and Symbol private-use glyphs, dashes) and numbers
  ("1.", "a)", "iv."). The indent level is the offset from the margin, one level per 18
  points, so a sub-bullet is visibly under its parent.
- **Captions** ("Figure 3:", "Photo", "Map") are asides.

**The whole document:**
- **Running headers and footers:** lines in the top or bottom 12% of the page that repeat
  on at least half the pages (digits ignored, so "Page 18 of 22" matches "Page 19 of 22"),
  and bare page numbers.
- **Contents pages:** dot leaders, a "Contents" title, or a column of page numbers.
- **Administrative sections:** acknowledgements, references, literature cited,
  bibliography, lists of figures and tables, abbreviations, glossary, distribution lists
  and signature pages are removed up to the next heading. An 80-name acknowledgements page
  therefore cannot produce "responsible parties".
- **Outline:** every heading with its page number. Each call gets it, so the model knows
  where its pages sit in the plan.

What the model reads for Broken Pumpkin 2019, pages 3–4 (real output, shortened):

```
## Element c: Proposed Management Measures
… installation of the following BMPs would help to mitigate sediment issues in Broken
Pumpkin Creek watershed: brush management; weed management; prescribed burning; cover
crops; … Factors considered for determining specific locations for the placement of BMPs
included the following attributes based upon best professional judgement:
[L2] 1. Likely water quality benefit;
[L2] 2. Willing landowners;
## Element d: Technical and Financial Assistance
Cost Estimate: Full Project Implementation
[TABLE — see image]
| Practice Name | Unit | Units | Unit Cost | Cost |
| Brush Management | ac | 5 | $44.43 | $222.15 |
| Cover Crop | ac | 2500 | $55.86 | $139,650.00 |
| Grade Stabilization Structure | ea | 18 $10,000.00 | $180,000.00 |
```

The last row shows why table pages carry their image: the text layer merged two cells.
The image lets the model see the columns, and the verifier still requires both numbers to
be on the page.

## 3. Transcribe scanned pages (LLM vision)

`backend/src/pipeline.ts`, `backend/src/llm/prompt.ts` (`OCR_PROMPT`), `layout/text-page.ts`

Scanned pages are rendered to JPEG (longest side 1,400 px) and sent two per call, because a
page's transcript is long and every call must finish inside the host's time limit. A pair
that times out is read one page at a time. The model writes the text exactly as printed:
line breaks kept, bullets as "• ", table rows with " | " between cells, `[illegible]` where
it cannot read, and no corrections. The transcript becomes that page's text, marked `ocr`,
and goes through the same layout reading. Items from OCR pages are never better than medium
confidence, and their quotes are matched with a small tolerance (section 6). Pages that
still cannot be read are reported as a failed section, not as an empty category.

## 4. Work units and hints (code)

`backend/src/units.ts`

- **Skipped pages** are listed with a reason under Quality: a scan that could not be read,
  a contents or administrative page, a blank page, a figure or map page.
- **Units** are runs of consecutive pages of at most 3 pages, 12,000 characters and about
  40 table rows and list items (each tends to come back as an item, so this bounds the
  answer), sized to return inside the host's 60-second limit; a unit that does not is split
  (section 9). The API accepts at most 12 pages, 60,000 characters and 6 images per call.
- **Two calls per unit.** The six categories are asked for in two calls that run side by
  side (goals, BMPs and activities; monitoring, outreach and areas): one schema for all six
  compiles to a structured-output grammar the API refuses as too large.
- **Order:** units with the most planning words (goals, BMPs, milestones, monitoring, costs,
  acres, counties) run first, so the dashboard fills with the sections that matter.
- **Hints:** HUC codes, acreages, county names, "Month n-m" timeframes and dollar amounts
  found by regex are sent as a checklist, so the model does not skip rows of a long table.
  A hint is never output: an item still needs its quote.

## 5. Extract (LLM)

`backend/src/llm/prompt.ts`, `backend/src/categories.ts`, `backend/src/schema.ts`,
`backend/src/llm/anthropic.ts`, `backend/src/llm/openai.ts`

One call per unit. The instructions are fixed text, so the provider caches them across a
document's calls; only the pages change.

**Categories.** Each has a definition with what it excludes, kept in one registry
(`categories.ts`) that also drives the table columns and CSV columns:

| Category | Includes | Excludes |
| --- | --- | --- |
| Goals | Outcomes the plan commits to: load reductions, meeting standards, delisting; "Goal:" and "Goals/Objectives" lines | Tasks and milestones, BMP lists, background on the impairment |
| BMPs | Conservation and structural practices, one item per practice, with amounts and costs from tables or text | Species, funding programmes (EQIP, CRP, Section 319), monitoring parameters, partner agencies, education events, budget lines |
| Implementation | Actions the plan will carry out; every row of a schedule or milestone table; responsible organisations; a status only when stated | The BMPs themselves, education events |
| Monitoring | Water-quality parameters with thresholds, stations, baseline and post-BMP monitoring | — |
| Outreach | Workshops, team meetings, field days, demonstration farms, fact sheets, signs, articles, presentations | Acknowledgements, contact and author lists, success measures such as surveys |
| Geographic areas | Watersheds, sub-watersheds, HUCs, counties, water bodies, states, WRIAs, each marked primary or mentioned | — |

**Kind.** `main` is a top-level bullet or numbered item, a table row or a stated goal;
`sub` is indented under another item (and names its parent); `example` is introduced by
"e.g.", "such as" or "for example" inside a sentence about something else. This is how
main content, sub-bullets and examples are told apart.

**Rules the prompt states:** extract only what the pages say; copy names exactly,
including capitals, abbreviations and typos; give every item a 5–40 word quote copied from
the page that contains its name and every number reported for it; write amounts exactly as
printed (`"no fewer than 1,000 informational fact sheets"`, `"$27,930.00"`) and never
calculate; leave out anything uncertain, because a missing item costs less than a wrong
one.

**Output** is a strict JSON schema generated from Zod (Anthropic structured outputs, or
OpenAI's Responses API with a JSON schema format). Every field is required and `null` when
absent, so the model cannot drift into free text. The model has no tools.

**Prompt injection:** the pages arrive inside `<document_pages>` and are declared data; the
output must match the schema; and anything not found in the source is dropped in step 6.

**Models:** `claude-haiku-5-5` by default, chosen on the eval (TESTING.md); `gpt-6.1-sol` when only an OpenAI key is set. Both
go through the official SDKs with typed errors, and both are switched by environment
variables (`EXTRACTION_MODEL`, `OCR_MODEL`, `EXTRACTION_EFFORT`). Effort is "low" on models
that take an effort setting and is not sent to older ones; Opus models also get Anthropic's
server-side fallback for refused requests. The SDKs never retry on their own: the pipeline
decides (section 9), with the call's deadline in view.

## 6. Verify every item (code, fails closed)

`backend/src/verify.ts`, `backend/src/text/normalize.ts`, `backend/src/text/quantity.ts`

Nothing the model wrote reaches the report unless the document says it. A failure is
recorded with its reason (`quote-not-found`, `name-not-in-source`, `number-not-in-quote`,
`detail-not-in-source`, `invalid`) and shown under Quality, never as data. A failed quote or
name drops the item; a failed amount or detail drops only that field.

1. **The quote is on the page.** Both sides are normalised (Unicode NFKC, bullet and
   Wingdings glyphs, curly quotes, dash forms, hyphenation at line ends, spacing, case) and
   compared on letters and digits only, keeping decimal points, so "25 miles" never matches
   "2.5 miles". That removes the differences between a PDF text layer and a copied quote,
   and nothing else.
   - OCR pages accept a near match (similarity at least 0.92).
   - On a table page whose image was sent, a quote's words may be interleaved with
     neighbouring cells; they must still appear in order within a short span.
   - A quote may run over a page break.
2. **The name is in the source, as whole words.** BMP, outreach and area names, monitoring
   parameters, responsible organisations and HUC codes must appear in the quote or on the
   page; "Rain Garden" is not found inside "terrain gardens", while a plural ending still
   counts. Goal and activity names are labels the model may shorten, so at least 70% of
   their word stems must be on the page.
3. **Every amount is written as reported.** On prose, the amount must be in the quote as
   reported ("500 feet" is rejected when the plan says "500 acres"; "five field days" when it
   says "Three"). On a table page it must sit on the item's own row with every number and
   unit word, so a number cannot be borrowed from the next row. Every number must also be
   one the page holds, compared by value.
4. **Details are written in the source.** Timeframes, deadlines, pollutants, audiences,
   monitoring frequencies and locations, and amount scopes ("Phase 1") are kept only when
   they appear on the evidence pages. A status ("completed") is kept only when the item's own
   quote says it. A description that carries a number the page does not is emptied.
5. **Amounts are parsed by code:** "1,000" becomes 1000; "77% to 97%" a range of 77–97 %;
   "no fewer than 20" ≥ 20; "$27,930.00" 27930 USD; "two (2) demonstration farms" 2, while
   "12 structures (410)" stays 12 (a practice code is not an amount). Units are normalised
   (ac, ft, mi, cu yd, ea, lb, ton, gal, sq ft, mg/L, NTU, °F, %), and counted things keep
   their noun ("fact sheets"). Timeframes such as "Months 1-36" or "2020-2022" become a
   start and an end.
6. **Cost rows add up.** When a BMP has a quantity, a unit cost and an estimated cost,
   quantity × unit cost must match the estimate within 1%, or the item is marked "needs
   review".
7. **Confidence:** high when a quote of four or more words is found exactly on its own text
   page; medium for shorter quotes, OCR pages, interleaved table cells, quotes across a page
   break, and amounts read from a table row.

Why fail closed: the assessment asks for zero false positives on copied content. A
dropped item lowers recall a little; a wrong name or number would cost the user's trust.

## 7. Merge across units (code)

`backend/src/merge.ts`

A BMP named in a list, a cost table and an appendix becomes one item with all three
quotes. Two names are the same thing when their word stems are equal (after "&" = "and"
and plurals), when they overlap by 80%, or when one is contained in the other. Containment
needs at least 2 shared words for BMPs, outreach and areas and 3 for goals and activities.
It never applies to monitoring parameters, because "Dissolved Oxygen" is not "Dissolved
Oxygen % Saturation". Areas merge only within one type.

Amounts stay separate per scope ("Full project" and "Phase 1" tables). Two different values
for the same scope and unit are kept, listed as a conflict under Quality, and the item is
marked "needs review". Nothing is picked silently. The merged item keeps the lowest
confidence of its copies, so a "medium" check stays visible. Sub-items are linked to their
parent by name.

## 8. Summary (code)

`backend/src/summary.ts`

- `totalGoals` counts main goals.
- `totalBMPs` counts BMPs that are not mere examples.
- `completionRate` is the activities the document reports as completed divided by all
  activities, shown with its basis ("1 of 19 activities reported completed"). When the
  document states no status, it is 0 with the basis "No completion status reported in this
  document", and the dashboard shows "Not reported" rather than "0%". Dividing only by
  activities with a stated status would show 100% for Broken Pumpkin, which reports one
  status among 19 milestones.
- The overview sentence is a template filled from the counts, not model prose.

## 9. Running a whole document

`backend/src/pipeline.ts`, `frontend/src/lib/run-extraction.ts`

One policy covers extraction units and OCR batches alike:

- Four calls run in parallel. A rate-limit response halves that and waits for the
  provider's `retry-after` (up to five times).
- A call that times out, hits the output limit or is too large is split in half and
  retried, down to a single page. Any other error, such as a dropped connection, is retried
  twice.
- Work that still fails is listed with its pages as a failed section; the rest of the
  report stands. Dropping the same file again runs it again: complete results are reused
  from the browser's storage, results with failed sections are not.
- Each API call has a 50-second deadline, inside the host's 60-second limit.
- Progress is shown per stage, items appear as units finish, and Cancel (or leaving the
  page) stops the calls in flight.
- `MAX_PAGES` (default 800) caps how many pages one run reads.

## How the requirements map to the steps

| Requirement | Where it is met |
| --- | --- |
| Preserve document structure | Step 2: columns, headings, indent levels, tables, outline |
| Main content vs sub-bullets vs examples vs administrative text | Step 2 removes admin text and marks levels; step 5 assigns `kind` and parents |
| Categorisation | Step 5 definitions with exclusions; step 7 keeps categories apart |
| Numerical targets and metrics | Step 5 copies amounts as written; step 6 checks every number and parses it in code |
| Zero false positives for copied names | Step 6: verbatim name checks, fail closed |
| Format variations | Steps 2–3 handle columns, sidebars, Wingdings bullets, scrambled tables and scans; [TESTING.md](TESTING.md) covers four formats |
| Large files | Step 1 reads in the browser; steps 4 and 9 keep every call small |
