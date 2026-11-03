// Draft estimate of step 5, computed from stored analysis data and the
// parameters on the screen. Base effort = own code lines x complexity factor
// (level from the backend's complexity score) / productivity.

export type ComplexityLevel = 'low' | 'medium' | 'high' | 'very-high';

export const COMPLEXITY_FACTORS: Record<ComplexityLevel, number> = {
  low: 0.8,
  medium: 1,
  high: 1.3,
  'very-high': 1.4,
};

export type QuoteProgram = {
  projectPath: string;
  name: string;
  codeLines: number;
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
  productivity: number;
  // Effort of each work item relative to coding (100).
  weights: Record<QuoteScopeItem | 'coding', number>;
};

export const QUOTE_BASE: QuoteBase = {
  productivity: 1100,
  weights: { BD: 25, DD: 20, coding: 100, UT: 20, IT: 30, 'UAT support': 10 },
};

export const QUOTE_VALIDITY_DAYS = 30;

export type QuoteParams = {
  // Items left out of the quote.
  excluded: QuoteScopeItem[];
  aiCode: number;
  aiTest: number;
  devs: number;
  pct: { pm: number; brse: number; comtor: number };
  rate: { pm: number; brse: number; comtor: number; dev: number };
};

export const DEFAULT_QUOTE_PARAMS: QuoteParams = {
  excluded: [],
  aiCode: 30,
  aiTest: 10,
  devs: 5,
  pct: { pm: 10, brse: 10, comtor: 10 },
  rate: { pm: 900000, brse: 750000, comtor: 450000, dev: 420000 },
};

export type QuotePhaseId = 'doc' | 'code' | 'test' | 'mgmt';

export type QuoteModule = {
  name: string;
  programs: number;
  codeLines: number;
  // Mean of the programs' scores.
  score: number;
  // Effective factor of the module: weighted lines / lines.
  factor: number;
  share: number;
  mm: number;
  cost: number;
};

export type QuoteResult = {
  programs: number;
  codeLines: number;
  averageScore: number;
  devMM: number;
  mgmtMM: number;
  totalMM: number;
  totalCost: number;
  aiSavedMM: number;
  phases: { id: QuotePhaseId; mm: number; cost: number }[];
  schedule: { id: QuotePhaseId; start: number; end: number }[];
  months: number;
  modules: QuoteModule[];
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

export function computeQuote(
  programs: readonly QuoteProgram[],
  params: QuoteParams,
  base: QuoteBase = QUOTE_BASE,
): QuoteResult {
  const weighted = (program: QuoteProgram) =>
    program.codeLines * COMPLEXITY_FACTORS[program.level];
  const weightedLines = programs.reduce(
    (sum, program) => sum + weighted(program),
    0,
  );
  const baseMM = base.productivity > 0 ? weightedLines / base.productivity : 0;
  // Base effort covers every item, so excluding one lowers the quote.
  const weightTotal = Object.values(base.weights).reduce(
    (sum, weight) => sum + weight,
    0,
  );
  const itemMM = (item: QuoteScopeItem | 'coding') =>
    (item !== 'coding' && params.excluded.includes(item)) || weightTotal === 0
      ? 0
      : (baseMM * base.weights[item]) / weightTotal;
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
  const totalMM = devMM + mgmtMM;
  const totalCost = devMM * params.rate.dev + mgmtCost;

  // Phases overlap as on the prototype: coding starts when 70% of the
  // documents is done, tests when 75% of the coding is done.
  const devs = Math.max(1, params.devs);
  const docMonths = docMM / devs;
  const codeMonths = codeMM / devs;
  const testMonths = testMM / devs;
  const codeStart = docMonths * 0.7;
  const testStart = codeStart + codeMonths * 0.75;
  const end = Math.max(
    docMonths,
    codeStart + codeMonths,
    testStart + testMonths,
  );

  const groups = new Map<string, QuoteProgram[]>();
  for (const program of programs) {
    const name = moduleOf(program.projectPath);
    groups.set(name, [...(groups.get(name) ?? []), program]);
  }
  const modules = [...groups.entries()]
    .map(([name, members]): QuoteModule => {
      const codeLines = members.reduce((sum, p) => sum + p.codeLines, 0);
      const moduleWeighted = members.reduce((sum, p) => sum + weighted(p), 0);
      const share = weightedLines > 0 ? moduleWeighted / weightedLines : 0;
      return {
        name,
        programs: members.length,
        codeLines,
        score: mean(members.map((p) => p.score)),
        factor: codeLines > 0 ? moduleWeighted / codeLines : 0,
        share,
        mm: totalMM * share,
        cost: totalCost * share,
      };
    })
    .sort((a, b) => b.share - a.share || a.name.localeCompare(b.name));

  return {
    programs: programs.length,
    codeLines: programs.reduce((sum, p) => sum + p.codeLines, 0),
    averageScore: mean(programs.map((p) => p.score)),
    devMM,
    mgmtMM,
    totalMM,
    totalCost,
    aiSavedMM: baseDd - ddMM + (baseCode - codeMM) + (baseTest - testMM),
    phases: [
      { id: 'doc', mm: docMM, cost: docMM * params.rate.dev },
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
  };
}
