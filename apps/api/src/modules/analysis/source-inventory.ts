import { SOURCE_INVENTORY_SCHEMA_VERSION } from '@portal/contracts';
import type {
  CodeFileAnalysis,
  CodeReference,
  SourceFileRole,
  LineCounters,
  ProjectExternalReference,
  ProjectMember,
} from './language-analyzer.js';
import {
  computeSnapshotHash,
  createManifestEntry,
  type ManifestEntry,
} from './source-manifest.js';
import {
  SOURCE_DECODER_VERSION,
  type ProfileEncoding,
} from './source-decoder.js';
import { SOURCE_NORMALIZATION_VERSION } from './source-text.js';
import type { SourceProfile } from './source-profiles.js';
import {
  analyzeProgram,
  CALL_GRAPH_VERSION,
  callableNames,
  COMPLEXITY_VERSION,
  type ProgramAnalysis,
  type ProgramFile,
} from './program-analysis.js';
import { SQL_ACCESS_VERSION } from './sql-access.js';
import {
  UNCONFIGURED_TABLE_NAMES,
  type TableNameMapping,
} from './table-names.js';

// Language-neutral inventory: per-file counters/procedures, programs from
// project files and coverage. Pure function over bytes already read by the
// workspace layer; it never touches the filesystem or calls AI.

export { SOURCE_INVENTORY_SCHEMA_VERSION };

export type InventoryFile = {
  manifest: ManifestEntry;
  analysis: CodeFileAnalysis | null;
};

export type MemberResolution =
  | 'resolved'
  | 'case-mismatch'
  | 'ambiguous'
  | 'missing'
  | 'outside-root'
  | 'absolute-path';

export type MemberFileStatus = 'analyzed' | 'unsupported' | 'error' | 'other';

export type InventoryProgramMember = ProjectMember & {
  relativePath: string | null;
  resolution: MemberResolution;
  fileStatus: MemberFileStatus | null;
  // Listed by more than one program (e.g. a common module); its LoC is not
  // the program's own.
  shared: boolean;
};

export type InventoryProgram = {
  projectPath: string;
  // unsupported: the project file itself could not be parsed (reason/line).
  status: 'parsed' | 'unsupported';
  issue: { reason: string; line: number | null } | null;
  name: string | null;
  members: InventoryProgramMember[];
  externalReferences: ProjectExternalReference[];
  // Per-program sums over distinct analyzed member files; shared modules are
  // counted in every program that lists them.
  counters: LineCounters;
  // True only when the project parsed, every member resolved to an analyzed
  // file and no line was left unclassified.
  complete: boolean;
  // Call graph, CRUD, metrics and draft complexity; null when not parsed.
  analysis: ProgramAnalysis | null;
};

export type SourceInventory = {
  schemaVersion: typeof SOURCE_INVENTORY_SCHEMA_VERSION;
  profileId: string;
  languageId: string;
  metricVersion: string;
  decoderVersion: string;
  normalizationVersion: string;
  sqlAccessVersion: string;
  callGraphVersion: string;
  complexityVersion: string;
  // How table names were merged for `normalizedCrud`, so the view can be
  // reproduced; an assumption unless `status` is confirmed.
  tableNames: TableNameMapping;
  snapshotHash: string;
  files: InventoryFile[];
  programs: InventoryProgram[];
  totals: {
    files: number;
    codeFiles: number;
    analyzedCodeFiles: number;
    unsupportedFiles: number;
    errorFiles: number;
    // Each analyzed code file counted once across the corpus.
    uniqueCounters: LineCounters;
  };
};

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

function addCounters(target: LineCounters, source: LineCounters): void {
  for (const key of Object.keys(target) as (keyof LineCounters)[])
    target[key] += source[key];
}

function joinRelative(baseDir: string, path: string): string | null {
  const segments = baseDir === '' ? [] : baseDir.split('/');
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (segments.length === 0) return null;
      segments.pop();
    } else segments.push(segment);
  }
  return segments.join('/');
}

