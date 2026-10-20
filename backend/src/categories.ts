import type { ActivityItem, AnyItem, AreaItem, BmpItem, CategoryKey, GoalItem, MetricItem, OutreachItem, Quantity } from './schema';

/*
 * One registry drives the prompt, the dashboard tabs, the tables and the CSV export.
 * Adding a category means adding an entry here plus its schema in schema.ts.
 */

export interface Column<T> {
  key: string;
  label: string;
  align: 'left' | 'right';
  get: (item: T) => string | number | null;
}

export interface CategoryDef<T extends AnyItem = AnyItem> {
  key: CategoryKey;
  label: string;
  singular: string;
  /** Instructions for the model: what belongs here and what does not. */
  definition: string;
  columns: Column<T>[];
  csv: Column<T>[];
}

const raw = (q: Quantity | null | undefined) => q?.raw ?? null;
const raws = (qs: Quantity[]) => (qs.length ? qs.map((q) => (q.scope ? `${q.raw} (${q.scope})` : q.raw)).join('; ') : null);
const pages = (i: AnyItem) => [...new Set(i.evidence.map((e) => e.page))].join(', ');

// Columns every CSV ends with, so a reviewer can trace each row to the PDF.
const traceCsv = <T extends AnyItem>(): Column<T>[] => [
  { key: 'kind', label: 'Kind', align: 'left', get: (i) => i.kind },
  { key: 'pages', label: 'Pages', align: 'left', get: pages },
  { key: 'quote', label: 'Evidence quote', align: 'left', get: (i) => i.evidence[0]?.quote ?? null },
  { key: 'confidence', label: 'Confidence', align: 'left', get: (i) => i.confidence },
  { key: 'source', label: 'Source', align: 'left', get: (i) => i.source },
  { key: 'needsReview', label: 'Needs review', align: 'left', get: (i) => i.needsReview },
];

const goals: CategoryDef<GoalItem> = {
  key: 'goals',
  label: 'Goals',
  singular: 'goal',
  definition:
    'Goals and objectives: outcomes the plan commits to, usually water-quality results such as "Reduce sediment ' +
    'loads entering waters in the watershed", meeting water quality standards, removing a segment from the 303(d) ' +
    'list, or a TMDL reduction target such as "a reduction in sediment of 77% to 97%". Lines labelled "Goal:", ' +
    '"Goals/Objectives", "Desired Results" or "the goal of this project" belong here. Put each stated target ' +
    '(percent reduction, load, standard) in targets. kind=main for each distinct goal; sub for an objective or ' +
    'target nested under a goal. Not goals: tasks or milestones (implementation), BMP lists, background facts ' +
    'about the impairment, and the purpose of a monitoring method.',
  columns: [
    { key: 'name', label: 'Goal', align: 'left', get: (i) => i.name },
    { key: 'targets', label: 'Targets', align: 'left', get: (i) => raws(i.targets) },
    { key: 'pollutant', label: 'Pollutant', align: 'left', get: (i) => i.pollutant },
    { key: 'pages', label: 'Pages', align: 'left', get: pages },
  ],
  csv: [
    { key: 'name', label: 'Goal', align: 'left', get: (i) => i.name },
    { key: 'text', label: 'Description', align: 'left', get: (i) => i.text },
    { key: 'targets', label: 'Targets', align: 'left', get: (i) => raws(i.targets) },
    { key: 'pollutant', label: 'Pollutant', align: 'left', get: (i) => i.pollutant },
    { key: 'deadline', label: 'Deadline', align: 'left', get: (i) => i.deadline },
    ...traceCsv<GoalItem>(),
  ],
};

