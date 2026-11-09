import type { SourceInventoryDocument } from '@portal/contracts';
import { findSourceProfile } from './source-profiles.js';

// The deterministic unit test checklist of one program (TC01): what an agent
// writing the unit test specification must cover, and the measure of that
// coverage. Built from the inventory only, at the level of procedures, event
// handlers, SQL statements and reports; branches inside a procedure are NOT
// listed: the agent enumerates them from the source, each case with its own
// file:line evidence. Pure and stable: the same inventory gives the same
// items and IDs.

export const UT_CHECKLIST_VERSION = 'ut-checklist-v1';

export type UtItemKind = 'procedure' | 'event' | 'sql' | 'report';

export type UtItem = {
  // UT-<program>-<procedure>-<n>
  id: string;
  kind: UtItemKind;
  // Procedure the item belongs to; `_file_<name>` for file-level code.
  procedure: string;
  file: string;
  line: number;
  // What the item is: SQL operation and table, report kind and name, ...
  detail: string;
};

export type UtChecklist = {
  version: typeof UT_CHECKLIST_VERSION;
  program: string;
  items: UtItem[];
};

type Inventory = Pick<SourceInventoryDocument, 'files' | 'programs'> &
  Partial<Pick<SourceInventoryDocument, 'profileId'>>;

const stem = (path: string) =>
  (path.split('/').at(-1) ?? path).replace(/\.[^.]+$/, '');
const OP: Record<string, string> = {
  C: 'INSERT',
  R: 'SELECT',
  U: 'UPDATE',
  D: 'DELETE',
  X: 'DDL',
};

export function buildUtChecklist(
  inventory: Inventory,
  projectPath: string,
): UtChecklist {
  const program = inventory.programs.find(
    (candidate) => candidate.projectPath === projectPath,
  );
  const empty: UtChecklist = {
    version: UT_CHECKLIST_VERSION,
    program: stem(projectPath),
    items: [],
  };
  if (!program || program.status !== 'parsed') return empty;
  const analyzer = findSourceProfile(
    inventory.profileId ?? 'vb6-cp932-v1',
  )?.analyzer;
  const key = stem(projectPath);
  const byPath = new Map(
    inventory.files.map((entry) => [entry.manifest.relativePath, entry]),
  );
  const paths = [
    ...new Set(
      program.members.flatMap((member) =>
        member.relativePath ? [member.relativePath] : [],
      ),
    ),
  ];

  type Group = { name: string; file: string; items: Omit<UtItem, 'id'>[] };
  const groups: Group[] = [];
  const groupOf = new Map<string, Group>();
  const analyzed = paths.flatMap((path) => {
    const analysis = byPath.get(path)?.analysis;
    return analysis?.status === 'analyzed' ? [{ path, analysis }] : [];
  });
  // Same procedure name in two files of the program: file name as prefix.
  const nameCount = new Map<string, number>();
  for (const { analysis } of analyzed)
    for (const procedure of analysis.procedures)
      nameCount.set(
        procedure.name.toLowerCase(),
        (nameCount.get(procedure.name.toLowerCase()) ?? 0) + 1,
      );
  const labelOf = (path: string, name: string) =>
    (nameCount.get(name.toLowerCase()) ?? 1) > 1
      ? `${stem(path)}.${name}`
      : name;

  for (const { path, analysis } of analyzed) {
    for (const procedure of analysis.procedures) {
      const label = labelOf(path, procedure.name);
      const group: Group = { name: label, file: path, items: [] };
      groups.push(group);
      groupOf.set(procedure.id, group);
      const event = analyzer?.isEventHandler(path, procedure.name) ?? false;
      group.items.push({
        kind: event ? 'event' : 'procedure',
        procedure: label,
        file: path,
        line: procedure.startLine,
        detail: `${procedure.kind} ${procedure.name}`,
      });
    }
    const fileGroup: Group = {
      name: `_file_${stem(path)}`,
      file: path,
      items: [],
    };
    const place = (procedureId: string | null) =>
      (procedureId ? groupOf.get(procedureId) : undefined) ?? fileGroup;
    const sql = analysis.sqlTables
      .map((fact) => ({ ...fact }))
      .sort((a, b) => a.line - b.line || (a.table < b.table ? -1 : 1));
    for (const fact of sql) {
      const group = place(fact.procedureId);
      group.items.push({
        kind: 'sql',
        procedure: group.name,
        file: path,
        line: fact.line,
        detail: `${OP[fact.operation] ?? fact.operation} ${fact.table}`,
      });
    }
    if (fileGroup.items.length > 0) groups.push(fileGroup);
  }

  // Reports of the program (AR04), every confidence: where the code can
  // produce output is exactly what has to be tested.
  for (const report of program.reports ?? []) {
    const group =
      (report.procedureId ? groupOf.get(report.procedureId) : undefined) ??
      (() => {
        const created: Group = {
          name: `_file_${stem(report.file)}`,
          file: report.file,
          items: [],
        };
        const existing = groups.find((entry) => entry.name === created.name);
        if (existing) return existing;
        groups.push(created);
        return created;
      })();
    group.items.push({
      kind: 'report',
      procedure: group.name,
      file: report.file,
      line: report.line ?? 1,
      detail: `${report.kind} ${report.name} (${report.confidence})`,
    });
  }

  // Report evidence of an unresolved procedure shares its name with others;
  // numbering is per group in the order built above.
  const items: UtItem[] = [];
  for (const group of groups)
    group.items.forEach((item, index) =>
      items.push({ ...item, id: `UT-${key}-${group.name}-${index + 1}` }),
    );
  return { version: UT_CHECKLIST_VERSION, program: key, items };
}
