import { Type, type Static, type TSchema } from 'typebox';

// Contract of the static source inventory (`source-inventory-v1`) read by
// agents, reports and the UI. Field meaning: docs/engineering/specs/
// source-inventory.md. Adding an optional field keeps the version; renaming,
// removing or changing the meaning of a field needs a new schemaVersion.

const Strict = { additionalProperties: false } as const;
const Line = Type.Integer({ minimum: 1 });
const Count = Type.Integer({ minimum: 0 });
const Sha256 = Type.String({ pattern: '^[0-9a-f]{64}$' });
const Nullable = <T extends TSchema>(schema: T) =>
  Type.Union([schema, Type.Null()]);

export const SourceFileRoleSchema = Type.Union([
  Type.Literal('code'),
  Type.Literal('project'),
  Type.Literal('resource'),
  Type.Literal('unsupported'),
  Type.Literal('excluded'),
]);

const SourceEncodingSchema = Type.Union([
  Type.Literal('cp932'),
  Type.Literal('utf-8'),
  Type.Literal('utf-16le'),
  Type.Literal('utf-16be'),
  Type.Literal('ascii'),
]);

const EntryBase = {
  relativePath: Type.String({ minLength: 1 }),
  role: SourceFileRoleSchema,
  byteLength: Count,
  rawSha256: Sha256,
};

export const ManifestEntrySchema = Type.Union([
  Type.Object(
    {
      ...EntryBase,
      kind: Type.Literal('text'),
      encoding: SourceEncodingSchema,
      encodingSource: Type.Union([
        Type.Literal('bom'),
        Type.Literal('profile'),
        Type.Literal('override'),
        Type.Literal('ascii'),
      ]),
      normalizedSha256: Sha256,
      lineCount: Count,
      newlineStyle: Type.Union([
        Type.Literal('crlf'),
        Type.Literal('lf'),
        Type.Literal('cr'),
        Type.Literal('mixed'),
        Type.Literal('none'),
      ]),
    },
    Strict,
  ),
  Type.Object(
    {
      ...EntryBase,
      kind: Type.Union([Type.Literal('binary'), Type.Literal('excluded')]),
    },
    Strict,
  ),
  Type.Object(
    {
      ...EntryBase,
      kind: Type.Literal('error'),
      errorCode: Type.String(),
      attemptedEncoding: Nullable(SourceEncodingSchema),
    },
    Strict,
  ),
]);

export const LineCountersSchema = Type.Object(
  {
    physicalLines: Count,
    designerLines: Count,
    metadataLines: Count,
    blankLines: Count,
    commentOnlyLines: Count,
    codeLines: Count,
    unclassifiedLines: Count,
  },
  Strict,
);

const SqlOperationSchema = Type.Union([
  Type.Literal('C'),
  Type.Literal('R'),
  Type.Literal('U'),
  Type.Literal('D'),
  Type.Literal('X'),
]);

const ProcedureSchema = Type.Object(
  {
    // `<relativePath>#<kind>:<name>`, stable across runs of the same bytes.
    id: Type.String(),
    kind: Type.String(),
    name: Type.String(),
    visibility: Type.Union([
      Type.Literal('global'),
      Type.Literal('public'),
      Type.Literal('private'),
    ]),
    startLine: Line,
    endLine: Line,
    // Code lines of `metricVersion` (source size, declarations included).
    codeLines: Count,
    decisionPoints: Count,
    // Breakdown of startLine..endLine, `procedureLinesVersion`; optional for
    // inventories written before it. physicalLines = codeLines +
    // commentOnlyLines + blankLines + metadataLines + unclassifiedLines.
    // executableLines (processing statements) and sqlLines (code lines
    // writing SQL text) are both subsets of codeLines and may overlap.
    physicalLines: Type.Optional(Count),
    executableLines: Type.Optional(Count),
    commentOnlyLines: Type.Optional(Count),
    blankLines: Type.Optional(Count),
    metadataLines: Type.Optional(Count),
    unclassifiedLines: Type.Optional(Count),
    sqlLines: Type.Optional(Count),
  },
  Strict,
);

