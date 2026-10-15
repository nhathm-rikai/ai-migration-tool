import type {
  ProjectExternalReference,
  ProjectFileAnalysis,
  ProjectMember,
} from '../language-analyzer.js';

// Reads the member list and external references of a .vbp. Keys after the
// first [Section] belong to add-ins/tools and are ignored.

const MEMBER_KINDS: Record<string, string> = {
  form: 'form',
  module: 'module',
  class: 'class',
  usercontrol: 'user-control',
  propertypage: 'property-page',
  userdocument: 'user-document',
  designer: 'designer',
};

function unquote(value: string): string {
  const text = value.trim();
  return text.length >= 2 && text.startsWith('"') && text.endsWith('"')
    ? text.slice(1, -1)
    : text;
}

function parseMember(kind: string, value: string): ProjectMember {
  // Form/UserControl list a path; Module/Class list "Name; path".
  const separator = value.indexOf(';');
  return separator < 0
    ? { kind, name: null, declaredPath: value.trim() }
    : {
        kind,
        name: value.slice(0, separator).trim() || null,
        declaredPath: value.slice(separator + 1).trim(),
      };
}

function parseReference(value: string): ProjectExternalReference {
  // *\G{guid}#major.minor#lcid#path#description
  const [identifier = '', , , path = '', description = ''] = value.split('#');
  const fileName = path.split(/[\\/]/).at(-1) ?? '';
  return {
    kind: 'reference',
    identifier: identifier.replace(/^\*\\[A-Z]/i, ''),
    fileName: fileName || null,
    description: description || null,
  };
}

function parseComponent(value: string): ProjectExternalReference {
  // {guid}#version#lcid; file.ocx
  const [left = '', fileName = ''] = value.split(';');
  return {
    kind: 'component',
    identifier: left.split('#')[0]?.trim() ?? '',
    fileName: unquote(fileName) || null,
    description: null,
  };
}

// A VB6 project starts its main section with Type=<project type>; any other
// content is reported unsupported instead of an empty, "complete" program.
const PROJECT_TYPES = new Set(['exe', 'oledll', 'oleexe', 'control']);
const KEY_VALUE = /^[A-Za-z][A-Za-z0-9_]*\s*=/;

export function parseVb6ProjectFile(lines: string[]): ProjectFileAnalysis {
  let name: string | null = null;
  let hasType = false;
  const members: ProjectMember[] = [];
  const externalReferences: ProjectExternalReference[] = [];
  for (const [index, line] of lines.entries()) {
    const text = line.trim();
    if (text === '') continue;
    if (text.startsWith('[')) break;
    if (!KEY_VALUE.test(text))
      return {
        status: 'unsupported',
        reason: 'PROJECT_LINE_UNRECOGNIZED',
        line: index + 1,
      };
    const separator = text.indexOf('=');
    const key = text.slice(0, separator).trim().toLowerCase();
    const value = text.slice(separator + 1);
    const memberKind = MEMBER_KINDS[key];
    if (memberKind) members.push(parseMember(memberKind, value));
    else if (key === 'type')
      hasType = PROJECT_TYPES.has(value.trim().toLowerCase());
    else if (key === 'reference')
      externalReferences.push(parseReference(value));
    else if (key === 'object') externalReferences.push(parseComponent(value));
    else if (key === 'name') name = unquote(value) || null;
  }
  if (!hasType)
    return {
      status: 'unsupported',
      reason: 'PROJECT_TYPE_MISSING',
      line: null,
    };
  return { status: 'parsed', name, members, externalReferences };
}
