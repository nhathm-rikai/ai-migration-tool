import { describe, expect, it } from 'vitest';
import {
  analyzeProgram,
  callableNames,
  scoreComplexity,
  type ProgramFile,
  type ProgramMetrics,
} from './program-analysis.js';
import { analyzeVb6CodeFile, findVb6References } from './vb6/vb6-code-file.js';

const SOURCES: Record<string, { shared: boolean; lines: string[] }> = {
  'prog/MAIN.BAS': {
    shared: false,
    lines: [
      'Public Sub Main()',
      '    Call Helper',
      '    SaveAll',
      '    Format1',
      'End Sub',
      'Private Sub Helper()',
      '    x = "SELECT F001 FROM ORDERS"',
      'End Sub',
    ],
  },
  'cmn/DB.BAS': {
    shared: true,
    lines: [
      'Public Declare Function GetTickCount Lib "kernel32" () As Long',
      'Public Sub SaveAll()',
      '    t = GetTickCount()',
      '    x = "UPDATE ORDERS SET F001 = 1"',
      'End Sub',
      'Public Sub Unused()',
      '    x = "DELETE FROM AUDIT"',
      'End Sub',
      'Public Sub Format1()',
      'End Sub',
    ],
  },
  'cmn/FMT.BAS': {
    shared: true,
    lines: ['Public Sub Format1()', 'End Sub'],
  },
};

function programFiles(): ProgramFile[] {
  const analyses = Object.entries(SOURCES).map(([path, source]) => {
    const analysis = analyzeVb6CodeFile(path, source.lines, {
      module: 'standard',
    });
    if (analysis.status !== 'analyzed') throw new Error(path);
    return { path, source, analysis };
  });
  const names = callableNames(analyses.map(({ analysis }) => analysis));
  return analyses.map(({ path, source, analysis }) => ({
    relativePath: path,
    shared: source.shared,
    analysis,
    references: findVb6References(path, source.lines, {
      module: 'standard',
      names,
    }),
  }));
}

describe('analyzeProgram', () => {
  const result = analyzeProgram(programFiles(), [
    {
      kind: 'component',
      identifier: '{X}',
      fileName: 'SPIN32.OCX',
      description: null,
    },
  ]);

  it('resolves local, program-wide, external and ambiguous calls', () => {
    expect(
      result.calls.map((call) => [
        call.from,
        call.name,
        call.resolution,
        call.targets,
      ]),
    ).toEqual([
      [
        'prog/MAIN.BAS#sub:Main',
        'Helper',
        'local',
        ['prog/MAIN.BAS#sub:Helper'],
      ],
      [
        'prog/MAIN.BAS#sub:Main',
        'SaveAll',
        'program',
        ['cmn/DB.BAS#sub:SaveAll'],
      ],
      [
        'prog/MAIN.BAS#sub:Main',
        'Format1',
        'ambiguous',
        ['cmn/DB.BAS#sub:Format1', 'cmn/FMT.BAS#sub:Format1'],
      ],
      [
        'cmn/DB.BAS#sub:SaveAll',
        'GetTickCount',
        'external',
        ['cmn/DB.BAS#declare:GetTickCount'],
      ],
    ]);
  });

  it('builds CRUD from own code and reachable shared procedures only', () => {
    expect(result.crud).toEqual([
      {
        table: 'ORDERS',
        operations: ['R', 'U'],
        evidence: { relativePath: 'prog/MAIN.BAS', line: 7 },
        viaSharedOnly: false,
      },
    ]);
    expect(result.externalApis).toEqual([
      { name: 'GetTickCount', library: 'kernel32' },
    ]);
    expect(result.metrics).toMatchObject({
      ownFiles: 1,
      ownProcedures: 2,
      reachableSharedProcedures: 1,
      tables: 1,
      components: 1,
      externalApis: 1,
    });
  });
});

describe('scoreComplexity (v0)', () => {
  const zero: ProgramMetrics = {
    ownFiles: 0,
    ownCodeLines: 0,
    ownProcedures: 0,
    decisionPoints: 0,
    maxProcedureDecisionPoints: 0,
    reachableSharedProcedures: 0,
    tables: 0,
    normalizedTables: 0,
    dynamicSql: 0,
    components: 0,
    externalApis: 0,
  };

  it('stays within 0-100 and caps every part', () => {
    expect(scoreComplexity(zero)).toMatchObject({ score: 0, level: 'low' });
    const huge = scoreComplexity({
      ...zero,
      ownCodeLines: 1e6,
      decisionPoints: 1e6,
      tables: 1e3,
      dynamicSql: 1e3,
      components: 1e3,
      externalApis: 1e3,
    });
    expect(huge).toMatchObject({ score: 100, level: 'high' });
  });

  it('grows with size', () => {
    const small = scoreComplexity({ ...zero, ownCodeLines: 400 }).score;
    const large = scoreComplexity({ ...zero, ownCodeLines: 8000 }).score;
    expect(large).toBeGreaterThan(small);
  });

  // Unrounded scores in comments; levels still use the rounded score.
  it.each([
    // 34.45: far from both thresholds.
    [{ ownCodeLines: 393, decisionPoints: 47, tables: 2 }, 34, 'low', []],
    // 38.09: Low, within 3 points of 40.
    [
      { ownCodeLines: 577, decisionPoints: 73, tables: 3 },
      38,
      'low',
      ['near-threshold'],
    ],
    // 39.71: Medium only through rounding, so it is flagged.
    [
      { ownCodeLines: 580, decisionPoints: 65, tables: 2, components: 1 },
      40,
      'medium',
      ['near-threshold'],
    ],
    // 65.92: High is always flagged.
    [
      { ownCodeLines: 9206, decisionPoints: 1408, tables: 15, components: 2 },
      66,
      'high',
      ['high'],
    ],
    // 57.11: High and within 3 points of 55.
    [
      { ownCodeLines: 5175, decisionPoints: 804, tables: 6, components: 1 },
      57,
      'high',
      ['high', 'near-threshold'],
    ],
  ])('flags %j for review', (metrics, score, level, reviewFlags) => {
    expect(scoreComplexity({ ...zero, ...metrics })).toMatchObject({
      version: 'complexity-v0',
      score,
      level,
      reviewFlags,
    });
  });
});