const CodeFileAnalysisSchema = Type.Union([
  Type.Object(
    {
      status: Type.Literal('analyzed'),
      counters: LineCountersSchema,
      procedures: Type.Array(ProcedureSchema),
      fileLevelCodeLines: Count,
      sqlTables: Type.Array(
        Type.Object(
          {
            table: Type.String(),
            operation: SqlOperationSchema,
            line: Line,
            procedureId: Nullable(Type.String()),
          },
          Strict,
        ),
      ),
      dynamicSql: Type.Array(
        Type.Object(
          {
            operation: SqlOperationSchema,
            line: Line,
            procedureId: Nullable(Type.String()),
          },
          Strict,
        ),
      ),
      externalDeclarations: Type.Array(
        Type.Object(
          {
            name: Type.String(),
            library: Type.String(),
            visibility: Type.Union([
              Type.Literal('global'),
              Type.Literal('private'),
            ]),
            line: Line,
          },
          Strict,
        ),
      ),
      labels: Type.Array(
        Type.Object({ name: Type.String(), line: Line }, Strict),
      ),
    },
    Strict,
  ),
  Type.Object(
    {
      status: Type.Literal('unsupported'),
      reason: Type.String(),
      line: Nullable(Line),
    },
    Strict,
  ),
]);

const ProgramMemberSchema = Type.Object(
  {
    kind: Type.String(),
    name: Nullable(Type.String()),
    declaredPath: Type.String(),
    relativePath: Nullable(Type.String()),
    resolution: Type.Union([
      Type.Literal('resolved'),
      Type.Literal('case-mismatch'),
      Type.Literal('ambiguous'),
      Type.Literal('missing'),
      Type.Literal('outside-root'),
      Type.Literal('absolute-path'),
    ]),
    fileStatus: Nullable(
      Type.Union([
        Type.Literal('analyzed'),
        Type.Literal('unsupported'),
        Type.Literal('error'),
        Type.Literal('other'),
      ]),
    ),
    shared: Type.Boolean(),
  },
  Strict,
);

const CrudEntryFields = {
  table: Type.String(),
  operations: Type.Array(SqlOperationSchema, { minItems: 1 }),
  evidence: Type.Object({ relativePath: Type.String(), line: Line }, Strict),
  viaSharedOnly: Type.Boolean(),
};

const ComplexitySchema = Type.Object(
  {
    version: Type.String(),
    score: Type.Integer({ minimum: 0, maximum: 100 }),
    level: Type.Union([
      Type.Literal('low'),
      Type.Literal('medium'),
      Type.Literal('high'),
    ]),
    // Levels a person must look at before use (complexity-v0); optional for
    // inventories written before the flags.
    reviewFlags: Type.Optional(
      Type.Array(
        Type.Union([Type.Literal('high'), Type.Literal('near-threshold')]),
      ),
    ),
    parts: Type.Object(
      {
        size: Type.Number(),
        decisions: Type.Number(),
        tables: Type.Number(),
        dynamicSql: Type.Number(),
        components: Type.Number(),
        externalApis: Type.Number(),
      },
      Strict,
    ),
  },
  Strict,
);

const ProgramAnalysisSchema = Type.Object(
  {
    calls: Type.Array(
      Type.Object(
        {
          from: Type.String(),
          name: Type.String(),
          resolution: Type.Union([
            Type.Literal('local'),
            Type.Literal('program'),
            Type.Literal('ambiguous'),
            Type.Literal('external'),
          ]),
          targets: Type.Array(Type.String(), { minItems: 1 }),
          line: Line,
          count: Type.Integer({ minimum: 1 }),
        },
        Strict,
      ),
    ),
    crud: Type.Array(Type.Object(CrudEntryFields, Strict)),
    // CRUD after table name mapping (`tableNames`); `names` are the names
    // written in the source that were merged. Optional for older inventories.
    normalizedCrud: Type.Optional(
      Type.Array(
        Type.Object(
          {
            ...CrudEntryFields,
            names: Type.Array(Type.String(), { minItems: 1 }),
          },
          Strict,
        ),
      ),
    ),
    externalApis: Type.Array(
      Type.Object({ name: Type.String(), library: Type.String() }, Strict),
    ),
    metrics: Type.Object(
      {
        ownFiles: Count,
        ownCodeLines: Count,
        ownProcedures: Count,
        decisionPoints: Count,
        maxProcedureDecisionPoints: Count,
        reachableSharedProcedures: Count,
        tables: Count,
        normalizedTables: Type.Optional(Count),
        dynamicSql: Count,
        components: Count,
        externalApis: Count,
      },
      Strict,
    ),
    complexity: ComplexitySchema,
    normalizedComplexity: Type.Optional(ComplexitySchema),
  },
  Strict,
);

