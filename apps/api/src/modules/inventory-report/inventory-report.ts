import type { SourceInventoryDocument } from '@portal/contracts';

// Builds a report for selected programs from a source inventory that was
// already produced and validated (specs/inventory-report.md). It only reads
// inventory data: no source file is opened or parsed again. Every row keeps
// its file/procedure/line so it can be traced back, and every warning of
// the selection is listed instead of being filtered out.

export const INVENTORY_REPORT_VERSION = 'inventory-report-v1';

type Inventory = SourceInventoryDocument;
type InventoryProgram = Inventory['programs'][number];
type InventoryFile = Inventory['files'][number];
type LineCounters = InventoryProgram['counters'];
type AnalyzedFile = Extract<
  NonNullable<InventoryFile['analysis']>,
  { status: 'analyzed' }
>;
type SqlUse = AnalyzedFile['dynamicSql'][number];
type InventoryComplexity = NonNullable<
  InventoryProgram['analysis']
>['complexity'];
// Score and level only: review flags written by complexity-v0 inventories
// are not reported.
export type ReportComplexity = Omit<InventoryComplexity, 'reviewFlags'>;

function reportComplexity(
  complexity: InventoryComplexity | undefined,
): ReportComplexity | null {
  if (!complexity) return null;
  const { version, score, level, parts } = complexity;
  return { version, score, level, parts: { ...parts } };
}

// One SQL fact of a selected file (dynamic table name, concatenated value).
export type SqlUseRow = {
  relativePath: string;
  procedureId: string | null;
  operation: string;
  line: number;
  usedBy: string[];
};

// Procedure breakdown (procedureLinesVersion); null in older inventories.
export type ProcedureLineTotals = {
  procedurePhysicalLines: number | null;
  executableLines: number | null;
  sqlLines: number | null;
};

const BREAKDOWN = {
  procedurePhysicalLines: 'physicalLines',
  executableLines: 'executableLines',
  sqlLines: 'sqlLines',
} as const;

export type ReportWarning = {
  code: string;
  programId: string | null;
  relativePath: string | null;
  line: number | null;
  detail: string;
};

export type InventoryReport = {
  reportVersion: typeof INVENTORY_REPORT_VERSION;
  source: {
    schemaVersion: string;
    profileId: string;
    languageId: string;
    snapshotHash: string;
    versions: {
      metricVersion: string;
      procedureLinesVersion: string | null;
      decoderVersion: string;
      normalizationVersion: string;
      sqlAccessVersion: string;
      callGraphVersion: string;
      complexityVersion: string;
      tableNameVersion: string | null;
    };
    tableNames: { defaultSchema: string | null; status: string } | null;
  };
  selection: {
    requested: string[];
    programs: { id: string; projectPath: string }[];
  };
  // As given to the report, including programs outside the selection.
  programs: {
    id: string;
    projectPath: string;
    name: string | null;
    status: string;
    issue: string | null;
    complete: boolean;
    members: number;
    // Sums over the program's distinct analyzed member files; a shared
    // file counts in every program that lists it.
    counters: LineCounters;
    procedures: number;
    procedureLines: ProcedureLineTotals;
    metrics: NonNullable<InventoryProgram['analysis']>['metrics'] | null;
    complexity: ReportComplexity | null;
    normalizedComplexity: ReportComplexity | null;
  }[];
  members: {
    programId: string;
    kind: string;
    name: string | null;
    declaredPath: string;
    relativePath: string | null;
    resolution: string;
    fileStatus: string | null;
    shared: boolean;
  }[];
  files: {
    relativePath: string;
    role: string;
    kind: string;
    rawSha256: string;
    encoding: string | null;
    lineCount: number | null;
    analysisStatus: string | null;
    issue: string | null;
    counters: LineCounters | null;
    fileLevelCodeLines: number | null;
    procedures: number | null;
    // Selected programs listing the file.
    usedBy: string[];
  }[];
  procedures: {
    relativePath: string;
    id: string;
    kind: string;
    name: string;
    visibility: string;
    startLine: number;
    endLine: number;
    physicalLines: number | null;
    codeLines: number;
    executableLines: number | null;
    commentOnlyLines: number | null;
    blankLines: number | null;
    metadataLines: number | null;
    unclassifiedLines: number | null;
    sqlLines: number | null;
    decisionPoints: number;
    usedBy: string[];
  }[];
  calls: {
    programId: string;
    fromFile: string;
    from: string;
    name: string;
    resolution: string;
    targets: string[];
    line: number;
    count: number;
  }[];
  crud: {
    programId: string;
    view: 'raw' | 'normalized';
    table: string;
    operations: string;
    names: string[];
    relativePath: string;
    line: number;
    viaSharedOnly: boolean;
  }[];
  dynamicSql: SqlUseRow[];
  // Empty for inventories written before sql-access-v5.
  concatenatedSql: SqlUseRow[];
  externalReferences: {
    programId: string;
    kind: string;
    identifier: string;
    fileName: string | null;
    description: string | null;
  }[];
  externalApis: { programId: string; name: string; library: string }[];
  totals: {
    programs: number;
    // Sum of the per-program counters: shared files counted once per
    // program. Not a corpus size.
    perProgramSum: LineCounters & ProcedureLineTotals;
    // Each distinct file of the selection counted once.
    unique: LineCounters &
      ProcedureLineTotals & {
        files: number;
        analyzedFiles: number;
        sharedFiles: number;
        procedures: number;
        procedureCodeLines: number;
        fileLevelCodeLines: number;
      };
  };
  warnings: ReportWarning[];
};

