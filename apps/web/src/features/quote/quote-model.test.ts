import { describe, expect, it } from 'vitest';
import {
  codingMM,
  computeQuote,
  DEFAULT_QUOTE_PARAMS,
  effectiveBase,
  formatQuoteNumber,
  formulaFacts,
  moduleOf,
  QUOTE_BASE,
  SHARED_MODULE,
  type QuoteMetrics,
  type QuoteProgram,
} from './quote-model';
import { buildXlsx } from './xlsx';

const program = (
  projectPath: string,
  codeLines: number,
  metrics: Partial<QuoteMetrics> = {},
  score = 50,
): QuoteProgram => ({
  projectPath,
  name: projectPath,
  codeLines,
  metrics: {
    decisionPoints: 0,
    tables: 0,
    concatenatedSql: 0,
    dynamicSql: 0,
    components: 0,
    externalApis: 0,
    ...metrics,
  },
  level: 'medium',
  score,
});

// 20 days per MM and only lines cost anything: 1,000 lines = 1 MM.
const base = {
  coding: {
    daysPerMM: 20,
    perHundredLines: 2,
    perHundredDecisions: 0,
    perTable: 0,
    perConcatenatedSql: 0,
    perComponent: 0,
    perExternalApi: 0,
    dynamicSqlWeight: 3,
  },
  weights: { BD: 10, DD: 20, coding: 100, UT: 20, IT: 10, 'UAT support': 10 },
};

const params = {
  ...DEFAULT_QUOTE_PARAMS,
  aiCode: 50,
  aiTest: 0,
  devs: 2,
  pct: { pm: 10, brse: 0, comtor: 0 },
  rate: { sa: 200, pm: 100, brse: 0, comtor: 0, dev: 10 },
};

describe('codingMM', () => {
  it('adds the days of every part of the complexity', () => {
    const unit = {
      ...base,
      coding: {
        ...base.coding,
        perHundredDecisions: 1,
        perTable: 0.5,
        perConcatenatedSql: 0.25,
        perComponent: 1,
        perExternalApi: 0.5,
      },
    };
    const days =
      20 + // 1,000 lines
      2 + // 200 decision points
      1 + // 2 tables
      (4 + 3 * 1) * 0.25 + // 4 concatenated + 1 dynamic SQL
      1 + // 1 component
      1; // 2 external APIs
    expect(
      codingMM(
        program('a/A.vbp', 1000, {
          decisionPoints: 200,
          tables: 2,
          concatenatedSql: 4,
          dynamicSql: 1,
          components: 1,
          externalApis: 2,
        }),
        unit,
      ),
    ).toBeCloseTo(days / 20);
  });

  it('costs more for the same lines when the program has more parts', () => {
    const plain = codingMM(program('a/A.vbp', 1000), QUOTE_BASE);
    const heavy = codingMM(
      program('a/A.vbp', 1000, { tables: 10, externalApis: 5 }),
      QUOTE_BASE,
    );
    expect(heavy).toBeGreaterThan(plain);
  });
});