const bmps: CategoryDef<BmpItem> = {
  key: 'bmps',
  label: 'BMPs',
  singular: 'BMP',
  definition:
    'Best management practices (BMPs): specific conservation or structural practices proposed or installed to ' +
    'reduce pollution, e.g. cover crops, grade stabilization structures, fencing, filter strips, streambank and ' +
    'shoreline protection, heavy use area protection, nutrient management, critical area planting. One item per ' +
    'distinct practice, its name copied exactly as written. Record every amount stated for it in quantities (from ' +
    'cost or budget tables: the number of units with the unit column, e.g. "500 ac"; from text: the phrase, e.g. ' +
    '"12 grade stabilization structures"), with scope set to the table or phase heading when the document has more ' +
    'than one (e.g. "Cost Estimate: Phase 1 Implementation"). Fill unitCost and estimatedCost from the same row. ' +
    'Not BMPs: species, funding programs (EQIP, CRP, WHIP, CSP, Section 319), monitoring parameters, partner ' +
    'agencies, education events, and budget lines such as Monitoring, Technical Assistance, Education/Outreach or ' +
    'Project Management.',
  columns: [
    { key: 'name', label: 'Practice', align: 'left', get: (i) => i.name },
    { key: 'quantities', label: 'Planned amount', align: 'left', get: (i) => raws(i.quantities) },
    { key: 'unitCost', label: 'Unit cost', align: 'right', get: (i) => raw(i.unitCost) },
    { key: 'estimatedCost', label: 'Estimated cost', align: 'right', get: (i) => raw(i.estimatedCost) },
    { key: 'pages', label: 'Pages', align: 'left', get: pages },
  ],
  csv: [
    { key: 'name', label: 'Practice', align: 'left', get: (i) => i.name },
    { key: 'quantities', label: 'Amounts as written', align: 'left', get: (i) => raws(i.quantities) },
    { key: 'value', label: 'First amount', align: 'right', get: (i) => i.quantities[0]?.value ?? null },
    { key: 'unit', label: 'Unit', align: 'left', get: (i) => i.quantities[0]?.unit ?? null },
    { key: 'unitCost', label: 'Unit cost', align: 'right', get: (i) => i.unitCost?.value ?? null },
    { key: 'estimatedCost', label: 'Estimated cost', align: 'right', get: (i) => i.estimatedCost?.value ?? null },
    { key: 'pollutants', label: 'Pollutants', align: 'left', get: (i) => i.pollutants.join('; ') || null },
    ...traceCsv<BmpItem>(),
  ],
};

const implementation: CategoryDef<ActivityItem> = {
  key: 'implementation',
  label: 'Implementation',
  singular: 'activity',
  definition:
    'Implementation activities and milestones: actions the plan says will be carried out, e.g. "Work to develop, ' +
    'execute, and implement a Subgrant Agreement (Month 1)", "Conduct inspections of BMPs during construction ' +
    '(Months 3-36)", "Submit a final report to MDEQ", and every row of a milestones or schedule table (use the ' +
    'milestone text as the name, the outcome in text, and its date as timeframe). Copy responsible organizations ' +
    'exactly. timeframe = the schedule words exactly as written. status only when the document states it (e.g. ' +
    '"Completed using historical data" means completed). milestone=true for milestone table or list rows. Not ' +
    'activities: the BMPs themselves, and education events (those go to outreach).',
  columns: [
    { key: 'name', label: 'Activity', align: 'left', get: (i) => i.name },
    { key: 'responsible', label: 'Responsible', align: 'left', get: (i) => i.responsible.join(', ') || null },
    { key: 'timeframe', label: 'When', align: 'left', get: (i) => i.timeframe },
    { key: 'status', label: 'Status', align: 'left', get: (i) => i.status },
    { key: 'pages', label: 'Pages', align: 'left', get: pages },
  ],
  csv: [
    { key: 'name', label: 'Activity', align: 'left', get: (i) => i.name },
    { key: 'text', label: 'Description', align: 'left', get: (i) => i.text },
    { key: 'responsible', label: 'Responsible', align: 'left', get: (i) => i.responsible.join('; ') || null },
    { key: 'timeframe', label: 'Timeframe', align: 'left', get: (i) => i.timeframe },
    { key: 'start', label: 'Start', align: 'right', get: (i) => i.start },
    { key: 'end', label: 'End', align: 'right', get: (i) => i.end },
    { key: 'timeUnit', label: 'Time unit', align: 'left', get: (i) => i.timeUnit },
    { key: 'status', label: 'Status', align: 'left', get: (i) => i.status },
    { key: 'milestone', label: 'Milestone', align: 'left', get: (i) => (i.milestone ? 'yes' : 'no') },
    ...traceCsv<ActivityItem>(),
  ],
};