export class ReportSelectionError extends Error {}

const COUNTER_KEYS = [
  'physicalLines',
  'designerLines',
  'metadataLines',
  'blankLines',
  'commentOnlyLines',
  'codeLines',
  'unclassifiedLines',
] as const;

function zeroCounters(): LineCounters {
  return {
    physicalLines: 0,
    designerLines: 0,
    metadataLines: 0,
    blankLines: 0,
    commentOnlyLines: 0,
    codeLines: 0,
    unclassifiedLines: 0,
  };
}

function addCounters(sum: LineCounters, add: LineCounters): void {
  for (const key of COUNTER_KEYS) sum[key] += add[key];
}

// A member path written as absolute (drive `C:\...`, UNC `\\server\...`,
// rooted `/...` or `\...`) names a place on someone's machine; the report
// keeps only the file name, and the resolution says it was absolute.
const ABSOLUTE_PATH = /^(?:[A-Za-z]:|[\\/])/;
export const REDACTED_PREFIX = '<absolute path>/';

export function redactAbsolutePath(path: string): string {
  const trimmed = path.trim();
  if (!ABSOLUTE_PATH.test(trimmed)) return path;
  return REDACTED_PREFIX + (trimmed.split(/[\\/]/).at(-1) ?? '');
}

// Program ID: project file name without extension (`KUN/KUNO0020.vbp` →
// `KUNO0020`), compared without case.
export function programId(projectPath: string): string {
  const name = projectPath.split('/').at(-1) ?? projectPath;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function selectPrograms(inventory: Inventory, requested: readonly string[]) {
  const seen = new Set<string>();
  const selected: { id: string; program: InventoryProgram }[] = [];
  for (const id of requested) {
    const key = id.trim().toUpperCase();
    if (key === '' || seen.has(key))
      throw new ReportSelectionError(`Program ID empty or repeated: ${id}`);
    seen.add(key);
    const matches = inventory.programs.filter(
      (program) => programId(program.projectPath).toUpperCase() === key,
    );
    if (matches.length !== 1)
      throw new ReportSelectionError(
        `Program ${id} matches ${matches.length} project files`,
      );
    const [program] = matches;
    if (program) selected.push({ id: programId(program.projectPath), program });
  }
  return selected;
}

// Null when any procedure lacks the field (inventory older than it).
function breakdownOf(
  procedures: AnalyzedFile['procedures'],
): ProcedureLineTotals {
  const sum = (field: (typeof BREAKDOWN)[keyof typeof BREAKDOWN]) =>
    procedures.every((p) => p[field] !== undefined)
      ? procedures.reduce((total, p) => total + (p[field] ?? 0), 0)
      : null;
  return {
    procedurePhysicalLines: sum(BREAKDOWN.procedurePhysicalLines),
    executableLines: sum(BREAKDOWN.executableLines),
    sqlLines: sum(BREAKDOWN.sqlLines),
  };
}

function addBreakdown(
  sum: ProcedureLineTotals,
  add: ProcedureLineTotals,
): void {
  for (const key of Object.keys(BREAKDOWN) as (keyof ProcedureLineTotals)[]) {
    const [a, b] = [sum[key], add[key]];
    sum[key] = a === null || b === null ? null : a + b;
  }
}

const fileOf = (procedureId: string) =>
  procedureId.slice(0, procedureId.lastIndexOf('#'));

export function buildInventoryReport(
  inventory: Inventory,
  requested: readonly string[],
): InventoryReport {
  const selected = selectPrograms(inventory, requested);
  const filesByPath = new Map(
    inventory.files.map((file) => [file.manifest.relativePath, file]),
  );
  const analyzed = (path: string | null): AnalyzedFile | null => {
    const analysis = path ? filesByPath.get(path)?.analysis : null;
    return analysis?.status === 'analyzed' ? analysis : null;
  };
  const warnings: ReportWarning[] = [];
  const warn = (
    code: string,
    programId: string | null,
    relativePath: string | null,
    line: number | null,
    detail: string,
  ) => warnings.push({ code, programId, relativePath, line, detail });

  // Distinct files of the selection, with the programs that list them.
  const usedBy = new Map<string, string[]>();
  for (const { id, program } of selected) {
    for (const path of new Set(
      program.members.flatMap((m) => (m.relativePath ? [m.relativePath] : [])),
    ))
      usedBy.set(path, [...(usedBy.get(path) ?? []), id]);
    usedBy.set(program.projectPath, [
      ...(usedBy.get(program.projectPath) ?? []),
      id,
    ]);
  }
  const selectedPaths = [...usedBy.keys()].sort();

  const programs = selected.map(({ id, program }) => {
    const memberFiles = [
      ...new Set(
        program.members.flatMap((m) =>
          m.relativePath ? [m.relativePath] : [],
        ),
      ),
    ];
    const procedures = memberFiles.flatMap(
      (path) => analyzed(path)?.procedures ?? [],
    );
    return {
      id,
      projectPath: program.projectPath,
      name: program.name,
      status: program.status,
      issue: program.issue
        ? `${program.issue.reason}${program.issue.line ? ` (line ${program.issue.line})` : ''}`
        : null,
      complete: program.complete,
      members: program.members.length,
      counters: program.counters,
      procedures: procedures.length,
      procedureLines: breakdownOf(procedures),
      metrics: program.analysis?.metrics ?? null,
      complexity: reportComplexity(program.analysis?.complexity),
      normalizedComplexity: reportComplexity(
        program.analysis?.normalizedComplexity,
      ),
    };
  });

  const members = selected.flatMap(({ id, program }) =>
    program.members.map((member) => ({
      programId: id,
      ...member,
      declaredPath: redactAbsolutePath(member.declaredPath),
    })),
  );

  const files = selectedPaths.flatMap((path) => {
    const file = filesByPath.get(path);
    if (!file) return [];
    const { manifest, analysis } = file;
    return [
      {
        relativePath: path,
        role: manifest.role,
        kind: manifest.kind,
        rawSha256: manifest.rawSha256,
        encoding: manifest.kind === 'text' ? manifest.encoding : null,
        lineCount: manifest.kind === 'text' ? manifest.lineCount : null,
        analysisStatus: analysis?.status ?? null,
        issue:
          manifest.kind === 'error'
            ? manifest.errorCode
            : analysis?.status === 'unsupported'
              ? `${analysis.reason}${analysis.line ? ` (line ${analysis.line})` : ''}`
              : null,
        counters: analysis?.status === 'analyzed' ? analysis.counters : null,
        fileLevelCodeLines:
          analysis?.status === 'analyzed' ? analysis.fileLevelCodeLines : null,
        procedures:
          analysis?.status === 'analyzed' ? analysis.procedures.length : null,
        usedBy: usedBy.get(path) ?? [],
      },
    ];
  });

  const procedures = selectedPaths.flatMap((path) =>
    (analyzed(path)?.procedures ?? []).map((p) => ({
      relativePath: path,
      id: p.id,
      kind: p.kind,
      name: p.name,
      visibility: p.visibility,
      startLine: p.startLine,
      endLine: p.endLine,
      physicalLines: p.physicalLines ?? null,
      codeLines: p.codeLines,
      executableLines: p.executableLines ?? null,
      commentOnlyLines: p.commentOnlyLines ?? null,
      blankLines: p.blankLines ?? null,
      metadataLines: p.metadataLines ?? null,
      unclassifiedLines: p.unclassifiedLines ?? null,
      sqlLines: p.sqlLines ?? null,
      decisionPoints: p.decisionPoints,
      usedBy: usedBy.get(path) ?? [],
    })),
  );

  const calls = selected.flatMap(({ id, program }) =>
    (program.analysis?.calls ?? []).map((call) => ({
      programId: id,
      fromFile: fileOf(call.from),
      ...call,
    })),
  );

  const crud = selected.flatMap(({ id, program }) => {
    const analysis = program.analysis;
    if (!analysis) return [];
    const row = (
      view: 'raw' | 'normalized',
      entry: (typeof analysis.crud)[number] & { names?: string[] },
    ) => ({
      programId: id,
      view,
      table: entry.table,
      operations: entry.operations.join(''),
      names: entry.names ?? [entry.table],
      relativePath: entry.evidence.relativePath,
      line: entry.evidence.line,
      viaSharedOnly: entry.viaSharedOnly,
    });
    return [
      ...analysis.crud.map((entry) => row('raw', entry)),
      ...(analysis.normalizedCrud ?? []).map((entry) =>
        row('normalized', entry),
      ),
    ];
  });

  const sqlUseRows = (
    uses: (file: AnalyzedFile) => readonly SqlUse[] | undefined,
  ): SqlUseRow[] =>
    selectedPaths.flatMap((path) => {
      const file = analyzed(path);
      return (file ? (uses(file) ?? []) : []).map((use) => ({
        relativePath: path,
        procedureId: use.procedureId,
        operation: use.operation,
        line: use.line,
        usedBy: usedBy.get(path) ?? [],
      }));
    });
  const dynamicSql = sqlUseRows((file) => file.dynamicSql);
  const concatenatedSql = sqlUseRows((file) => file.concatenatedSql);

  const externalReferences = selected.flatMap(({ id, program }) =>
    program.externalReferences.map((reference) => ({
      programId: id,
      kind: reference.kind,
      identifier: redactAbsolutePath(reference.identifier),
      fileName:
        reference.fileName === null
          ? null
          : redactAbsolutePath(reference.fileName),
      description:
        reference.description === null
          ? null
          : redactAbsolutePath(reference.description),
    })),
  );
  // `Declare ... Lib "C:\...\X.DLL"` keeps only the library file name.
  const externalApis = selected.flatMap(({ id, program }) =>
    (program.analysis?.externalApis ?? []).map((api) => ({
      programId: id,
      name: api.name,
      library: redactAbsolutePath(api.library),
    })),
  );

  // Totals: per-program sums next to unique-file sums of the selection.
  const perProgramSum = zeroCounters();
  const perProgramBreakdown: ProcedureLineTotals = {
    procedurePhysicalLines: 0,
    executableLines: 0,
    sqlLines: 0,
  };
  for (const program of programs) {
    addCounters(perProgramSum, program.counters);
    addBreakdown(perProgramBreakdown, program.procedureLines);
  }
  const uniqueCounters = zeroCounters();
  for (const file of files)
    if (file.counters) addCounters(uniqueCounters, file.counters);
  const uniqueProcedures = selectedPaths.flatMap(
    (path) => analyzed(path)?.procedures ?? [],
  );

  // Warnings of the selection, in a stable order.
  const tableNames = inventory.tableNames ?? null;
  if (!tableNames || tableNames.status !== 'confirmed')
    warn(
      'TABLE_NAMES_NOT_CONFIRMED',
      null,
      null,
      null,
      tableNames
        ? `Normalized CRUD uses ${tableNames.defaultSchema ?? 'no schema'} (${tableNames.status})`
        : 'Inventory has no table name mapping',
    );
  if (inventory.complexityVersion.endsWith('-draft'))
    warn(
      'COMPLEXITY_DRAFT',
      null,
      null,
      null,
      `Complexity ${inventory.complexityVersion} is a draft model`,
    );
  else
    warn(
      'COMPLEXITY_REFERENCE_ONLY',
      null,
      null,
      null,
      `Complexity ${inventory.complexityVersion} is a reference classification: do not derive effort or quotes from it; review file processing, DB writes and transactions separately`,
    );
  if (!inventory.procedureLinesVersion)
    warn(
      'PROCEDURE_LINES_MISSING',
      null,
      null,
      null,
      'Inventory has no procedure line breakdown',
    );
  if (inventory.skipped?.length)
    warn(
      'FILES_SKIPPED',
      null,
      null,
      null,
      `${inventory.skipped.length} corpus files were not read (symlink/too-large)`,
    );
  for (const { id, program } of selected) {
    if (program.status !== 'parsed')
      warn(
        'PROGRAM_UNSUPPORTED',
        id,
        program.projectPath,
        program.issue?.line ?? null,
        program.issue?.reason ?? '',
      );
    if (!program.complete)
      warn('PROGRAM_INCOMPLETE', id, program.projectPath, null, '');
    for (const member of program.members)
      if (member.resolution !== 'resolved')
        warn(
          `MEMBER_${member.resolution.toUpperCase().replaceAll('-', '_')}`,
          id,
          member.relativePath ?? redactAbsolutePath(member.declaredPath),
          null,
          `${member.kind} ${redactAbsolutePath(member.declaredPath)}`,
        );
    for (const call of program.analysis?.calls ?? [])
      if (call.resolution === 'ambiguous')
        warn(
          'CALL_AMBIGUOUS',
          id,
          fileOf(call.from),
          call.line,
          `${call.name} → ${call.targets.join(', ')}`,
        );
  }
  for (const file of files) {
    if (file.issue)
      warn(
        file.kind === 'error' ? 'FILE_ERROR' : 'FILE_UNSUPPORTED',
        null,
        file.relativePath,
        null,
        file.issue,
      );
    if (file.counters && file.counters.unclassifiedLines > 0)
      warn(
        'UNCLASSIFIED_LINES',
        null,
        file.relativePath,
        null,
        `${file.counters.unclassifiedLines} lines`,
      );
  }
  for (const use of dynamicSql)
    warn(
      'DYNAMIC_SQL',
      null,
      use.relativePath,
      use.line,
      `${use.operation} in ${use.procedureId ?? 'file level'}`,
    );

  return {
    reportVersion: INVENTORY_REPORT_VERSION,
    source: {
      schemaVersion: inventory.schemaVersion,
      profileId: inventory.profileId,
      languageId: inventory.languageId,
      snapshotHash: inventory.snapshotHash,
      versions: {
        metricVersion: inventory.metricVersion,
        procedureLinesVersion: inventory.procedureLinesVersion ?? null,
        decoderVersion: inventory.decoderVersion,
        normalizationVersion: inventory.normalizationVersion,
        sqlAccessVersion: inventory.sqlAccessVersion,
        callGraphVersion: inventory.callGraphVersion,
        complexityVersion: inventory.complexityVersion,
        tableNameVersion: tableNames?.version ?? null,
      },
      tableNames: tableNames
        ? { defaultSchema: tableNames.defaultSchema, status: tableNames.status }
        : null,
    },
    selection: {
      requested: [...requested],
      programs: selected.map(({ id, program }) => ({
        id,
        projectPath: program.projectPath,
      })),
    },
    programs,
    members,
    files,
    procedures,
    calls,
    crud,
    dynamicSql,
    concatenatedSql,
    externalReferences,
    externalApis,
    totals: {
      programs: programs.length,
      perProgramSum: { ...perProgramSum, ...perProgramBreakdown },
      unique: {
        ...uniqueCounters,
        ...breakdownOf(uniqueProcedures),
        files: files.length,
        analyzedFiles: files.filter((f) => f.analysisStatus === 'analyzed')
          .length,
        sharedFiles: files.filter((f) => f.usedBy.length > 1).length,
        procedures: uniqueProcedures.length,
        procedureCodeLines: uniqueProcedures.reduce(
          (sum, p) => sum + p.codeLines,
          0,
        ),
        fileLevelCodeLines: files.reduce(
          (sum, f) => sum + (f.fileLevelCodeLines ?? 0),
          0,
        ),
      },
    },
    warnings,
  };
}