describe('computeQuote', () => {
  it('prices each program from its own effort', () => {
    const programs = [
      program('a/A.vbp', 1000, {}, 50),
      program('b/B.vbp', 2000, {}, 60),
    ];
    const quote = computeQuote(programs, params, base);
    // Coding 1 + 2 = 3.0 MM before AI: BD 0.3, DD 0.6 -> 0.3, code 3.0 -> 1.5,
    // tests 1.2 (UT 0.6, IT 0.3, UAT 0.3).
    expect(quote.devMM).toBeCloseTo(3.3);
    expect(quote.aiSavedMM).toBeCloseTo(1.8);
    expect(quote.mgmtMM).toBeCloseTo(0.33);
    expect(quote.totalMM).toBeCloseTo(3.63);
    // SA designs (0.6 MM), devs code and test (2.7 MM), PM 0.33 MM.
    expect(quote.totalCost).toBeCloseTo(0.6 * 200 + 2.7 * 10 + 0.33 * 100);
    expect(quote.averageScore).toBe(55);
    expect(quote.modules.map((m) => m.name)).toEqual(['b', 'a']);
    expect(quote.modules[0]?.share).toBeCloseTo(2 / 3);
    const sum = quote.modules.reduce((total, m) => total + m.cost, 0);
    expect(sum).toBeCloseTo(quote.totalCost);
    expect(quote.rows.map((r) => r.projectPath)).toEqual([
      'b/B.vbp',
      'a/A.vbp',
    ]);
    expect(quote.rows[0]?.mm).toBeCloseTo((quote.totalMM * 2) / 3);
    expect(quote.rows.reduce((total, r) => total + r.cost, 0)).toBeCloseTo(
      quote.totalCost,
    );
    expect(quote.months).toBe(2);
  });

  it('splits the quote by work item and role', () => {
    const quote = computeQuote(
      [program('a/A.vbp', 1000), program('b/B.vbp', 2000)],
      params,
      base,
    );
    const item = (id: string) => quote.items.find((i) => i.id === id);
    // Coding 3.0 MM: BD 0.3, DD 0.3 after AI, coding 1.5, UT 0.6, IT 0.3.
    expect(item('BD')?.mm).toBeCloseTo(0.3);
    expect(item('DD')?.mm).toBeCloseTo(0.3);
    expect(item('coding')?.mm).toBeCloseTo(1.5);
    expect(item('UT')?.mm).toBeCloseTo(0.6);
    expect(item('IT')?.mm).toBeCloseTo(0.3);
    expect(item('pm')?.mm).toBeCloseTo(0.33);
    expect(quote.items.reduce((sum, i) => sum + i.mm, 0)).toBeCloseTo(
      quote.totalMM,
    );
    expect(quote.items.reduce((sum, i) => sum + i.cost, 0)).toBeCloseTo(
      quote.totalCost,
    );
  });

  it('gives no number from nothing and survives zero effort', () => {
    expect(computeQuote([], params, base).totalCost).toBe(0);
    const zero = computeQuote([program('a/A.vbp', 10)], params, {
      ...base,
      coding: { ...base.coding, perHundredLines: 0 },
    });
    expect(zero.totalMM).toBe(0);
    expect(zero.months).toBe(0);
  });

  it('groups by the folder of the project file', () => {
    expect(moduleOf('kousyosr/KUK/KUKO0140.vbp')).toBe('kousyosr/KUK');
    expect(moduleOf('A.vbp')).toBe('.');
  });

  it('prices shared lines at the programs average effort per line', () => {
    const programs = [program('a/A.vbp', 2000)];
    const quote = computeQuote(programs, params, base, 1000);
    const alone = computeQuote(programs, params, base);
    expect(quote.codeLines).toBe(3000);
    expect(quote.sharedLines).toBe(1000);
    // Shared code adds half of the programs' coding (1000 of 2000 lines).
    expect(quote.totalMM).toBeCloseTo(alone.totalMM * 1.5);
    const shared = quote.modules[quote.modules.length - 1];
    expect(shared?.name).toBe(SHARED_MODULE);
    expect(shared?.programs).toBe(0);
    expect(shared?.share).toBeCloseTo(1 / 3);
    const sum = quote.modules.reduce((total, m) => total + m.cost, 0);
    expect(sum).toBeCloseTo(quote.totalCost);
  });

  it('lets the AI percentage move the effort', () => {
    const programs = [program('a/A.vbp', 100000, { decisionPoints: 10000 })];
    const none = computeQuote(programs, {
      ...DEFAULT_QUOTE_PARAMS,
      aiCode: 0,
      aiTest: 0,
    });
    const half = computeQuote(programs, DEFAULT_QUOTE_PARAMS);
    expect(half.devMM).toBeLessThan(none.devMM);
    expect(none.aiSavedMM).toBe(0);
    expect(half.aiSavedMM).toBeGreaterThan(0);
  });
});

