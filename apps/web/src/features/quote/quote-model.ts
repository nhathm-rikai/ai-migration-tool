// Draft estimate of step 5, computed from stored analysis data and the
// parameters on the screen. The coding effort of a program is the sum of the
// six parts the complexity score is made of (size, decisions, tables, SQL
// built by concatenation, components, external APIs), each priced per unit.
// Parts are added, never multiplied, so size is not counted twice. The other
// work items are percentages of the coding effort. Lines also price the shared
// code that no program owns.

export type ComplexityLevel = 'low' | 'medium' | 'high' | 'very-high';

// What the analysis counted in one program, for the parts of the complexity.
export type QuoteMetrics = {
  decisionPoints: number;
  tables: number;
  concatenatedSql: number;
  dynamicSql: number;
  components: number;
  externalApis: number;
};

export type QuoteProgram = {
  projectPath: string;
  name: string;
  codeLines: number;
  metrics: QuoteMetrics;
  score: number;
  level: ComplexityLevel;
};

// Work items a quote may include.
export const QUOTE_SCOPE_ITEMS = {
  doc: ['BD', 'DD'],
  test: ['UT', 'IT', 'UAT support'],
} as const;

export type QuoteScopeItem =
  (typeof QUOTE_SCOPE_ITEMS)[keyof typeof QUOTE_SCOPE_ITEMS][number];

// Not editable on the screen.
export type QuoteBase = {
  coding: {
    // Working days in one man-month.
    daysPerMM: number;
    // Working days per unit, after the converter and before AI assistance.
    perHundredLines: number;
    perHundredDecisions: number;
    perTable: number;
    perConcatenatedSql: number;
    perComponent: number;
    perExternalApi: number;
    // A dynamic SQL counts as this many concatenated ones, as in the score.
    dynamicSqlWeight: number;
  };
  // Effort of each work item relative to coding (100).
  weights: Record<QuoteScopeItem | 'coding', number>;
};

// Unit costs proposed for review, not measured. Chosen so the 284 programs of
// the pilot source add up to the coding effort of BSN_Estimation_v1.0 (lines /
// 2,500, which is 1,500 lines/MM by hand x 0.6 for the converter): 105 MM
// against 101.6 MM.
export const QUOTE_BASE: QuoteBase = {
  coding: {
    daysPerMM: 20,
    perHundredLines: 0.45,
    perHundredDecisions: 1.3,
    perTable: 0.2,
    perConcatenatedSql: 0.1,
    perComponent: 0.2,
    perExternalApi: 0.15,
    dynamicSqlWeight: 3,
  },
  weights: { BD: 25, DD: 20, coding: 100, UT: 20, IT: 30, 'UAT support': 10 },
};

export const QUOTE_VALIDITY_DAYS = 30;

// Working days per unit of each part of the complexity.
export type QuoteUnitDays = Pick<
  QuoteBase['coding'],
  | 'perHundredLines'
  | 'perHundredDecisions'
  | 'perTable'
  | 'perConcatenatedSql'
  | 'perComponent'
  | 'perExternalApi'
>;

export type QuoteParams = {
  // Items left out of the quote.
  excluded: QuoteScopeItem[];
  // Overrides of the base: % of each item against coding, days per unit.
  weights?: Partial<Record<QuoteScopeItem, number>> | undefined;
  unitDays?: Partial<QuoteUnitDays> | undefined;
  aiCode: number;
  aiTest: number;
  devs: number;
  pct: { pm: number; brse: number; comtor: number };
  rate: { sa: number; pm: number; brse: number; comtor: number; dev: number };
};

// Rates of BSN_Estimation_v1.0 (JPY per man-month). AI at 50% matches the
// workbook's AI factor of 0.5.
export const DEFAULT_QUOTE_PARAMS: QuoteParams = {
  excluded: [],
  aiCode: 50,
  aiTest: 50,
  devs: 5,
  pct: { pm: 10, brse: 10, comtor: 10 },
  rate: { sa: 400000, pm: 400000, brse: 800000, comtor: 380000, dev: 380000 },
};

export type QuotePhaseId = 'doc' | 'code' | 'test' | 'mgmt';

