import type { SourceInventory } from './source-inventory.js';

// One row per program for TL review in a spreadsheet (CSV, UTF-8 with BOM so
// Excel keeps Japanese text). The JSON inventory stays the source of truth.

const COLUMNS = [
  'projectPath',
  'name',
  'status',
  'complete',
  'members',
  'ownFiles',
  'ownCodeLines',
  'programCodeLines',
  'ownProcedures',
  'decisionPoints',
  'maxProcedureDecisionPoints',
  'reachableSharedProcedures',
  'tables',
  'crud',
  'dynamicSql',
  'components',
  'externalApis',
  'ambiguousCalls',
  'complexityScore',
  'complexityLevel',
] as const;

function csvCell(value: string | number | boolean | null): string {
  const text = value === null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function programSummaryCsv(inventory: SourceInventory): string {
  const rows = inventory.programs.map((program) => {
    const analysis = program.analysis;
    const metrics = analysis?.metrics;
    const row: Record<
      (typeof COLUMNS)[number],
      string | number | boolean | null
    > = {
      projectPath: program.projectPath,
      name: program.name,
      status: program.status,
      complete: program.complete,
      members: program.members.length,
      ownFiles: metrics?.ownFiles ?? null,
      ownCodeLines: metrics?.ownCodeLines ?? null,
      programCodeLines: program.counters.codeLines,
      ownProcedures: metrics?.ownProcedures ?? null,
      decisionPoints: metrics?.decisionPoints ?? null,
      maxProcedureDecisionPoints: metrics?.maxProcedureDecisionPoints ?? null,
      reachableSharedProcedures: metrics?.reachableSharedProcedures ?? null,
      tables: metrics?.tables ?? null,
      crud:
        analysis?.crud
          .map((entry) => `${entry.table}:${entry.operations.join('')}`)
          .join(' ') ?? null,
      dynamicSql: metrics?.dynamicSql ?? null,
      components: metrics?.components ?? null,
      externalApis: metrics?.externalApis ?? null,
      ambiguousCalls:
        analysis?.calls.filter((call) => call.resolution === 'ambiguous')
          .length ?? null,
      complexityScore: analysis?.complexity.score ?? null,
      complexityLevel: analysis?.complexity.level ?? null,
    };
    return COLUMNS.map((column) => csvCell(row[column])).join(',');
  });
  return `\uFEFF${[COLUMNS.join(','), ...rows].join('\r\n')}\r\n`;
}
