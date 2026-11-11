import {
  crudTables,
  effectiveMapping,
  mappedCrud,
  type SourceInventoryDocument,
} from '@portal/contracts';

// The deterministic integration test checklist of one program (TC02): what
// an agent writing the integration test specification must cover. Where the
// unit test checklist lists the parts of a program, this one lists how they
// work together: the program calling a shared module, a table written in one
// procedure and used in another, a report, and a table this program shares
// with another program. Built from the inventory only; the agent writes the
// scenarios. Pure and stable: the same inventory gives the same items and IDs.
//
// No `screen-flow` kind (one screen opening another): call-graph-v2 resolves
// a name inside its own file or to a global procedure, and procedures of a
// form are never global, so `Form2.Show` or `Form2.LoadData` is not a call
// in the inventory. Listing screen pairs needs the analyzer to record
// qualified calls first (out of scope of TC02).

export const IT_CHECKLIST_VERSION = 'it-checklist-v1';

export const IT_ITEM_KINDS = [
  'shared-module',
  'db-chain',
  'report',
  'cross-program',
] as const;
export type ItItemKind = (typeof IT_ITEM_KINDS)[number];

export type ItItem = {
  // IT-<program>-<kind>-<n>
  id: string;
  kind: ItItemKind;
  // Evidence inside the program: the call, the SQL access, the report.
  file: string;
  line: number;
  // What works together: "A → Common.bas", a table, a report.
  detail: string;
  // cross-program only: the other program, which a scenario has to name.
  counterpart: string | null;
};

export type ItChecklist = {
  version: typeof IT_CHECKLIST_VERSION;
  program: string;
  items: ItItem[];
};

type Draft = Omit<ItItem, 'id'>;
type Program = SourceInventoryDocument['programs'][number];

const stem = (path: string) =>
  (path.split('/').at(-1) ?? path).replace(/\.[^.]+$/, '');
const baseName = (path: string) => path.split('/').at(-1) ?? path;
const WRITES = new Set(['C', 'U', 'D']);
const OPERATION_ORDER = ['C', 'R', 'U', 'D', 'X'];
const operationsText = (operations: Iterable<string>) =>
  [...new Set(operations)]
    .sort((a, b) => OPERATION_ORDER.indexOf(a) - OPERATION_ORDER.indexOf(b))
    .join('');
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const FILE_OWNER = '#file';