// Module name of the lines no program owns (shared code).
export const SHARED_MODULE = '(shared)';

export type QuoteModule = {
  name: string;
  programs: number;
  codeLines: number;
  // Mean of the programs' scores.
  score: number;
  share: number;
  mm: number;
  cost: number;
};

// Effort of each work item and role; a program or module has its share of it.
export type QuoteItemId = QuoteScopeItem | 'coding' | 'pm' | 'brse' | 'comtor';
export type QuoteItem = { id: QuoteItemId; mm: number; cost: number };

export type QuoteProgramRow = QuoteProgram & {
  share: number;
  mm: number;
  cost: number;
};

export type QuoteResult = {
  programs: number;
  // Own lines of the programs plus the shared lines.
  codeLines: number;
  sharedLines: number;
  // Coding effort before AI of the programs and of the shared lines (MM).
  coding: { programs: number; shared: number };
  averageScore: number;
  // Documents, coding and tests.
  devMM: number;
  mgmtMM: number;
  totalMM: number;
  totalCost: number;
  aiSavedMM: number;
  phases: { id: QuotePhaseId; mm: number; cost: number }[];
  // Whole quote by work item and role (sums to totalMM and totalCost).
  items: QuoteItem[];
  schedule: { id: QuotePhaseId; start: number; end: number }[];
  months: number;
  modules: QuoteModule[];
  // Each program with its own share of the total.
  rows: QuoteProgramRow[];
};

// QT-<year>-<month><day>-<sequence of that day>, on the local date.
export function formatQuoteNumber(date: Date, sequence: number): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `QT-${date.getFullYear()}-${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(sequence)}`;
}

// A program's module is the folder that holds its project file.
export function moduleOf(projectPath: string): string {
  const parts = projectPath.split(/[\\/]/);
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
}

const mean = (values: number[]) =>
  values.length === 0
    ? 0
    : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);

// Coding effort of one program before AI assistance: the working days of each
// part of its complexity, added up, in man-months.
export function codingMM(
  program: Pick<QuoteProgram, 'codeLines' | 'metrics'>,
  base: QuoteBase = QUOTE_BASE,
): number {
  const c = base.coding;
  const m = program.metrics;
  const days =
    (program.codeLines / 100) * c.perHundredLines +
    (m.decisionPoints / 100) * c.perHundredDecisions +
    m.tables * c.perTable +
    (m.concatenatedSql + c.dynamicSqlWeight * m.dynamicSql) *
      c.perConcatenatedSql +
    m.components * c.perComponent +
    m.externalApis * c.perExternalApi;
  return c.daysPerMM > 0 ? days / c.daysPerMM : 0;
}

// The base with the screen's overrides applied.
export function effectiveBase(
  params: Pick<QuoteParams, 'weights' | 'unitDays'>,
  base: QuoteBase = QUOTE_BASE,
): QuoteBase {
  return {
    coding: { ...base.coding, ...params.unitDays },
    weights: { ...base.weights, ...params.weights },
  };
}

