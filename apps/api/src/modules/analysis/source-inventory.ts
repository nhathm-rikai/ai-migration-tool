import { SOURCE_INVENTORY_SCHEMA_VERSION } from '@portal/contracts';
import type {
  CodeFileAnalysis,
  CodeReference,
  OutputOperation,
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
  decodeSourceBytes,
  SOURCE_DECODER_VERSION,
  type ProfileEncoding,
} from './source-decoder.js';
import {
  SOURCE_NORMALIZATION_VERSION,
  splitSourceLines,
} from './source-text.js';
import {
  buildCodeFileReportRows,
  buildProgramScreenReport,
  buildScreenReportTotals,
  scoreProjectReports,
  designerReportRow,
  REPORT_COMPLEXITY_VERSION,
  SCREEN_REPORT_VERSION,
  type ProcedureFacts,
  type ProgramContext,
  type ProgramReport,
  type ReportDraft,
  type ProgramScreen,
  type ProgramType,
  type FileReport,
  type ScreenReportTotals,
} from './screen-report.js';
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
import { buildUtChecklist } from './ut-checklist.js';
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
  // ut-checklist-v1: number of checklist items; absent when not parsed.
  utPoints?: number;
  // screen-report-v1; absent when the project is unsupported.
  programType?: ProgramType;
  screens?: ProgramScreen[];
  reports?: ProgramReport[];
};

