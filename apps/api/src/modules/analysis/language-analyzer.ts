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
  startLine: number;
  endLine: number;
  codeLines: number;
};

export type CodeFileAnalysis =
  | {
      status: 'analyzed';
      counters: LineCounters;
      procedures: ProcedureMetrics[];
      fileLevelCodeLines: number;
    }
  | { status: 'unsupported'; reason: string; line: number | null };

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
    }
  | { status: 'unsupported'; reason: string; line: number | null };

export interface LanguageAnalyzer {
  readonly languageId: string;
  readonly metricVersion: string;
  fileRole(relativePath: string): SourceFileRole;
  analyzeCodeFile(relativePath: string, lines: string[]): CodeFileAnalysis;
  parseProjectFile(lines: string[]): ProjectFileAnalysis;
  // Converts a declared member path to a POSIX path relative to the project
  // file directory; null when it is absolute or otherwise not resolvable.
  toRelativeMemberPath(declaredPath: string): string | null;
}
