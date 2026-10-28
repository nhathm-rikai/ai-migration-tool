import type { SourceInventoryDocument } from '@portal/contracts';

// View model of one program's detail (F04): its member files, procedures
// with their LoC, CRUD as written and after table name mapping, calls and
// external dependencies. It only selects what the inventory states; a file
// or program that was not analyzed has `null` values, never 0, and nothing
// is summed across files, so shared modules are not counted twice.

type Inventory = SourceInventoryDocument;
type Program = Inventory['programs'][number];
type Member = Program['members'][number];
type Analysis = NonNullable<Program['analysis']>;
type InventoryFile = Inventory['files'][number];

export type CallResolution = Analysis['calls'][number]['resolution'];
export type SqlOperation = Analysis['crud'][number]['operations'][number];
export type CrudView = 'raw' | 'mapped';

export type MemberRow = {
  key: string;
  declaredPath: string;
  relativePath: string | null;
  kind: string;
  resolution: Member['resolution'];
  fileStatus: Member['fileStatus'];
  shared: boolean;
  // null: the file was not analyzed (missing, unsupported, decode error).
  codeLines: number | null;
  procedures: number | null;
  // Why an analyzed-looking code file was not analyzed.
  unsupportedReason: string | null;
};

export type ProcedureRow = {
  id: string;
  relativePath: string;
  kind: string;
  name: string;
  visibility: string;
  startLine: number;
  endLine: number;
  codeLines: number;
  decisionPoints: number;
  // Declared in a file other programs list too.
  shared: boolean;
};

export type CrudRow = {
  table: string;
  // Names written in the source merged into `table` (mapped view only).
  names: string[] | null;
  operations: SqlOperation[];
  evidence: { relativePath: string; line: number };
  viaSharedOnly: boolean;
};

export type CallRow = {
  key: string;
  from: string;
  name: string;
  resolution: CallResolution;
  targets: string[];
  line: number;
  count: number;
};

export type ComplexityValue = {
  score: number;
  level: Analysis['complexity']['level'];
  version: string;
};

export type ProgramDetail = {
  key: string;
  name: string | null;
  projectPath: string;
  issue: Program['issue'];
  complete: boolean;
  members: MemberRow[];
  // null: the program was not analyzed.
  analysis: {
    ownCodeLines: number;
    codeLines: number;
    ownProcedures: number;
    procedures: ProcedureRow[];
    rawCrud: CrudRow[];
    // null: inventory written before table name mapping; the view falls
    // back to the names as written.
    mappedCrud: CrudRow[] | null;
    calls: CallRow[];
    externalApis: Analysis['externalApis'];
    complexity: ComplexityValue;
    mappedComplexity: ComplexityValue | null;
  } | null;
  externalReferences: Program['externalReferences'];
  tableNames: Inventory['tableNames'] | null;
};

function analyzedFile(file: InventoryFile | undefined) {
  return file?.analysis?.status === 'analyzed' ? file.analysis : null;
}

function memberRow(
  member: Member,
  index: number,
  files: ReadonlyMap<string, InventoryFile>,
): MemberRow {
  const file = member.relativePath ? files.get(member.relativePath) : undefined;
  const analysis = analyzedFile(file);
  return {
    key: `${index}:${member.declaredPath}`,
    declaredPath: member.declaredPath,
    relativePath: member.relativePath,
    kind: member.kind,
    resolution: member.resolution,
    fileStatus: member.fileStatus,
    shared: member.shared,
    codeLines: analysis ? analysis.counters.codeLines : null,
    procedures: analysis ? analysis.procedures.length : null,
    unsupportedReason:
      file?.analysis?.status === 'unsupported' ? file.analysis.reason : null,
  };
}

function complexityValue(complexity: Analysis['complexity']): ComplexityValue {
  return {
    score: complexity.score,
    level: complexity.level,
    version: complexity.version,
  };
}

const crudRow = (
  entry: Analysis['crud'][number],
  names: string[] | null,
): CrudRow => ({
  table: entry.table,
  names,
  operations: entry.operations,
  evidence: entry.evidence,
  viaSharedOnly: entry.viaSharedOnly,
});

export function programDetail(
  inventory: Inventory,
  projectPath: string,
): ProgramDetail | null {
  const program = inventory.programs.find(
    (candidate) => candidate.projectPath === projectPath,
  );
  if (!program) return null;
  const files = new Map(
    inventory.files.map((file) => [file.manifest.relativePath, file]),
  );
  const members = program.members.map((member, index) =>
    memberRow(member, index, files),
  );
  const analysis = program.analysis;

  // Each analyzed member file once, in declaration order.
  const procedures: ProcedureRow[] = [];
  const seen = new Set<string>();
  for (const member of program.members) {
    const path = member.relativePath;
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const fileAnalysis = analyzedFile(files.get(path));
    if (!fileAnalysis) continue;
    for (const procedure of fileAnalysis.procedures)
      procedures.push({
        id: procedure.id,
        relativePath: path,
        kind: procedure.kind,
        name: procedure.name,
        visibility: procedure.visibility,
        startLine: procedure.startLine,
        endLine: procedure.endLine,
        codeLines: procedure.codeLines,
        decisionPoints: procedure.decisionPoints,
        shared: member.shared,
      });
  }

  return {
    key: program.projectPath,
    name: program.name,
    projectPath: program.projectPath,
    issue: program.issue,
    complete: program.complete,
    members,
    analysis: analysis
      ? {
          ownCodeLines: analysis.metrics.ownCodeLines,
          codeLines: program.counters.codeLines,
          ownProcedures: analysis.metrics.ownProcedures,
          procedures,
          rawCrud: analysis.crud.map((entry) => crudRow(entry, null)),
          mappedCrud: analysis.normalizedCrud
            ? analysis.normalizedCrud.map((entry) =>
                crudRow(entry, entry.names),
              )
            : null,
          calls: analysis.calls.map((call, index) => ({
            key: `${index}:${call.from}:${call.name}`,
            from: call.from,
            name: call.name,
            resolution: call.resolution,
            targets: call.targets,
            line: call.line,
            count: call.count,
          })),
          externalApis: analysis.externalApis,
          complexity: complexityValue(analysis.complexity),
          mappedComplexity: analysis.normalizedComplexity
            ? complexityValue(analysis.normalizedComplexity)
            : null,
        }
      : null,
    externalReferences: program.externalReferences,
    tableNames: inventory.tableNames ?? null,
  };
}

// The CRUD rows of the chosen view; the mapped view falls back to the names
// as written when the inventory has none (`fallback` says so).
export function crudRows(
  detail: NonNullable<ProgramDetail['analysis']>,
  view: CrudView,
): { rows: CrudRow[]; shown: CrudView; fallback: boolean } {
  if (view === 'mapped' && detail.mappedCrud)
    return { rows: detail.mappedCrud, shown: 'mapped', fallback: false };
  return { rows: detail.rawCrud, shown: 'raw', fallback: view === 'mapped' };
}
