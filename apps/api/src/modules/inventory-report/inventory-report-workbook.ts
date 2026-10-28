import type { InventoryReport } from './inventory-report.js';
import type { CellValue, Sheet } from './xlsx-writer.js';

// Lays an inventory report out as spreadsheet tables, one sheet per table
// of the JSON report, same values and order. The JSON stays the source of
// truth; lists are joined with "; " in one cell.

// An empty list is an empty cell, not an empty string.
const list = (values: readonly string[]) =>
  values.length > 0 ? values.join('; ') : null;
const flag = (value: boolean) => (value ? 'yes' : 'no');

function table<T>(
  name: string,
  columns: readonly [
    header: string,
    width: number,
    value: (row: T) => CellValue,
  ][],
  rows: readonly T[],
): Sheet {
  return {
    name,
    columns: columns.map(([header, width]) => ({ header, width })),
    rows: rows.map((row) => columns.map(([, , value]) => value(row))),
  };
}

const COUNTERS = [
  'physicalLines',
  'designerLines',
  'metadataLines',
  'blankLines',
  'commentOnlyLines',
  'codeLines',
  'unclassifiedLines',
] as const;

export function inventoryReportSheets(report: InventoryReport): Sheet[] {
  const { source, totals } = report;
  const warningCounts = new Map<string, number>();
  for (const warning of report.warnings)
    warningCounts.set(warning.code, (warningCounts.get(warning.code) ?? 0) + 1);
  const summary: [string, CellValue][] = [
    ['reportVersion', report.reportVersion],
    ['schemaVersion', source.schemaVersion],
    ['profileId', source.profileId],
    ['languageId', source.languageId],
    ['snapshotHash', source.snapshotHash],
    ...Object.entries(source.versions).map(
      ([key, value]): [string, CellValue] => [key, value],
    ),
    [
      'tableNames',
      source.tableNames
        ? `${source.tableNames.defaultSchema ?? '(none)'} (${source.tableNames.status})`
        : null,
    ],
    ['programs', totals.programs],
    ['programIds', list(report.selection.programs.map((p) => p.id))],
    ['uniqueFiles', totals.unique.files],
    ['sharedFilesInSelection', totals.unique.sharedFiles],
    ['uniqueCodeLines', totals.unique.codeLines],
    ['perProgramCodeLinesSum', totals.perProgramSum.codeLines],
    [
      'note',
      'Per-program totals count a shared file in every program that lists it; unique totals count each file once. Do not add them together.',
    ],
    [
      'complexityUse',
      'Reference classification only: do not derive effort or quotes from the score. Review file processing, DB writes and transactions separately; see complexityReviewFlags in Programs.',
    ],
    [
      'complexityKnownMismatches',
      list(
        report.complexityKnownMismatches.map((m) => `${m.program}: ${m.note}`),
      ),
    ],
    ['warnings', report.warnings.length],
    ...[...warningCounts].map(([code, count]): [string, CellValue] => [
      `warnings.${code}`,
      count,
    ]),
  ];

  type Program = InventoryReport['programs'][number];
  const totalRows = [
    { scope: 'perProgramSum', ...totals.perProgramSum, files: null },
    { scope: 'unique', ...totals.unique },
  ];

  return [
    table(
      'Summary',
      [
        ['Item', 40, (row) => row[0]],
        ['Value', 90, (row) => row[1]],
      ],
      summary,
    ),
    table<Program>(
      'Programs',
      [
        ['programId', 12, (p) => p.id],
        ['projectPath', 26, (p) => p.projectPath],
        ['name', 22, (p) => p.name],
        ['status', 10, (p) => p.status],
        ['issue', 20, (p) => p.issue],
        ['complete', 9, (p) => flag(p.complete)],
        ['members', 9, (p) => p.members],
        ...COUNTERS.map((key): [string, number, (p: Program) => CellValue] => [
          key,
          12,
          (p) => p.counters[key],
        ]),
        ['procedures', 11, (p) => p.procedures],
        [
          'procedurePhysicalLines',
          12,
          (p) => p.procedureLines.procedurePhysicalLines,
        ],
        ['executableLines', 12, (p) => p.procedureLines.executableLines],
        ['sqlLines', 10, (p) => p.procedureLines.sqlLines],
        ['ownFiles', 9, (p) => p.metrics?.ownFiles ?? null],
        ['ownCodeLines', 12, (p) => p.metrics?.ownCodeLines ?? null],
        ['ownProcedures', 12, (p) => p.metrics?.ownProcedures ?? null],
        ['decisionPoints', 12, (p) => p.metrics?.decisionPoints ?? null],
        ['tables', 8, (p) => p.metrics?.tables ?? null],
        ['normalizedTables', 12, (p) => p.metrics?.normalizedTables ?? null],
        ['dynamicSql', 10, (p) => p.metrics?.dynamicSql ?? null],
        ['concatenatedSql', 14, (p) => p.metrics?.concatenatedSql ?? null],
        ['parameterizedSql', 15, (p) => p.metrics?.parameterizedSql ?? null],
        ['components', 11, (p) => p.metrics?.components ?? null],
        ['externalApis', 11, (p) => p.metrics?.externalApis ?? null],
        ['complexityScore', 12, (p) => p.complexity?.score ?? null],
        ['complexityLevel', 12, (p) => p.complexity?.level ?? null],
        ['complexityReviewFlags', 26, (p) => list(p.complexityReviewFlags)],
        [
          'normalizedComplexityScore',
          14,
          (p) => p.normalizedComplexity?.score ?? null,
        ],
        [
          'normalizedComplexityLevel',
          14,
          (p) => p.normalizedComplexity?.level ?? null,
        ],
      ],
      report.programs,
    ),
    table(
      'Members',
      [
        ['programId', 12, (m) => m.programId],
        ['kind', 10, (m) => m.kind],
        ['name', 18, (m) => m.name],
        ['declaredPath', 30, (m) => m.declaredPath],
        ['relativePath', 30, (m) => m.relativePath],
        ['resolution', 13, (m) => m.resolution],
        ['fileStatus', 11, (m) => m.fileStatus],
        ['sharedInCorpus', 10, (m) => flag(m.shared)],
      ],
      report.members,
    ),
    table(
      'Files',
      [
        ['relativePath', 32, (f) => f.relativePath],
        ['role', 9, (f) => f.role],
        ['kind', 8, (f) => f.kind],
        ['rawSha256', 66, (f) => f.rawSha256],
        ['encoding', 9, (f) => f.encoding],
        ['lineCount', 10, (f) => f.lineCount],
        ['analysisStatus', 12, (f) => f.analysisStatus],
        ['issue', 20, (f) => f.issue],
        ...COUNTERS.map(
          (
            key,
          ): [
            string,
            number,
            (f: InventoryReport['files'][number]) => CellValue,
          ] => [key, 12, (f) => f.counters?.[key] ?? null],
        ),
        ['fileLevelCodeLines', 12, (f) => f.fileLevelCodeLines],
        ['procedures', 11, (f) => f.procedures],
        ['usedBy', 30, (f) => list(f.usedBy)],
      ],
      report.files,
    ),
    table(
      'Procedures',
      [
        ['relativePath', 32, (p) => p.relativePath],
        ['procedureId', 50, (p) => p.id],
        ['kind', 12, (p) => p.kind],
        ['name', 24, (p) => p.name],
        ['visibility', 10, (p) => p.visibility],
        ['startLine', 9, (p) => p.startLine],
        ['endLine', 9, (p) => p.endLine],
        ['physicalLines', 11, (p) => p.physicalLines],
        ['codeLines', 10, (p) => p.codeLines],
        ['executableLines', 12, (p) => p.executableLines],
        ['commentOnlyLines', 12, (p) => p.commentOnlyLines],
        ['blankLines', 10, (p) => p.blankLines],
        ['metadataLines', 11, (p) => p.metadataLines],
        ['unclassifiedLines', 12, (p) => p.unclassifiedLines],
        ['sqlLines', 9, (p) => p.sqlLines],
        ['decisionPoints', 11, (p) => p.decisionPoints],
        ['usedBy', 30, (p) => list(p.usedBy)],
      ],
      report.procedures,
    ),
    table(
      'Calls',
      [
        ['programId', 12, (c) => c.programId],
        ['fromFile', 30, (c) => c.fromFile],
        ['from', 50, (c) => c.from],
        ['name', 24, (c) => c.name],
        ['resolution', 11, (c) => c.resolution],
        ['targets', 60, (c) => list(c.targets)],
        ['line', 8, (c) => c.line],
        ['count', 8, (c) => c.count],
      ],
      report.calls,
    ),
    table(
      'CRUD',
      [
        ['programId', 12, (c) => c.programId],
        ['view', 11, (c) => c.view],
        ['table', 28, (c) => c.table],
        ['operations', 10, (c) => c.operations],
        ['namesInSource', 36, (c) => list(c.names)],
        ['evidencePath', 30, (c) => c.relativePath],
        ['evidenceLine', 10, (c) => c.line],
        ['viaSharedOnly', 11, (c) => flag(c.viaSharedOnly)],
      ],
      report.crud,
    ),
    table(
      'DynamicSQL',
      [
        ['relativePath', 32, (d) => d.relativePath],
        ['procedureId', 50, (d) => d.procedureId],
        ['operation', 10, (d) => d.operation],
        ['line', 8, (d) => d.line],
        ['usedBy', 30, (d) => list(d.usedBy)],
      ],
      report.dynamicSql,
    ),
    table(
      'ConcatenatedSQL',
      [
        ['relativePath', 32, (d) => d.relativePath],
        ['procedureId', 50, (d) => d.procedureId],
        ['operation', 10, (d) => d.operation],
        ['line', 8, (d) => d.line],
        ['usedBy', 30, (d) => list(d.usedBy)],
      ],
      report.concatenatedSql,
    ),
    table(
      'ExternalRefs',
      [
        ['programId', 12, (r) => r.programId],
        ['kind', 11, (r) => r.kind],
        ['identifier', 40, (r) => r.identifier],
        ['fileName', 20, (r) => r.fileName],
        ['description', 36, (r) => r.description],
      ],
      report.externalReferences,
    ),
    table(
      'ExternalAPIs',
      [
        ['programId', 12, (a) => a.programId],
        ['name', 28, (a) => a.name],
        ['library', 20, (a) => a.library],
      ],
      report.externalApis,
    ),
    table<(typeof totalRows)[number]>(
      'Totals',
      [
        ['scope', 14, (t) => t.scope],
        ...COUNTERS.map(
          (
            key,
          ): [string, number, (t: (typeof totalRows)[number]) => CellValue] => [
            key,
            12,
            (t) => t[key],
          ],
        ),
        ['procedurePhysicalLines', 12, (t) => t.procedurePhysicalLines],
        ['executableLines', 12, (t) => t.executableLines],
        ['sqlLines', 10, (t) => t.sqlLines],
        ['files', 8, (t) => t.files],
      ],
      totalRows,
    ),
    table(
      'Warnings',
      [
        ['code', 26, (w) => w.code],
        ['programId', 12, (w) => w.programId],
        ['relativePath', 32, (w) => w.relativePath],
        ['line', 8, (w) => w.line],
        ['detail', 60, (w) => w.detail],
      ],
      report.warnings,
    ),
  ];
}
