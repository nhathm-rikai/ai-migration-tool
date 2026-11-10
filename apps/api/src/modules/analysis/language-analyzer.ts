import type { DynamicSqlUse, SqlTableAccess, SqlUse } from './sql-access.js';

// Boundary between the language-neutral pipeline (decode, lines, manifest,
// inventory) and one legacy language. Adding a language means adding one
// analyzer + fixtures; the pipeline and inventory shape stay the same.

// code: parsed and counted; project: parsed for members, no LoC;
// resource: binary, hashed only; unsupported: a source type of this language
// not handled yet (counts against coverage); excluded: not source.
export type SourceFileRole =
  'code' | 'project' | 'resource' | 'unsupported' | 'excluded';

// Mutually exclusive classes; they sum to physicalLines.
export type LineCounters = {
  physicalLines: number;
  designerLines: number;
  metadataLines: number;
  blankLines: number;
  commentOnlyLines: number;
  codeLines: number;
  unclassifiedLines: number;
};

export type ProcedureMetrics = {
  id: string;
  kind: string;
  name: string;
  // global: callable unqualified from any file of the program (e.g. a public
  // procedure of a standard module); public: only through its object (e.g.
  // Form1.Foo); private: only inside its own file.
  visibility: 'global' | 'public' | 'private';
  startLine: number;
  endLine: number;
  // Line breakdown of startLine..endLine (procedureLinesVersion, see
  // specs/source-analysis.md §4.1). physicalLines = codeLines +
  // commentOnlyLines + blankLines + metadataLines + unclassifiedLines.
  // executableLines and sqlLines are not classes of their own: both are
  // subsets of codeLines and may overlap.
  physicalLines: number;
  codeLines: number;
  executableLines: number;
  commentOnlyLines: number;
  blankLines: number;
  metadataLines: number;
  unclassifiedLines: number;
  sqlLines: number;
  // Branch statements (If/ElseIf/Case/For/Do/While...), a size-independent
  // input for complexity.
  decisionPoints: number;
};

// Facts are attributed to a procedure ID, or null at file level.
export type SqlTableFact = SqlTableAccess & { procedureId: string | null };
export type DynamicSqlFact = DynamicSqlUse & { procedureId: string | null };
export type SqlUseFact = SqlUse & { procedureId: string | null };

// A procedure imported from a native library (e.g. a Win32 API Declare).
export type ExternalDeclaration = {
  name: string;
  library: string;
  visibility: 'global' | 'private';
  line: number;
};

export type SourceLabel = { name: string; line: number };

export type CodeReference = {
  procedureId: string | null;
  name: string;
  line: number;
};

export type CodeFileAnalysis =
  | {
      status: 'analyzed';
      counters: LineCounters;
      procedures: ProcedureMetrics[];
      fileLevelCodeLines: number;
      sqlTables: SqlTableFact[];
      dynamicSql: DynamicSqlFact[];
      // One per SQL text with runtime values concatenated outside the table
      // name, and one per SQL text using bind parameters.
      concatenatedSql: SqlUseFact[];
      parameterizedSql: SqlUseFact[];
      externalDeclarations: ExternalDeclaration[];
      labels: SourceLabel[];
    }
  | { status: 'unsupported'; reason: string; line: number | null };

// A lexical hint that code can produce a report (screen-report-v1).
// `crystal` names the .rpt file; the others are suspected outputs.
export type ReportSignalKind = 'crystal' | 'excel' | 'print' | 'file-output';
export type ReportSignal = {
  kind: ReportSignalKind;
  name: string;
  line: number;
  // crystal only: the design file path as written, with "/" separators and
  // no leading "./". `absolute` paths (drive, UNC, root) cannot be resolved
  // against the source tree, so `name` is then the file name alone.
  path?: string;
  absolute?: boolean;
  // file-output only: a .csv path.
  subkind?: 'csv';
  // file-output only: the word that says the file is a log or a temporary
  // file, not a report output (the function is listed but not counted).
  excludeReason?: string;
};

// What a project reference says about reports, by runtime component.
// Names the report kind it should produce.
export type ReportRuntime = 'crystal' | 'data-report';

export type ProjectMember = {
  kind: string;
  name: string | null;
  // Exactly as written in the project file, relative to that file.
  declaredPath: string;
};

export type ProjectExternalReference = {
  kind: 'reference' | 'component';
  identifier: string;
  fileName: string | null;
  description: string | null;
};

export type ProjectFileAnalysis =
  | {
      status: 'parsed';
      name: string | null;
      members: ProjectMember[];
      externalReferences: ProjectExternalReference[];
      // Startup object as written (e.g. "Sub Main"); absent when not set.
      startup?: string;
    }
  | { status: 'unsupported'; reason: string; line: number | null };

export interface LanguageAnalyzer {
  readonly languageId: string;
  readonly metricVersion: string;
  // Per-procedure line breakdown, including which lines write SQL.
  readonly procedureLinesVersion: string;
  fileRole(relativePath: string): SourceFileRole;
  analyzeCodeFile(relativePath: string, lines: string[]): CodeFileAnalysis;
  // Identifier uses of `names` (lower case) per procedure, for call graphs.
  findReferences(
    relativePath: string,
    lines: string[],
    names: ReadonlySet<string>,
  ): CodeReference[];
  parseProjectFile(lines: string[]): ProjectFileAnalysis;
  // A procedure of this file the runtime calls on an event (e.g. a form's
  // Command1_Click), not one the program calls itself.
  isEventHandler(relativePath: string, procedureName: string): boolean;
  // Member kinds that are one screen each (forms, user documents).
  isScreenMemberKind(kind: string): boolean;
  // True when the startup object is a Sub Main style entry (no UI).
  isBatchStartup(startup: string | undefined): boolean;
  // Output hints in one analyzed code file (outside designer sections).
  findReportSignals(relativePath: string, lines: string[]): ReportSignal[];
  // Header of a designer member file that is a report; null otherwise.
  detectReportDesigner(lines: string[]): { line: number; name: string } | null;
  // Report runtime a reference/OCX belongs to, or null.
  reportRuntimeOf(reference: ProjectExternalReference): ReportRuntime | null;
  // Extension of the design file of a `crystal` report, e.g. ".rpt".
  readonly crystalFileExtension: string;
  // Role a file gets when a project declares it as a member of this kind,
  // or null to keep the role from its extension.
  roleForProjectMember(kind: string): SourceFileRole | null;
  // Converts a declared member path to a POSIX path relative to the project
  // file directory; null when it is absolute or otherwise not resolvable.
  toRelativeMemberPath(declaredPath: string): string | null;
}
