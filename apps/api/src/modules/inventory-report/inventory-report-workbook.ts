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
  const origin = source.origin;
  const heading = (title: string): [string, CellValue] => [title, null];
  const summary: [string, CellValue][] = [
    ...(origin
      ? ([
          heading('Provenance'),
          [
            'dataMode',
            origin.mode === 'demo'
              ? 'DEMO: bundled sample data, not a customer system'
              : 'local',
          ],
          ['project', origin.projectName],
          ['projectId', origin.projectId],
          ['runId', origin.runId],
          ['artifactId', origin.artifactId],
          ['artifactVersion', origin.artifactVersion],
          ['inventoryCreatedAt', origin.createdAt],
        ] satisfies [string, CellValue][])
      : []),
    heading('Source and versions'),
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
    heading('Scope and size'),
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
      'Reference classification only: do not derive effort or quotes from the score. Review file processing, DB writes and transactions separately.',
    ],
    heading('Warnings'),
    ['warnings', report.warnings.length],
    ...[...warningCounts].map(([code, count]): [string, CellValue] => [
      code,
      count,
    ]),
  ];
  const SECTIONS = new Set([
    'Provenance',
    'Source and versions',
    'Scope and size',
    'Warnings',
  ]);
  const summaryHeadings = summary.flatMap(([label, value], index) =>
    value === null && SECTIONS.has(label) ? [index] : [],
  );

  type Program = InventoryReport['programs'][number];
  const totalRows = [
    { scope: 'perProgramSum', ...totals.perProgramSum, files: null },
    { scope: 'unique', ...totals.unique },
  ];

  const tables: Sheet[] = [
    table(
      'Summary',
      [
        ['Item', 30, (row) => row[0]],
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
  return arrangeSheets(report, tables, summaryHeadings);
}

type SheetInfo = { name: string; about: string; key: string };
// Fixed order and grouping of the workbook. A name here that the tables
// above do not produce (or the other way round) fails the arrangement.
const GROUPS: { title: string; color: string; sheets: SheetInfo[] }[] = [
  {
    title: 'Overview',
    color: 'FF1F3864',
    sheets: [
      {
        name: 'Summary',
        about:
          'Where the data comes from (project, run, artifact, snapshot), the analyzer versions and the size of the selection.',
        key: 'Item',
      },
      {
        name: 'Totals',
        about:
          'Line counters of the whole selection: the sum over programs (shared files counted per program) next to the unique total.',
        key: 'scope',
      },
    ],
  },
  {
    title: 'Program level',
    color: 'FF2E75B6',
    sheets: [
      {
        name: 'Programs',
        about:
          'One row per program: status, line counters, metrics and the reference complexity.',
        key: 'programId',
      },
      {
        name: 'Members',
        about:
          'Files each project file declares and where they were found; shared files are marked.',
        key: 'programId + declaredPath',
      },
      {
        name: 'ExternalRefs',
        about: 'COM / OCX references declared by each project file.',
        key: 'programId + identifier',
      },
      {
        name: 'ExternalAPIs',
        about: 'Native (DLL) API functions declared by each program.',
        key: 'programId + name',
      },
    ],
  },
  {
    title: 'Detail',
    color: 'FF548235',
    sheets: [
      {
        name: 'Files',
        about:
          'Each distinct source file of the selection with its hash, encoding and line counters.',
        key: 'relativePath',
      },
      {
        name: 'Procedures',
        about:
          'Line counters, decision points and line range of every procedure.',
        key: 'procedureId',
      },
      {
        name: 'Calls',
        about: 'Procedure calls with how each one was resolved.',
        key: 'from + name',
      },
      {
        name: 'CRUD',
        about:
          'Tables read or written per program: as written in source (raw) and after table-name mapping (normalized).',
        key: 'programId + table',
      },
      {
        name: 'DynamicSQL',
        about: 'SQL whose table name is only known at runtime.',
        key: 'relativePath + line',
      },
      {
        name: 'ConcatenatedSQL',
        about: 'SQL that joins runtime values into the statement text.',
        key: 'relativePath + line',
      },
    ],
  },
  {
    title: 'Warnings',
    color: 'FFC55A11',
    sheets: [
      {
        name: 'Warnings',
        about:
          'Everything the analysis could not decide or a reader should double-check, with file and line when known.',
        key: 'code',
      },
    ],
  },
];

function arrangeSheets(
  report: InventoryReport,
  tables: readonly Sheet[],
  summaryHeadings: readonly number[],
): Sheet[] {
  const byName = new Map(tables.map((sheet) => [sheet.name, sheet]));
  const ordered: Sheet[] = [];
  const indexRows: CellValue[][] = [];
  const headingRows: number[] = [];
  const linkRows = new Map<number, string>();
  const heading = (title: string) => {
    headingRows.push(indexRows.length);
    indexRows.push([title, null, null, null]);
  };
  const { origin } = report.source;
  heading('About this report');
  indexRows.push(['Report', report.reportVersion, null, null]);
  if (origin)
    indexRows.push(
      [
        'Data',
        origin.mode === 'demo'
          ? 'DEMO: bundled sample data, not a customer system'
          : 'local source',
        null,
        null,
      ],
      ['Project', origin.projectName, null, null],
      ['Run', origin.runId, null, null],
      [
        'Inventory',
        `${origin.artifactId} v${origin.artifactVersion}`,
        null,
        null,
      ],
    );
  indexRows.push(
    ['Snapshot', report.source.snapshotHash, null, null],
    ['Programs', report.totals.programs, null, null],
  );
  for (const group of GROUPS) {
    heading(`Sheets: ${group.title}`);
    for (const info of group.sheets) {
      const sheet = byName.get(info.name);
      if (!sheet) throw new Error(`Workbook has no sheet ${info.name}`);
      byName.delete(info.name);
      linkRows.set(indexRows.length, info.name);
      indexRows.push([
        info.name,
        info.about,
        info.key,
        sheet.rows.length -
          (sheet.name === 'Summary' ? summaryHeadings.length : 0),
      ]);
      ordered.push({
        ...sheet,
        tabColor: group.color,
        ...(sheet.name === 'Summary'
          ? {
              columns: [
                { header: 'Item', width: 30 },
                { header: 'Value', width: 80, wrap: true },
              ],
              headingRows: summaryHeadings,
              boldFirstColumn: true,
              filter: false,
            }
          : {}),
      });
    }
  }
  if (byName.size > 0)
    throw new Error(
      `Sheets not in the workbook layout: ${[...byName.keys()].join(', ')}`,
    );
  const index: Sheet = {
    name: 'README',
    title: origin
      ? `Assessment report: ${origin.projectName}`
      : 'Assessment report',
    tabColor: 'FF1F3864',
    columns: [
      { header: 'Sheet / item', width: 22 },
      { header: 'What it contains', width: 60, wrap: true },
      { header: 'Key column', width: 26 },
      { header: 'Rows', width: 8 },
    ],
    rows: indexRows,
    headingRows,
    linkRows,
    boldFirstColumn: true,
    filter: false,
  };
  return [index, ...ordered];
}
