import { describe, expect, it } from 'vitest';
import {
  computeQuote,
  DEFAULT_QUOTE_PARAMS,
  formatQuoteNumber,
  moduleOf,
  type QuoteProgram,
} from './quote-model';
import { buildXlsx } from './xlsx';

const program = (
  projectPath: string,
  codeLines: number,
  level: QuoteProgram['level'],
  score: number,
): QuoteProgram => ({
  projectPath,
  name: projectPath,
  codeLines,
  level,
  score,
});

const base = {
  productivity: 1000,
  weights: { BD: 10, DD: 10, coding: 50, UT: 10, IT: 10, 'UAT support': 10 },
};

const params = {
  ...DEFAULT_QUOTE_PARAMS,
  aiCode: 50,
  aiTest: 0,
  devs: 2,
  pct: { pm: 10, brse: 0, comtor: 0 },
  rate: { pm: 100, brse: 0, comtor: 0, dev: 10 },
};

describe('computeQuote', () => {
  it('weights code lines by the complexity level', () => {
    const quote = computeQuote(
      [
        program('a/A.vbp', 1000, 'low', 20),
        program('b/B.vbp', 1000, 'very-high', 80),
      ],
      params,
      base,
    );
    // Base 2.2 MM: BD 0.22, DD 0.22 -> 0.11, code 1.1 -> 0.55, test 0.66.
    expect(quote.devMM).toBeCloseTo(1.54);
    expect(quote.aiSavedMM).toBeCloseTo(0.66);
    expect(quote.mgmtMM).toBeCloseTo(0.154);
    expect(quote.totalMM).toBeCloseTo(1.694);
    expect(quote.totalCost).toBeCloseTo(1.54 * 10 + 0.154 * 100);
    expect(quote.averageScore).toBe(50);
    expect(quote.modules.map((m) => m.name)).toEqual(['b', 'a']);
    expect(quote.modules[0]?.share).toBeCloseTo(1.4 / 2.2);
    const sum = quote.modules.reduce((total, m) => total + m.cost, 0);
    expect(sum).toBeCloseTo(quote.totalCost);
    expect(quote.months).toBe(1);
  });

  it('gives no number from nothing and survives zero productivity', () => {
    expect(computeQuote([], params, base).totalCost).toBe(0);
    const zero = computeQuote([program('a/A.vbp', 10, 'low', 1)], params, {
      ...base,
      productivity: 0,
    });
    expect(zero.totalMM).toBe(0);
    expect(zero.months).toBe(0);
  });

  it('groups by the folder of the project file', () => {
    expect(moduleOf('kousyosr/KUK/KUKO0140.vbp')).toBe('kousyosr/KUK');
    expect(moduleOf('A.vbp')).toBe('.');
  });
});

describe('duration', () => {
  it('is dev effort over developers, phases one after another', () => {
    const quote = computeQuote(
      [program('a/A.vbp', 4000, 'medium', 50)],
      { ...params, aiCode: 0, devs: 1 },
      base,
    );
    // Dev 4.0 MM with one developer: 4 months, management adds none.
    expect(quote.months).toBe(4);
    expect(quote.schedule.find((row) => row.id === 'test')?.end).toBeCloseTo(4);
    expect(quote.schedule.find((row) => row.id === 'code')?.start).toBeCloseTo(
      0.8,
    );
  });
});

describe('quote scope', () => {
  const programs = [program('a/A.vbp', 1000, 'medium', 50)];

  it('removes an equal part of the phase per excluded item', () => {
    const quote = computeQuote(
      programs,
      { ...params, aiTest: 50, excluded: ['DD', 'UAT support'] },
      base,
    );
    const phase = (id: string) => quote.phases.find((p) => p.id === id)?.mm;
    expect(phase('doc')).toBeCloseTo(0.1);
    expect(phase('test')).toBeCloseTo(0.1);
    expect(phase('code')).toBeCloseTo(0.25);
    // AI saves only on what is still in scope: code 0.25 + test 0.1.
    expect(quote.aiSavedMM).toBeCloseTo(0.35);
  });

  it('drops a phase when all its items are excluded', () => {
    const quote = computeQuote(
      programs,
      { ...params, excluded: ['BD', 'DD', 'IT', 'UT', 'UAT support'] },
      base,
    );
    expect(quote.devMM).toBeCloseTo(0.25);
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