const ProgramSchema = Type.Object(
  {
    projectPath: Type.String(),
    status: Type.Union([Type.Literal('parsed'), Type.Literal('unsupported')]),
    issue: Nullable(
      Type.Object({ reason: Type.String(), line: Nullable(Line) }, Strict),
    ),
    name: Nullable(Type.String()),
    members: Type.Array(ProgramMemberSchema),
    externalReferences: Type.Array(
      Type.Object(
        {
          kind: Type.Union([
            Type.Literal('reference'),
            Type.Literal('component'),
          ]),
          identifier: Type.String(),
          fileName: Nullable(Type.String()),
          description: Nullable(Type.String()),
        },
        Strict,
      ),
    ),
    counters: LineCountersSchema,
    complete: Type.Boolean(),
    analysis: Nullable(ProgramAnalysisSchema),
  },
  Strict,
);

export const SOURCE_INVENTORY_SCHEMA_VERSION = 'source-inventory-v1';

export const SourceInventorySchema = Type.Object(
  {
    schemaVersion: Type.Literal(SOURCE_INVENTORY_SCHEMA_VERSION),
    profileId: Type.String(),
    languageId: Type.String(),
    metricVersion: Type.String(),
    // Optional for inventories written before the procedure breakdown.
    procedureLinesVersion: Type.Optional(Type.String()),
    decoderVersion: Type.String(),
    normalizationVersion: Type.String(),
    sqlAccessVersion: Type.String(),
    callGraphVersion: Type.String(),
    complexityVersion: Type.String(),
    // Optional for inventories written before table name mapping existed.
    tableNames: Type.Optional(
      Type.Object(
        {
          version: Type.String(),
          defaultSchema: Nullable(Type.String()),
          status: Type.Union([
            Type.Literal('unconfigured'),
            Type.Literal('assumed'),
            Type.Literal('confirmed'),
          ]),
        },
        Strict,
      ),
    ),
    snapshotHash: Sha256,
    files: Type.Array(
      Type.Object(
        {
          manifest: ManifestEntrySchema,
          analysis: Nullable(CodeFileAnalysisSchema),
        },
        Strict,
      ),
    ),
    programs: Type.Array(ProgramSchema),
    totals: Type.Object(
      {
        files: Count,
        codeFiles: Count,
        analyzedCodeFiles: Count,
        unsupportedFiles: Count,
        errorFiles: Count,
        uniqueCounters: LineCountersSchema,
      },
      Strict,
    ),
    // Files the reader did not load, with the reason: the CLI reader
    // (symlink, too-large) or a run's snapshot (all reasons; files outside the
    // profile's source types are not listed). Absent = unknown, [] = none.
    skipped: Type.Optional(
      Type.Array(
        Type.Object(
          {
            relativePath: Type.String(),
            reason: Type.Union([
              Type.Literal('symlink'),
              Type.Literal('too-large'),
              // Snapshot only: no permission to read the file or directory,
              // not a regular file, or a name that is not a portable path.
              Type.Literal('unreadable'),
              Type.Literal('special'),
              Type.Literal('invalid-name'),
            ]),
          },
          Strict,
        ),
      ),
    ),
  },
  Strict,
);

export type SourceInventoryDocument = Static<typeof SourceInventorySchema>;