const monitoring: CategoryDef<MetricItem> = {
  key: 'monitoring',
  label: 'Monitoring',
  singular: 'metric',
  definition:
    'Monitoring metrics: water-quality parameters with their thresholds or targets, and monitoring activities ' +
    'or stations used to measure progress, e.g. "Dissolved Oxygen" with threshold "Daily Average of 5.0 mg/L; ' +
    'Instantaneous threshold of 4.0 mg/L", "Turbidity" "75 NTU", an M-BISQ score threshold, station "TB146", ' +
    'baseline or post-BMP monitoring. parameter = the parameter or measure name exactly as written; threshold.raw ' +
    '= the exact threshold words; location = station ids or places exactly as written.',
  columns: [
    { key: 'parameter', label: 'Parameter', align: 'left', get: (i) => i.parameter },
    { key: 'threshold', label: 'Threshold / target', align: 'left', get: (i) => raw(i.threshold) },
    { key: 'location', label: 'Where', align: 'left', get: (i) => i.location },
    { key: 'pages', label: 'Pages', align: 'left', get: pages },
  ],
  csv: [
    { key: 'name', label: 'Name', align: 'left', get: (i) => i.name },
    { key: 'parameter', label: 'Parameter', align: 'left', get: (i) => i.parameter },
    { key: 'threshold', label: 'Threshold as written', align: 'left', get: (i) => raw(i.threshold) },
    { key: 'value', label: 'Threshold value', align: 'right', get: (i) => i.threshold?.value ?? null },
    { key: 'unit', label: 'Unit', align: 'left', get: (i) => i.threshold?.unit ?? null },
    { key: 'location', label: 'Location', align: 'left', get: (i) => i.location },
    { key: 'frequency', label: 'Frequency', align: 'left', get: (i) => i.frequency },
    ...traceCsv<MetricItem>(),
  ],
};

const outreach: CategoryDef<OutreachItem> = {
  key: 'outreach',
  label: 'Outreach',
  singular: 'activity',
  definition:
    'Outreach and education activities: information, education and participation activities, e.g. "Teacher ' +
    'Workshops", "Adopt A Stream", Watershed Implementation Team meetings ("a minimum of 3 face-to-face ' +
    'meetings"), field days, demonstration farms, fact sheets, project signs, newspaper articles, radio ' +
    'advertisements, county fair booths, presentations. quantity.raw = the exact count words, e.g. "no fewer ' +
    'than 1,000 informational fact sheets". Not outreach: acknowledgements, contact lists, author lists, and ' +
    'the ways success will be measured (surveys, pre-tests) unless described as an activity.',
  columns: [
    { key: 'name', label: 'Activity', align: 'left', get: (i) => i.name },
    { key: 'audience', label: 'Audience', align: 'left', get: (i) => i.audience },
    { key: 'quantity', label: 'Amount', align: 'left', get: (i) => raw(i.quantity) },
    { key: 'pages', label: 'Pages', align: 'left', get: pages },
  ],
  csv: [
    { key: 'name', label: 'Activity', align: 'left', get: (i) => i.name },
    { key: 'text', label: 'Description', align: 'left', get: (i) => i.text },
    { key: 'audience', label: 'Audience', align: 'left', get: (i) => i.audience },
    { key: 'quantity', label: 'Amount as written', align: 'left', get: (i) => raw(i.quantity) },
    { key: 'value', label: 'Amount', align: 'right', get: (i) => i.quantity?.value ?? null },
    { key: 'timeframe', label: 'Timeframe', align: 'left', get: (i) => i.timeframe },
    ...traceCsv<OutreachItem>(),
  ],
};

const geographicAreas: CategoryDef<AreaItem> = {
  key: 'geographicAreas',
  label: 'Areas',
  singular: 'area',
  definition:
    'Geographic areas: the watersheds, sub-watersheds, HUC units, counties, water bodies, states or WRIAs that ' +
    'the plan covers or mentions. name exactly as written (e.g. "Broken Pumpkin Creek", "Noxubee"); type; code ' +
    'for HUC or segment ids exactly as written (e.g. "031601060307", "MS031BPE"); areaAcres.raw when the size ' +
    'is stated (e.g. "24,573 acres"); role=primary for the areas the plan is about (title, location paragraph), ' +
    'mentioned for any other area named.',
  columns: [
    { key: 'name', label: 'Area', align: 'left', get: (i) => i.name },
    { key: 'type', label: 'Type', align: 'left', get: (i) => i.type },
    { key: 'code', label: 'Code', align: 'left', get: (i) => i.code },
    { key: 'areaAcres', label: 'Acres', align: 'right', get: (i) => i.areaAcres },
    { key: 'role', label: 'Role', align: 'left', get: (i) => i.role },
  ],
  csv: [
    { key: 'name', label: 'Area', align: 'left', get: (i) => i.name },
    { key: 'type', label: 'Type', align: 'left', get: (i) => i.type },
    { key: 'code', label: 'Code', align: 'left', get: (i) => i.code },
    { key: 'areaAcres', label: 'Acres', align: 'right', get: (i) => i.areaAcres },
    { key: 'role', label: 'Role', align: 'left', get: (i) => i.role },
    ...traceCsv<AreaItem>(),
  ],
};

export const CATEGORIES = [goals, bmps, implementation, monitoring, outreach, geographicAreas] as unknown as CategoryDef[];

export const categoryByKey = (key: CategoryKey): CategoryDef => CATEGORIES.find((c) => c.key === key)!;
