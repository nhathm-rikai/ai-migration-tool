import type { LanguageAnalyzer, SourceFileRole } from '../language-analyzer.js';
import {
  analyzeVb6CodeFile,
  findVb6References,
  type Vb6ModuleKind,
} from './vb6-code-file.js';
import { findVb6OutputOperations } from './vb6-output-operations.js';
import { parseVb6ProjectFile } from './vb6-project-file.js';
import {
  detectVb6ReportDesigner,
  findVb6ReportSignals,
} from './vb6-report-signals.js';

// v1 text allowlist is .bas/.frm/.cls/.vbp; other VB6 source types are
// reported unsupported until fixtures/parser tests exist.
const ROLES: Record<string, SourceFileRole> = {
  '.bas': 'code',
  '.frm': 'code',
  '.cls': 'code',
  '.vbp': 'project',
  '.frx': 'resource',
  '.ctl': 'unsupported',
  '.ctx': 'unsupported',
  '.dsr': 'unsupported',
  '.pag': 'unsupported',
  '.dob': 'unsupported',
  '.vbg': 'unsupported',
};

function extension(relativePath: string): string {
  const name = relativePath.split('/').at(-1) ?? '';
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

// Code files that are not a form or class (including project members with
// another extension) are standard modules.
function moduleKind(relativePath: string): Vb6ModuleKind {
  const ext = extension(relativePath);
  return ext === '.frm' ? 'form' : ext === '.cls' ? 'class' : 'standard';
}

export const vb6Analyzer: LanguageAnalyzer = {
  languageId: 'vb6',
  metricVersion: 'vb6-physical-code-v1',
  procedureLinesVersion: 'vb6-procedure-lines-v1',
  fileRole: (relativePath) => ROLES[extension(relativePath)] ?? 'excluded',
  analyzeCodeFile: (relativePath, lines) =>
    analyzeVb6CodeFile(relativePath, lines, {
      module: moduleKind(relativePath),
    }),
  findReferences: (relativePath, lines, names) =>
    findVb6References(relativePath, lines, {
      module: moduleKind(relativePath),
      names,
    }),
  parseProjectFile: parseVb6ProjectFile,
  // Object modules (forms, classes, controls): `<control>_<Event>`.
  isEventHandler: (relativePath, procedureName) =>
    moduleKind(relativePath) !== 'standard' &&
    /^[A-Za-z_]\w*_[A-Za-z]\w*$/.test(procedureName),
  isScreenMemberKind: (kind) => kind === 'form' || kind === 'user-document',
  isBatchStartup: (startup) =>
    startup !== undefined && /^sub\s+main$/i.test(startup.trim()),
  findReportSignals: (relativePath, lines) =>
    findVb6ReportSignals(lines, { module: moduleKind(relativePath) }),
  findOutputOperations: (relativePath, lines) =>
    findVb6OutputOperations(lines, { module: moduleKind(relativePath) }),
  detectReportDesigner: detectVb6ReportDesigner,
  reportRuntimeOf(reference) {
    const text = `${reference.fileName ?? ''} ${reference.description ?? ''}`;
    if (/crystl32|craxdrt|crviewer|crystal\s+reports?/i.test(text))
      return 'crystal';
    if (/msdbrptr|msdatrep|data\s*report/i.test(text)) return 'data-report';
    return null;
  },
  crystalFileExtension: '.rpt',
  // Forms and standard modules are VB code whatever their extension
  // (e.g. `Module=ORACONST; ..\cmn\ORACONST.TXT`). A class keeps the role of
  // its extension: its header is only parsed for .cls.
  roleForProjectMember: (kind) =>
    kind === 'form' || kind === 'module' ? 'code' : null,
  toRelativeMemberPath(declaredPath) {
    const path = declaredPath.trim().replaceAll('\\', '/');
    if (path === '' || path.startsWith('/') || /^[A-Za-z]:/.test(path))
      return null;
    return path;
  },
};