export type SourceInventory = {
  schemaVersion: typeof SOURCE_INVENTORY_SCHEMA_VERSION;
  profileId: string;
  languageId: string;
  metricVersion: string;
  procedureLinesVersion: string;
  decoderVersion: string;
  normalizationVersion: string;
  sqlAccessVersion: string;
  callGraphVersion: string;
  complexityVersion: string;
  screenReportVersion: string;
  reportComplexityVersion: string;
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
    screenReport: ScreenReportTotals;
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

// Root-relative paths a project file declares as code (e.g. a module kept
// as .TXT), as written: callers match them case-insensitively, like member
// resolution does. Absolute or out-of-root members are left out.
export function declaredCodeMemberPaths(
  profile: SourceProfile,
  projectPath: string,
  lines: string[],
): string[] {
  const { analyzer } = profile;
  const parsed = analyzer.parseProjectFile(lines);
  if (parsed.status !== 'parsed') return [];
  const baseDir = projectPath.split('/').slice(0, -1).join('/');
  return parsed.members.flatMap((member) => {
    if (analyzer.roleForProjectMember(member.kind) !== 'code') return [];
    const relative = analyzer.toRelativeMemberPath(member.declaredPath);
    const joined = relative === null ? null : joinRelative(baseDir, relative);
    return joined === null ? [] : [joined];
  });
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
  // Paths of files seen in the source but not loaded (e.g. excluded types
  // such as Crystal .rpt): only their names are used, to tell whether the
  // design file of a report exists.
  knownPaths?: readonly string[];
  // Called once per file when its own work is done (PF08): after decoding
  // for a file that is not analyzed code, after the cross-file reference
  // scan (the expensive part) for analyzed code.
  onFile?: (relativePath: string) => void;
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
    const first = !files.has(relativePath);
    files.set(relativePath, { manifest: result.entry, analysis });
    if (analysis?.status === 'analyzed' && result.lines)
      codeLines.set(relativePath, result.lines.lines);
    else if (first) input.onFile?.(relativePath);
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
  for (const [path, lines] of codeLines) {
    references.set(path, analyzer.findReferences(path, lines, names));
    input.onFile?.(path);
  }

  // Report rows per file: code signals, and designer members (.dsr).
  // Files of the source (and names of files seen but not loaded), lower
  // case: a report design file counts as found only where its path resolves,
  // from the project folder or from the source root.
  const knownFiles = new Set(
    [...sources.keys(), ...(input.knownPaths ?? [])].map((path) =>
      path.toLowerCase(),
    ),
  );
  const designExists = (projectPath: string, written: string) => {
    const baseDir = projectPath.split('/').slice(0, -1).join('/');
    return [joinRelative(baseDir, written), joinRelative('', written)].some(
      (path) => path !== null && knownFiles.has(path.toLowerCase()),
    );
  };
  // What a report score reads from any procedure of the source (AR06): its
  // size, tables, SQL places and print / draw statements. A report is scored
  // over the procedures it calls, which may be in other files.
  const procedureFacts = new Map<string, ProcedureFacts>();
  for (const [path, lines] of codeLines) {
    const analysis = files.get(path)?.analysis;
    if (analysis?.status !== 'analyzed') continue;
    const byProcedure = <T extends { procedureId: string | null }>(
      list: readonly T[],
    ) => {
      const grouped = new Map<string, T[]>();
      for (const item of list)
        if (item.procedureId !== null)
          grouped.set(item.procedureId, [
            ...(grouped.get(item.procedureId) ?? []),
            item,
          ]);
      return grouped;
    };
    const tables = byProcedure(analysis.sqlTables);
    const dynamic = byProcedure(analysis.dynamicSql);
    const concatenated = byProcedure(analysis.concatenatedSql);
    const operations = new Map<string, OutputOperation[]>();
    for (const operation of analyzer.findOutputOperations(path, lines)) {
      const owner = analysis.procedures.find(
        (procedure) =>
          procedure.startLine <= operation.line &&
          operation.line <= procedure.endLine,
      );
      if (owner)
        operations.set(owner.id, [
          ...(operations.get(owner.id) ?? []),
          operation,
        ]);
    }
    for (const procedure of analysis.procedures) {
      const own = operations.get(procedure.id) ?? [];
      const count = (group: OutputOperation['group']) =>
        own.filter((operation) => operation.group === group).length;
      procedureFacts.set(procedure.id, {
        decisionPoints: procedure.decisionPoints,
        executableLines: procedure.executableLines,
        tables: (tables.get(procedure.id) ?? []).map((access) =>
          access.table.toLowerCase(),
        ),
        dynamicSql: [
          ...(dynamic.get(procedure.id) ?? []),
          ...(concatenated.get(procedure.id) ?? []),
        ].map((use) => `${path}:${use.line}`),
        printOps: {
          content: count('content'),
          drawing: count('drawing'),
          position: count('position'),
        },
        dynamicCalls: count('dynamic-call'),
      });
    }
  }
  const rowsByFile = new Map<string, FileReport[]>();
  for (const [path, lines] of codeLines) {
    const analysis = files.get(path)?.analysis;
    if (analysis?.status !== 'analyzed') continue;
    rowsByFile.set(
      path,
      buildCodeFileReportRows({
        analyzer,
        relativePath: path,
        lines,
        analysis,
      }),
    );
  }
  for (const { members } of parsedProjects)
    for (const member of members) {
      const path = member.relativePath;
      if (member.kind !== 'designer' || path === null || rowsByFile.has(path))
        continue;
      const bytes = sources.get(path);
      const decoded = bytes
        ? decodeSourceBytes(bytes, {
            profileEncoding: input.profile.defaultEncoding,
          })
        : null;
      const header = decoded?.ok
        ? analyzer.detectReportDesigner(splitSourceLines(decoded.text).lines)
        : null;
      rowsByFile.set(path, header ? [designerReportRow(path, header)] : []);
    }

  // Report rows of each parsed program, not scored yet: a report is scored
  // over the whole project (a template used in several programs once), see
  // scoreProjectReports.
  const pending: {
    program: InventoryProgram;
    context: ProgramContext;
    drafts: (ReportDraft & { shared: boolean })[];
  }[] = [];
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
      const baseDir = path.split('/').slice(0, -1).join('/');
      const analysis = analyzeProgram(
        programFiles,
        parsed.externalReferences,
        tableNames,
      );
      // Procedures this program resolves from a procedure (call graph of the
      // program, not names of the whole corpus).
      const resolvedCalls = new Map<string, Set<string>>();
      // Calls that stay unresolved here: the name matches several procedures
      // or a native library one. Not followed, only counted.
      const unresolvedCalls = new Map<string, number>();
      for (const call of analysis.calls) {
        if (call.resolution === 'ambiguous' || call.resolution === 'external') {
          unresolvedCalls.set(
            call.from,
            (unresolvedCalls.get(call.from) ?? 0) + 1,
          );
          continue;
        }
        const targets = resolvedCalls.get(call.from) ?? new Set<string>();
        for (const target of call.targets)
          if (target !== call.from) targets.add(target);
        resolvedCalls.set(call.from, targets);
      }
      const screenReport = buildProgramScreenReport({
        analyzer,
        projectPath: path,
        startup: parsed.startup,
        externalReferences: parsed.externalReferences,
        rowsByFile,
        context: {
          designExists,
          factsOf: (procedureId) => procedureFacts.get(procedureId),
          calleesOf: (procedureId) => [
            ...(resolvedCalls.get(procedureId) ?? []),
          ],
          unresolvedCallsOf: (procedureId) =>
            unresolvedCalls.get(procedureId) ?? 0,
        },
        members: members.map((member) => {
          const relative = analyzer.toRelativeMemberPath(member.declaredPath);
          const joined =
            relative === null ? null : joinRelative(baseDir, relative);
          return {
            ...member,
            displayPath: member.relativePath ?? joined ?? member.declaredPath,
          };
        }),
      });
      const program: InventoryProgram = {
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
        analysis,
        programType: screenReport.programType,
        screens: screenReport.screens,
        reports: [],
      };
      pending.push({
        program,
        context: screenReport.context,
        drafts: screenReport.drafts,
      });
      return program;
    },
  );
  scoreProjectReports(pending).forEach((reports, index) => {
    const entry = pending[index];
    if (entry) entry.program.reports = reports;
  });

  const inventoryFiles = [...files.values()];
  // TC01: size of each program's unit test checklist (step 2 shows it).
  const withChecklist = programs.map((program) =>
    program.status === 'parsed'
      ? {
          ...program,
          utPoints: buildUtChecklist(
            { files: inventoryFiles, programs, profileId: input.profile.id },
            program.projectPath,
          ).items.length,
        }
      : program,
  );
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
    procedureLinesVersion: analyzer.procedureLinesVersion,
    decoderVersion: SOURCE_DECODER_VERSION,
    normalizationVersion: SOURCE_NORMALIZATION_VERSION,
    sqlAccessVersion: SQL_ACCESS_VERSION,
    callGraphVersion: CALL_GRAPH_VERSION,
    complexityVersion: COMPLEXITY_VERSION,
    screenReportVersion: SCREEN_REPORT_VERSION,
    reportComplexityVersion: REPORT_COMPLEXITY_VERSION,
    tableNames,
    snapshotHash: computeSnapshotHash(entries, input.profile.id),
    files: inventoryFiles,
    programs: withChecklist,
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
      screenReport: buildScreenReportTotals(
        programs.flatMap((program) =>
          program.programType === undefined
            ? []
            : [
                {
                  program: program.projectPath,
                  programType: program.programType,
                  screens: program.screens ?? [],
                  reports: program.reports ?? [],
                },
              ],
        ),
      ),
    },
  };
}
