import type {
  CodeFileAnalysis,
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

// Language-neutral inventory: per-file counters/procedures, programs from
// project files and coverage. Pure function over bytes already read by the
// workspace layer; it never touches the filesystem or calls AI.

export const SOURCE_INVENTORY_SCHEMA_VERSION = 'source-inventory-v1';

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
};

export type SourceInventory = {
  schemaVersion: typeof SOURCE_INVENTORY_SCHEMA_VERSION;
  profileId: string;
  languageId: string;
  metricVersion: string;
  decoderVersion: string;
  normalizationVersion: string;
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
}): SourceInventory {
  const { analyzer } = input.profile;
  const files = new Map<string, InventoryFile>();
  const projects: { path: string; lines: string[] }[] = [];

  for (const source of input.files) {
    if (files.has(source.relativePath))
      throw new Error(`Duplicate source path: ${source.relativePath}`);
    const role = analyzer.fileRole(source.relativePath);
    const override = input.encodingOverrides?.get(source.relativePath);
    const { entry, lines } = createManifestEntry({
      relativePath: source.relativePath,
      role,
      bytes: source.bytes,
      profileEncoding: input.profile.defaultEncoding,
      ...(override ? { override } : {}),
    });
    let analysis: CodeFileAnalysis | null = null;
    if (lines && role === 'code')
      analysis = analyzer.analyzeCodeFile(source.relativePath, lines.lines);
    if (lines && role === 'project')
      projects.push({ path: source.relativePath, lines: lines.lines });
    files.set(source.relativePath, { manifest: entry, analysis });
  }

  const byLowerPath = new Map<string, string[]>();
  for (const path of files.keys()) {
    const key = path.toLowerCase();
    byLowerPath.set(key, [...(byLowerPath.get(key) ?? []), path]);
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
    });
    const relative = analyzer.toRelativeMemberPath(member.declaredPath);
    if (relative === null) return unresolved('absolute-path');
    const baseDir = projectPath.split('/').slice(0, -1).join('/');
    const joined = joinRelative(baseDir, relative);
    if (joined === null) return unresolved('outside-root');
    const exact = files.get(joined);
    if (exact)
      return {
        ...member,
        relativePath: joined,
        resolution: 'resolved',
        fileStatus: memberFileStatus(exact),
      };
    // Legacy Windows projects often differ only in case from the real file.
    const candidates = byLowerPath.get(joined.toLowerCase()) ?? [];
    const [candidate] = candidates;
    if (candidates.length > 1) return unresolved('ambiguous');
    const file = candidate === undefined ? undefined : files.get(candidate);
    if (candidate === undefined || !file) return unresolved('missing');
    return {
      ...member,
      relativePath: candidate,
      resolution: 'case-mismatch',
      fileStatus: memberFileStatus(file),
    };
  }

  const programs = projects.map(({ path, lines }): InventoryProgram => {
    const parsed = analyzer.parseProjectFile(lines);
    if (parsed.status === 'unsupported')
      return {
        projectPath: path,
        status: 'unsupported',
        issue: { reason: parsed.reason, line: parsed.line },
        name: null,
        members: [],
        externalReferences: [],
        counters: zeroCounters(),
        complete: false,
      };
    const members = parsed.members.map((member) => resolveMember(path, member));
    const counters = zeroCounters();
    const counted = new Set<string>();
    for (const member of members) {
      if (!member.relativePath || counted.has(member.relativePath)) continue;
      counted.add(member.relativePath);
      const analysis = files.get(member.relativePath)?.analysis;
      if (analysis?.status === 'analyzed')
        addCounters(counters, analysis.counters);
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
    };
  });

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