function memberFileStatus(file: InventoryFile): MemberFileStatus {
  if (file.manifest.kind === 'error') return 'error';
  if (file.manifest.role === 'unsupported') return 'unsupported';
  if (file.analysis) return file.analysis.status;
  return 'other';
}

export function buildSourceInventory(input: {
  profile: SourceProfile;
  files: readonly { relativePath: string; bytes: Uint8Array }[];
  encodingOverrides?: ReadonlyMap<string, ProfileEncoding>;
  tableNames?: TableNameMapping;
}): SourceInventory {
  const tableNames = input.tableNames ?? UNCONFIGURED_TABLE_NAMES;
  const { analyzer } = input.profile;
  const sources = new Map<string, Uint8Array>();
  const byLowerPath = new Map<string, string[]>();
  for (const source of input.files) {
    if (sources.has(source.relativePath))
      throw new Error(`Duplicate source path: ${source.relativePath}`);
    sources.set(source.relativePath, source.bytes);
    const key = source.relativePath.toLowerCase();
    byLowerPath.set(key, [
      ...(byLowerPath.get(key) ?? []),
      source.relativePath,
    ]);
  }

  const files = new Map<string, InventoryFile>();
  const codeLines = new Map<string, string[]>();
  function addFile(relativePath: string, role: SourceFileRole) {
    const override = input.encodingOverrides?.get(relativePath);
    const result = createManifestEntry({
      relativePath,
      role,
      bytes: sources.get(relativePath) ?? new Uint8Array(),
      profileEncoding: input.profile.defaultEncoding,
      ...(override ? { override } : {}),
    });
    const analysis =
      result.lines && role === 'code'
        ? analyzer.analyzeCodeFile(relativePath, result.lines.lines)
        : null;
    files.set(relativePath, { manifest: result.entry, analysis });
    if (analysis?.status === 'analyzed' && result.lines)
      codeLines.set(relativePath, result.lines.lines);
    return result.lines;
  }

  function resolveMember(
    projectPath: string,
    member: ProjectMember,
  ): InventoryProgramMember {
    const unresolved = (resolution: MemberResolution) => ({
      ...member,
      relativePath: null,
      resolution,
      fileStatus: null,
      shared: false,
    });
    const relative = analyzer.toRelativeMemberPath(member.declaredPath);
    if (relative === null) return unresolved('absolute-path');
    const baseDir = projectPath.split('/').slice(0, -1).join('/');
    const joined = joinRelative(baseDir, relative);
    if (joined === null) return unresolved('outside-root');
    if (sources.has(joined))
      return {
        ...member,
        relativePath: joined,
        resolution: 'resolved',
        fileStatus: null,
        shared: false,
      };
    // Legacy Windows projects often differ only in case from the real file.
    const candidates = byLowerPath.get(joined.toLowerCase()) ?? [];
    if (candidates.length > 1) return unresolved('ambiguous');
    const [candidate] = candidates;
    if (candidate === undefined) return unresolved('missing');
    return {
      ...member,
      relativePath: candidate,
      resolution: 'case-mismatch',
      fileStatus: null,
      shared: false,
    };
  }

  // Projects first: a file the project declares as code (e.g. a module kept
  // as .TXT) is analyzed as code even if its extension is not allowlisted.
  const parsedProjects = [...sources.keys()]
    .filter((path) => analyzer.fileRole(path) === 'project')
    .map((path) => {
      const lines = addFile(path, 'project');
      const parsed = lines ? analyzer.parseProjectFile(lines.lines) : null;
      return {
        path,
        parsed,
        members:
          parsed?.status === 'parsed'
            ? parsed.members.map((member) => resolveMember(path, member))
            : [],
      };
    });
  const declaredCode = new Set(
    parsedProjects.flatMap(({ members }) =>
      members
        .filter(
          (member) =>
            member.relativePath !== null &&
            analyzer.roleForProjectMember(member.kind) === 'code',
        )
        .map((member) => member.relativePath ?? ''),
    ),
  );
  for (const path of sources.keys()) {
    if (files.has(path)) continue;
    const role = analyzer.fileRole(path);
    addFile(
      path,
      role === 'excluded' && declaredCode.has(path) ? 'code' : role,
    );
  }

  const programCount = new Map<string, number>();
  for (const { members } of parsedProjects)
    for (const path of new Set(members.map((member) => member.relativePath)))
      if (path !== null)
        programCount.set(path, (programCount.get(path) ?? 0) + 1);

  // Each code file is scanned once for uses of any callable name.
  const analyzedFiles = [...files.values()].flatMap((file) =>
    file.analysis?.status === 'analyzed' ? [file.analysis] : [],
  );
  const names = callableNames(analyzedFiles);
  const references = new Map<string, CodeReference[]>();
  for (const [path, lines] of codeLines)
    references.set(path, analyzer.findReferences(path, lines, names));

  const programs = parsedProjects.map(
    ({ path, parsed, members: resolved }): InventoryProgram => {
      if (parsed?.status !== 'parsed')
        return {
          projectPath: path,
          status: 'unsupported',
          issue: parsed
            ? { reason: parsed.reason, line: parsed.line }
            : { reason: 'PROJECT_NOT_DECODED', line: null },
          name: null,
          members: [],
          externalReferences: [],
          counters: zeroCounters(),
          complete: false,
          analysis: null,
        };
      const members = resolved.map((member) => {
        const file = member.relativePath
          ? files.get(member.relativePath)
          : undefined;
        return {
          ...member,
          fileStatus: file ? memberFileStatus(file) : null,
          shared: (programCount.get(member.relativePath ?? '') ?? 0) > 1,
        };
      });
      const programFiles: ProgramFile[] = [];
      const counters = zeroCounters();
      const counted = new Set<string>();
      for (const member of members) {
        if (!member.relativePath || counted.has(member.relativePath)) continue;
        counted.add(member.relativePath);
        const analysis = files.get(member.relativePath)?.analysis;
        if (analysis?.status !== 'analyzed') continue;
        addCounters(counters, analysis.counters);
        programFiles.push({
          relativePath: member.relativePath,
          shared: member.shared,
          analysis,
          references: references.get(member.relativePath) ?? [],
        });
      }
      return {
        projectPath: path,
        status: 'parsed',
        issue: null,
        name: parsed.name,
        members,
        externalReferences: parsed.externalReferences,
        counters,
        complete:
          members.every((member) => member.fileStatus === 'analyzed') &&
          counters.unclassifiedLines === 0,
        analysis: analyzeProgram(
          programFiles,
          parsed.externalReferences,
          tableNames,
        ),
      };
    },
  );

  const inventoryFiles = [...files.values()];
  const uniqueCounters = zeroCounters();
  for (const file of inventoryFiles)
    if (file.analysis?.status === 'analyzed')
      addCounters(uniqueCounters, file.analysis.counters);

  const entries = inventoryFiles.map((file) => file.manifest);
  return {
    schemaVersion: SOURCE_INVENTORY_SCHEMA_VERSION,
    profileId: input.profile.id,
    languageId: analyzer.languageId,
    metricVersion: analyzer.metricVersion,
    decoderVersion: SOURCE_DECODER_VERSION,
    normalizationVersion: SOURCE_NORMALIZATION_VERSION,
    sqlAccessVersion: SQL_ACCESS_VERSION,
    callGraphVersion: CALL_GRAPH_VERSION,
    complexityVersion: COMPLEXITY_VERSION,
    tableNames,
    snapshotHash: computeSnapshotHash(entries, input.profile.id),
    files: inventoryFiles,
    programs,
    totals: {
      files: entries.length,
      codeFiles: entries.filter((entry) => entry.role === 'code').length,
      analyzedCodeFiles: inventoryFiles.filter(
        (file) => file.analysis?.status === 'analyzed',
      ).length,
      unsupportedFiles:
        inventoryFiles.filter(
          (file) =>
            file.manifest.role === 'unsupported' ||
            file.analysis?.status === 'unsupported',
        ).length +
        programs.filter((program) => program.status === 'unsupported').length,
      errorFiles: entries.filter((entry) => entry.kind === 'error').length,
      uniqueCounters,
    },
  };
}