export function computeQuote(
  programs: readonly QuoteProgram[],
  params: QuoteParams,
  baseline: QuoteBase = QUOTE_BASE,
  // Lines no program owns (shared modules): priced at the average coding
  // effort per line of the programs.
  sharedLines = 0,
): QuoteResult {
  const base = effectiveBase(params, baseline);
  const ownLines = programs.reduce((sum, p) => sum + p.codeLines, 0);
  const programCoding = programs.map((p) => codingMM(p, base));
  const programCodingTotal = programCoding.reduce((sum, mm) => sum + mm, 0);
  const shared = ownLines > 0 ? Math.max(0, sharedLines) : 0;
  const sharedCoding =
    ownLines > 0 ? (programCodingTotal * shared) / ownLines : 0;
  const codingBase = programCodingTotal + sharedCoding;
  const itemMM = (item: QuoteScopeItem | 'coding') =>
    (item !== 'coding' && params.excluded.includes(item)) ||
    base.weights.coding === 0
      ? 0
      : (codingBase * base.weights[item]) / base.weights.coding;
  const bdMM = itemMM('BD');
  const baseDd = itemMM('DD');
  const baseCode = itemMM('coding');
  const baseTest = QUOTE_SCOPE_ITEMS.test.reduce(
    (sum, item) => sum + itemMM(item),
    0,
  );
  // AI reduces what developers do: DD and coding share one rate; BD stays.
  const ddMM = baseDd * (1 - params.aiCode / 100);
  const docMM = bdMM + ddMM;
  const codeMM = baseCode * (1 - params.aiCode / 100);
  const testMM = baseTest * (1 - params.aiTest / 100);
  const devMM = docMM + codeMM + testMM;
  const roles = {
    pm: (devMM * params.pct.pm) / 100,
    brse: (devMM * params.pct.brse) / 100,
    comtor: (devMM * params.pct.comtor) / 100,
  };
  const mgmtMM = roles.pm + roles.brse + roles.comtor;
  const mgmtCost =
    roles.pm * params.rate.pm +
    roles.brse * params.rate.brse +
    roles.comtor * params.rate.comtor;
  // SA designs (BD, DD); Dev / QA / QC share one rate.
  const docCost = docMM * params.rate.sa;
  const testItem = (item: QuoteScopeItem): QuoteItem => {
    const itemMm = itemMM(item) * (1 - params.aiTest / 100);
    return { id: item, mm: itemMm, cost: itemMm * params.rate.dev };
  };
  const totalMM = devMM + mgmtMM;
  const totalCost = docCost + (codeMM + testMM) * params.rate.dev + mgmtCost;

  // Duration = dev effort / devs. The team works on one phase at a time, so
  // the schedule never needs more developers than entered.
  const devs = Math.max(1, params.devs);
  const docMonths = docMM / devs;
  const codeMonths = codeMM / devs;
  const testMonths = testMM / devs;
  const codeStart = docMonths;
  const testStart = codeStart + codeMonths;
  const end = devMM / devs;

  const weightOf = (coding: number) =>
    codingBase > 0 ? coding / codingBase : 0;
  const entries = programs.map((program, index) => ({
    program,
    coding: programCoding[index] ?? 0,
  }));
  const groups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const name = moduleOf(entry.program.projectPath);
    groups.set(name, [...(groups.get(name) ?? []), entry]);
  }
  const modules = [...groups.entries()]
    .map(([name, members]): QuoteModule => {
      const share = weightOf(members.reduce((sum, e) => sum + e.coding, 0));
      return {
        name,
        programs: members.length,
        codeLines: members.reduce((sum, e) => sum + e.program.codeLines, 0),
        score: mean(members.map((e) => e.program.score)),
        share,
        mm: totalMM * share,
        cost: totalCost * share,
      };
    })
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));
  if (shared > 0) {
    const share = weightOf(sharedCoding);
    modules.push({
      name: SHARED_MODULE,
      programs: 0,
      codeLines: shared,
      score: 0,
      share,
      mm: totalMM * share,
      cost: totalCost * share,
    });
  }
  const rows = entries
    .map(({ program, coding }): QuoteProgramRow => ({
      ...program,
      share: weightOf(coding),
      mm: totalMM * weightOf(coding),
      cost: totalCost * weightOf(coding),
    }))
    .sort((a, b) => b.mm - a.mm || a.projectPath.localeCompare(b.projectPath));

  return {
    programs: programs.length,
    codeLines: ownLines + shared,
    sharedLines: shared,
    coding: { programs: programCodingTotal, shared: sharedCoding },
    averageScore: mean(programs.map((p) => p.score)),
    devMM,
    mgmtMM,
    totalMM,
    totalCost,
    aiSavedMM: baseDd - ddMM + (baseCode - codeMM) + (baseTest - testMM),
    items: [
      { id: 'BD', mm: bdMM, cost: bdMM * params.rate.sa },
      { id: 'DD', mm: ddMM, cost: ddMM * params.rate.sa },
      { id: 'coding', mm: codeMM, cost: codeMM * params.rate.dev },
      testItem('UT'),
      testItem('IT'),
      testItem('UAT support'),
      { id: 'pm', mm: roles.pm, cost: roles.pm * params.rate.pm },
      { id: 'brse', mm: roles.brse, cost: roles.brse * params.rate.brse },
      {
        id: 'comtor',
        mm: roles.comtor,
        cost: roles.comtor * params.rate.comtor,
      },
    ],
    phases: [
      { id: 'doc', mm: docMM, cost: docCost },
      { id: 'code', mm: codeMM, cost: codeMM * params.rate.dev },
      { id: 'test', mm: testMM, cost: testMM * params.rate.dev },
      { id: 'mgmt', mm: mgmtMM, cost: mgmtCost },
    ],
    schedule: [
      { id: 'doc', start: 0, end: docMonths },
      { id: 'code', start: codeStart, end: codeStart + codeMonths },
      { id: 'test', start: testStart, end: testStart + testMonths },
      { id: 'mgmt', start: 0, end },
    ],
    months: totalMM > 0 ? Math.max(1, Math.ceil(end)) : 0,
    modules,
    rows,
  };
}