describe('duration', () => {
  it('is dev effort over developers, phases one after another', () => {
    const quote = computeQuote(
      [program('a/A.vbp', 4000)],
      { ...params, aiCode: 0, devs: 1 },
      base,
    );
    // Coding 4.0: BD 0.4 + DD 0.8 + code 4.0 + tests 1.6 = 6.8 MM, one dev.
    expect(quote.months).toBe(7);
    expect(quote.schedule.find((row) => row.id === 'test')?.end).toBeCloseTo(
      6.8,
    );
    expect(quote.schedule.find((row) => row.id === 'code')?.start).toBeCloseTo(
      1.2,
    );
  });
});

describe('quote scope', () => {
  const programs = [program('a/A.vbp', 1000)];

  it('removes the share of each excluded item', () => {
    const quote = computeQuote(
      programs,
      { ...params, aiTest: 50, excluded: ['DD', 'UAT support'] },
      base,
    );
    const phase = (id: string) => quote.phases.find((p) => p.id === id)?.mm;
    expect(phase('doc')).toBeCloseTo(0.1);
    // UT 0.2 + IT 0.1 left, halved by AI.
    expect(phase('test')).toBeCloseTo(0.15);
    expect(phase('code')).toBeCloseTo(0.5);
    // AI saves only on what is still in scope: code 0.5 + test 0.15.
    expect(quote.aiSavedMM).toBeCloseTo(0.65);
  });

  it('drops a phase when all its items are excluded', () => {
    const quote = computeQuote(
      programs,
      { ...params, excluded: ['BD', 'DD', 'IT', 'UT', 'UAT support'] },
      base,
    );
    expect(quote.devMM).toBeCloseTo(0.5);
  });
});

describe('overrides', () => {
  it('uses the percentages and days per unit set on the screen', () => {
    const programs = [program('a/A.vbp', 1000)];
    const plain = computeQuote(programs, params, base);
    // UT from 20% to 40% of coding adds 0.2 MM before AI (aiTest is 0).
    const moreTest = computeQuote(
      programs,
      { ...params, weights: { UT: 40 } },
      base,
    );
    expect(moreTest.totalMM - plain.totalMM).toBeCloseTo(0.2 * 1.1);
    // Lines cost 4 days per 100 instead of 2: twice the coding effort.
    const slower = computeQuote(
      programs,
      { ...params, unitDays: { perHundredLines: 4 } },
      base,
    );
    expect(slower.totalMM).toBeCloseTo(plain.totalMM * 2);
  });

  it('explains the calculation with the current numbers', () => {
    const facts = formulaFacts({
      ...DEFAULT_QUOTE_PARAMS,
      weights: { BD: 30 },
      unitDays: { perTable: 1 },
    });
    // 10 x 0.45 + 1 x 1.3 + 2 x 1 days = 7.8 days = 0.39 MM.
    expect(facts.days).toBeCloseTo(7.8);
    expect(facts.coding).toBeCloseTo(0.39);
    expect(facts.weights.BD).toBe(30);
    expect(facts.before.BD).toBeCloseTo(0.39 * 0.3);
    expect(facts.after.BD).toBeCloseTo(0.39 * 0.3);
    expect(facts.after.coding).toBeCloseTo(0.39 * 0.5);
    expect(facts.total).toBeCloseTo(
      Object.values(facts.after).reduce((sum, value) => sum + value, 0),
    );
    expect(effectiveBase({ weights: { UT: 5 } }).weights.UT).toBe(5);
    expect(effectiveBase({}).weights.UT).toBe(20);
  });
});

describe('formatQuoteNumber', () => {
  it('uses the local date and a two-digit sequence', () => {
    expect(formatQuoteNumber(new Date(2026, 10, 2), 1)).toBe('QT-2026-1102-01');
    expect(formatQuoteNumber(new Date(2026, 0, 9), 12)).toBe('QT-2026-0109-12');
  });
});

describe('buildXlsx', () => {
  it('writes a ZIP with escaped inline text and never a formula', () => {
    const bytes = buildXlsx('Quote', [
      ['=1+1 <b>', 12],
      [null, 'x'],
    ]);
    expect([...bytes.slice(0, 2)]).toEqual([0x50, 0x4b]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('=1+1 &lt;b&gt;');
    expect(text).toContain('<c r="B1"><v>12</v></c>');
    expect(text).toContain('r="B2"');
    expect(text).not.toContain('<f>');
  });
});
