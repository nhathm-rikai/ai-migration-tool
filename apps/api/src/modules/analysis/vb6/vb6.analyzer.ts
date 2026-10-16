import type { LanguageAnalyzer, SourceFileRole } from '../language-analyzer.js';
import { analyzeVb6CodeFile, findVb6References } from './vb6-code-file.js';
import { parseVb6ProjectFile } from './vb6-project-file.js';

// v1 text allowlist is .bas/.frm/.vbp; .cls and other VB6 source types are
// reported unsupported until fixtures/parser tests exist.
const ROLES: Record<string, SourceFileRole> = {
  '.bas': 'code',
  '.frm': 'code',
  '.vbp': 'project',
  '.frx': 'resource',
  '.cls': 'unsupported',
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

export const vb6Analyzer: LanguageAnalyzer = {
  languageId: 'vb6',
  metricVersion: 'vb6-physical-code-v1',
  fileRole: (relativePath) => ROLES[extension(relativePath)] ?? 'excluded',
  analyzeCodeFile: (relativePath, lines) =>
    analyzeVb6CodeFile(relativePath, lines, {
      form: extension(relativePath) === '.frm',
    }),
  findReferences: (relativePath, lines, names) =>
    findVb6References(relativePath, lines, {
      form: extension(relativePath) === '.frm',
      names,
    }),
  parseProjectFile: parseVb6ProjectFile,
  // Forms and standard modules are VB code whatever their extension
  // (e.g. `Module=ORACONST; ..\cmn\ORACONST.TXT`).
  roleForProjectMember: (kind) =>
    kind === 'form' || kind === 'module' ? 'code' : null,
  toRelativeMemberPath(declaredPath) {
    const path = declaredPath.trim().replaceAll('\\', '/');
    if (path === '' || path.startsWith('/') || /^[A-Za-z]:/.test(path))
      return null;
    return path;
  },
};