// Numbers of a worked example (one program of 1,000 lines, 100 decision
// points and 2 tables) run through the current parameters, for the text that
// explains the calculation.
export type QuoteFormulaFacts = {
  daysPerMM: number;
  weights: Record<QuoteScopeItem, number>;
  lines: number;
  decisions: number;
  tables: number;
  days: number;
  // Coding effort before AI, and every item before AI.
  coding: number;
  before: Record<QuoteScopeItem, number>;
  aiCode: number;
  aiTest: number;
  // After AI, by item and role.
  after: Record<QuoteItemId, number>;
  dev: number;
  pct: QuoteParams['pct'];
  mgmt: number;
  total: number;
  cost: number;
  devs: number;
  months: number;
  // The shared code of the whole quote, when it has any.
  shared: {
    lines: number;
    programLines: number;
    programMM: number;
    mm: number;
  } | null;
};

export function formulaFacts(
  params: QuoteParams,
  baseline: QuoteBase = QUOTE_BASE,
  quote?: Pick<QuoteResult, 'sharedLines' | 'codeLines' | 'coding'>,
): QuoteFormulaFacts {
  const base = effectiveBase(params, baseline);
  const example = {
    projectPath: 'example/EXAMPLE.vbp',
    name: 'EXAMPLE',
    codeLines: 1000,
    metrics: {
      decisionPoints: 100,
      tables: 2,
      concatenatedSql: 0,
      dynamicSql: 0,
      components: 0,
      externalApis: 0,
    },
    score: 50,
    level: 'medium' as const,
  };
  const coding = codingMM(example, base);
  const example_ = computeQuote([example], params, baseline);
  const before = (item: QuoteScopeItem) =>
    base.weights.coding > 0
      ? (coding * base.weights[item]) / base.weights.coding
      : 0;
  const after = Object.fromEntries(
    example_.items.map((item) => [item.id, item.mm]),
  ) as Record<QuoteItemId, number>;
  return {
    daysPerMM: base.coding.daysPerMM,
    weights: {
      BD: base.weights.BD,
      DD: base.weights.DD,
      UT: base.weights.UT,
      IT: base.weights.IT,
      'UAT support': base.weights['UAT support'],
    },
    lines: example.codeLines,
    decisions: example.metrics.decisionPoints,
    tables: example.metrics.tables,
    days: coding * base.coding.daysPerMM,
    coding,
    before: {
      BD: before('BD'),
      DD: before('DD'),
      UT: before('UT'),
      IT: before('IT'),
      'UAT support': before('UAT support'),
    },
    aiCode: params.aiCode,
    aiTest: params.aiTest,
    after,
    dev: example_.devMM,
    pct: params.pct,
    mgmt: example_.mgmtMM,
    total: example_.totalMM,
    cost: example_.totalCost,
    devs: Math.max(1, params.devs),
    months: example_.devMM / Math.max(1, params.devs),
    shared:
      quote && quote.sharedLines > 0
        ? {
            lines: quote.sharedLines,
            programLines: quote.codeLines - quote.sharedLines,
            programMM: quote.coding.programs,
            mm: quote.coding.shared,
          }
        : null,
  };
}