export function buildItChecklist(
  inventory: SourceInventoryDocument,
  projectPath: string,
): ItChecklist {
  const key = stem(projectPath);
  const program = inventory.programs.find(
    (candidate) => candidate.projectPath === projectPath,
  );
  if (!program || program.status !== 'parsed')
    return { version: IT_CHECKLIST_VERSION, program: key, items: [] };

  // Files of the program, and the file each procedure belongs to.
  const shared = new Map<string, boolean>();
  for (const member of program.members)
    if (member.relativePath) shared.set(member.relativePath, member.shared);
  const analyzed = inventory.files.flatMap((entry) =>
    shared.has(entry.manifest.relativePath) &&
    entry.analysis?.status === 'analyzed'
      ? [{ path: entry.manifest.relativePath, analysis: entry.analysis }]
      : [],
  );
  const procedureFile = new Map<string, string>();
  for (const { path, analysis } of analyzed)
    for (const procedure of analysis.procedures)
      procedureFile.set(procedure.id, path);
  // `from` of code outside procedures is `<file>#file`.
  const fileOf = (id: string) =>
    procedureFile.get(id) ??
    (id.endsWith(FILE_OWNER) ? id.slice(0, -FILE_OWNER.length) : null);

  // The program's own code calling a shared module, one item per module.
  // Only calls the analyzer resolved to one target: an ambiguous name is not
  // a known flow.
  const sharedModules = new Map<
    string,
    { file: string; line: number; names: Set<string> }
  >();
  const calls = [...(program.analysis?.calls ?? [])].sort(
    (a, b) => byText(a.from, b.from) || a.line - b.line,
  );
  for (const call of calls) {
    if (call.resolution !== 'program') continue;
    const from = fileOf(call.from);
    const to = call.targets[0] ? fileOf(call.targets[0]) : null;
    if (!from || !to || shared.get(from) !== false || shared.get(to) !== true)
      continue;
    const existing = sharedModules.get(to);
    if (existing) existing.names.add(call.name);
    else
      sharedModules.set(to, {
        file: from,
        line: call.line,
        names: new Set([call.name]),
      });
  }

  // A table used in two or more procedures of the program with at least one
  // write: what one part stores, another part depends on.
  type Access = { unit: string; operation: string; file: string; line: number };
  const accesses = new Map<string, { name: string; list: Access[] }>();
  for (const { path, analysis } of analyzed)
    for (const fact of analysis.sqlTables) {
      const id = fact.table.toUpperCase();
      const entry = accesses.get(id) ?? { name: fact.table, list: [] };
      entry.list.push({
        unit: fact.procedureId ?? `${path}${FILE_OWNER}`,
        operation: fact.operation,
        file: path,
        line: fact.line,
      });
      accesses.set(id, entry);
    }
  const dbChains: Draft[] = [];
  for (const { name, list } of accesses.values()) {
    const units = new Set(list.map((access) => access.unit));
    const firstWrite = list.find((access) => WRITES.has(access.operation));
    if (units.size < 2 || !firstWrite) continue;
    dbChains.push({
      kind: 'db-chain',
      file: firstWrite.file,
      line: firstWrite.line,
      detail: `${name} (${operationsText(list.map((a) => a.operation))}, ${units.size} procedures)`,
      counterpart: null,
    });
  }

  const reports: Draft[] = (program.reports ?? []).map((report) => ({
    kind: 'report',
    file: report.file,
    line: report.line ?? 1,
    detail: `${report.kind} ${report.name} (${report.confidence})`,
    counterpart: null,
  }));

  // A table this program writes and another reads, or the other way round,
  // by the same table view step 2 shows (`crudTables`).
  const view = crudTables(inventory);
  const mapping = effectiveMapping(inventory);
  const viewEntries = (candidate: Program) => {
    const analysis = candidate.analysis;
    if (!analysis) return [];
    return (
      (view.mapped ? mappedCrud(analysis, mapping) : null) ?? analysis.crud
    );
  };
  const crossProgram: Draft[] = [];
  for (const own of viewEntries(program)) {
    if ((view.tables.get(own.table)?.programs.size ?? 0) < 2) continue;
    const ownWrites = own.operations.some((op) => WRITES.has(op));
    const ownReads = own.operations.includes('R');
    for (const other of inventory.programs) {
      if (other.projectPath === projectPath) continue;
      const theirs = viewEntries(other).find(
        (entry) => entry.table === own.table,
      );
      if (!theirs) continue;
      const theyWrite = theirs.operations.some((op) => WRITES.has(op));
      const theyRead = theirs.operations.includes('R');
      if (!(ownWrites && theyRead) && !(ownReads && theyWrite)) continue;
      const name = stem(other.projectPath);
      crossProgram.push({
        kind: 'cross-program',
        file: own.evidence.relativePath,
        line: own.evidence.line,
        detail: `${own.table}: ${key} ${operationsText(own.operations)} / ${name} ${operationsText(theirs.operations)}`,
        counterpart: name,
      });
    }
  }

  const ordered: Draft[] = [
    ...[...sharedModules.entries()]
      .sort(([a], [b]) => byText(a, b))
      .map(([module, { file, line, names }]): Draft => ({
        kind: 'shared-module',
        file,
        line,
        detail: `${key} → ${baseName(module)} (${[...names].sort(byText).join(', ')})`,
        counterpart: null,
      })),
    ...dbChains.sort((a, b) => byText(a.detail, b.detail)),
    ...reports,
    ...crossProgram.sort((a, b) => byText(a.detail, b.detail)),
  ];

  const counters = new Map<ItItemKind, number>();
  const items = ordered.map((item) => {
    const n = (counters.get(item.kind) ?? 0) + 1;
    counters.set(item.kind, n);
    return { ...item, id: `IT-${key}-${item.kind}-${n}` };
  });
  return { version: IT_CHECKLIST_VERSION, program: key, items };
}
