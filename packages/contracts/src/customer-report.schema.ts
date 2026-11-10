import { Type, type Static, type TSchema } from 'typebox';

// JSON of the customer assessment report (`customer-assessment-report-v1`,
// AR02): what the customer-report route returns for format=json and what
// the Japanese PDF (AR03) is drawn from, so the Excel and the PDF read the
// same numbers. Objects are open: a field added to the report does not break
// a reader that does not use it; a field this schema lists is required.

const Count = Type.Integer({ minimum: 0 });
const Nullable = <T extends TSchema>(schema: T) =>
  Type.Union([schema, Type.Null()]);

export const CUSTOMER_REPORT_VERSION = 'customer-assessment-report-v1';

const Origin = Type.Object({
  mode: Type.Union([Type.Literal('demo'), Type.Literal('local')]),
  projectId: Type.String(),
  projectName: Type.String(),
  runId: Type.String(),
  artifactId: Type.String(),
  artifactVersion: Count,
  createdAt: Type.String(),
});

const ReportKindCounts = Type.Object({
  'data-report': Count,
  crystal: Count,
  excel: Count,
  print: Count,
  'file-output': Count,
  unknown: Count,
});
const ReportLevelCounts = Type.Object({
  low: Count,
  medium: Count,
  high: Count,
  'very-high': Count,
  unrated: Count,
});

const ScreenReportTotals = Type.Object({
  screens: Count,
  sharedScreens: Count,
  batches: Count,
  reports: Type.Object({
    rows: Count,
    counted: Count,
    suspected: Count,
    byKind: ReportKindCounts,
    byLevel: ReportLevelCounts,
  }),
  suspectedPrograms: Count,
});

const Level = Type.Union([
  Type.Literal('low'),
  Type.Literal('medium'),
  Type.Literal('high'),
  Type.Literal('very-high'),
]);

export const CustomerReportSchema = Type.Object({
  reportVersion: Type.Literal(CUSTOMER_REPORT_VERSION),
  language: Type.Literal('ja'),
  source: Type.Object({
    origin: Nullable(Origin),
    snapshotHash: Type.String(),
    versions: Type.Object({
      complexityVersion: Type.String(),
      screenReportVersion: Nullable(Type.String()),
      reportComplexityVersion: Nullable(Type.String()),
    }),
  }),
  scale: Type.Object({
    programs: Count,
    completePrograms: Count,
    files: Count,
    analyzedFiles: Count,
    codeLines: Count,
    commentLines: Count,
    blankLines: Count,
    physicalLines: Count,
    procedures: Count,
    tables: Count,
    tablesView: Nullable(
      Type.Union([Type.Literal('normalized'), Type.Literal('raw')]),
    ),
    // The table names rest on an assumed schema mapping (AR02 review 1).
    tablesAssumed: Type.Optional(Type.Boolean()),
    // null: the inventory has no screen/report data (not zero).
    // reports.counted / rows = the reports of the system (Crystal / DataReport
    // templates, files that print in code, files that export CSV / Excel);
    // reports.suspected is 0. The split is in reportBreakdown.
    screenReport: Nullable(ScreenReportTotals),
    reportBreakdown: Type.Optional(
      Nullable(
        Type.Object({
          total: Count,
          crystal: Count,
          designFile: Count,
          missingFile: Count,
          print: Count,
          export: Count,
          dataFiles: Count,
          excluded: Count,
        }),
      ),
    ),
  }),
  modules: Type.Array(
    Type.Object({
      module: Type.String(),
      kind: Type.Union([
        Type.Literal('module'),
        Type.Literal('shared'),
        Type.Literal('unassigned'),
      ]),
      programs: Count,
      screens: Count,
      reports: Count,
      batches: Count,
      files: Count,
      codeLines: Count,
    }),
  ),
  complexity: Type.Object({
    version: Type.String(),
    levels: Type.Object({
      low: Nullable(Count),
      medium: Nullable(Count),
      high: Nullable(Count),
      'very-high': Nullable(Count),
    }),
    notAnalyzed: Count,
    reportModelVersion: Nullable(Type.String()),
    reportLevels: Nullable(ReportLevelCounts),
    top: Type.Array(
      Type.Object({
        program: Type.String(),
        module: Type.String(),
        level: Level,
        score: Count,
        codeLines: Count,
        screens: Nullable(Count),
        reports: Nullable(Count),
      }),
    ),
  }),
  dependencies: Type.Object({
    shared: Type.Array(
      Type.Object({
        file: Type.String(),
        programs: Count,
        procedures: Count,
        codeLines: Count,
      }),
    ),
    components: Type.Array(
      Type.Object({
        // Reference= (type library) or Object= (OCX component).
        kind: Type.Optional(
          Type.Union([Type.Literal('reference'), Type.Literal('component')]),
        ),
        identifier: Type.String(),
        fileName: Nullable(Type.String()),
        description: Nullable(Type.String()),
        programs: Count,
      }),
    ),
    apis: Type.Array(
      Type.Object({
        name: Type.String(),
        library: Type.String(),
        programs: Count,
      }),
    ),
  }),
  database: Type.Object({
    tables: Type.Array(
      Type.Object({
        table: Type.String(),
        programs: Count,
        operations: Type.String(),
      }),
    ),
    sqlByModule: Type.Array(
      Type.Object({
        module: Type.String(),
        dynamicSql: Count,
        // null: the inventory predates the field (unknown, not zero).
        concatenatedSql: Nullable(Count),
      }),
    ),
    dynamicSql: Count,
    concatenatedSql: Nullable(Count),
  }),
  risks: Type.Array(
    Type.Object({
      code: Type.String(),
      source: Type.Union([Type.Literal('warning'), Type.Literal('data')]),
      category: Type.String(),
      severity: Type.Union([
        Type.Literal('高'),
        Type.Literal('中'),
        Type.Literal('低'),
      ]),
      count: Count,
      content: Type.String(),
      programs: Type.Array(Type.String()),
      otherPrograms: Count,
      confirmation: Type.String(),
    }),
  ),
  items: Type.Array(
    Type.Object({
      type: Type.Union([
        Type.Literal('画面'),
        Type.Literal('帳票'),
        Type.Literal('出力機能'),
        Type.Literal('バッチ'),
      ]),
      kindLabel: Type.String(),
      programs: Type.String(),
      module: Type.String(),
      name: Type.String(),
      file: Type.String(),
      line: Nullable(Count),
      shared: Type.Boolean(),
      confidence: Type.String(),
      confidenceLabel: Type.String(),
      level: Nullable(Type.String()),
      levelLabel: Nullable(Type.String()),
      score: Nullable(Count),
      modelVersion: Nullable(Type.String()),
      factors: Type.String(),
      note: Type.String(),
    }),
  ),
  recommendations: Type.Array(Type.String()),
});

export type CustomerReportDocument = Static<typeof CustomerReportSchema>;
