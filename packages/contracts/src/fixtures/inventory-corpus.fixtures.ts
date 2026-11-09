import type { SourceInventoryDocument } from '../source-inventory.schema.js';

// Synthetic VB6 corpus for graph and performance tests (UI03): invented
// folders, programs, shared modules, tables and components, generated
// deterministically from the requested sizes. Not customer source. Every
// program has one own form calling into the shared modules it declares;
// every 50th program is unsupported (no analysis) and every 37th declares a
// missing member, so the graph has to show both states.

type Inventory = SourceInventoryDocument;
type InventoryFile = Inventory['files'][number];
type InventoryProgram = Inventory['programs'][number];
type ProgramAnalysis = NonNullable<InventoryProgram['analysis']>;
type Counters = Inventory['totals']['uniqueCounters'];

export type SyntheticCorpusSize = {
  programs: number;
  sharedModules: number;
  tables: number;
  // Top-level folders programs are spread over (KNR, KUK… in a real corpus).
  folders?: number;
  components?: number;
};

const HASH = (n: number) => n.toString(16).padStart(64, '0').slice(-64);

const counters = (code: number): Counters => ({
  physicalLines: code + 2,
  designerLines: 0,
  metadataLines: 1,
  blankLines: 1,
  commentOnlyLines: 0,
  codeLines: code,
  unclassifiedLines: 0,
});

const addCounters = (a: Counters, b: Counters): Counters => ({
  physicalLines: a.physicalLines + b.physicalLines,
  designerLines: a.designerLines + b.designerLines,
  metadataLines: a.metadataLines + b.metadataLines,
  blankLines: a.blankLines + b.blankLines,
  commentOnlyLines: a.commentOnlyLines + b.commentOnlyLines,
  codeLines: a.codeLines + b.codeLines,
  unclassifiedLines: a.unclassifiedLines + b.unclassifiedLines,
});

const ZERO_COUNTERS: Counters = {
  physicalLines: 0,
  designerLines: 0,
  metadataLines: 0,
  blankLines: 0,
  commentOnlyLines: 0,
  codeLines: 0,
  unclassifiedLines: 0,
};

// Small deterministic generator (mulberry32): the same sizes always give the
// same corpus.
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function textFile(
  relativePath: string,
  role: 'code' | 'project',
  index: number,
  analysis: InventoryFile['analysis'],
): InventoryFile {
  return {
    manifest: {
      relativePath,
      role,
      byteLength: 400,
      rawSha256: HASH(index * 2 + 1),
      kind: 'text',
      encoding: 'cp932',
      encodingSource: 'profile',
      normalizedSha256: HASH(index * 2 + 2),
      lineCount: 20,
      newlineStyle: 'crlf',
    },
    analysis,
  };
}

const pad = (value: number, width: number) =>
  String(value).padStart(width, '0');

export function syntheticCorpusFixture(size: SyntheticCorpusSize): Inventory {
  const next = random(
    size.programs * 7919 + size.sharedModules * 104729 + size.tables,
  );
  const pick = (max: number) => Math.floor(next() * max);
  const folders = Math.max(1, size.folders ?? 8);
  const componentCount = size.components ?? 6;
  const files: InventoryFile[] = [];
  let fileIndex = 0;
  let unique = ZERO_COUNTERS;

  const tableName = (index: number) => `APP.T_${pad(index, 3)}`;
  const shared = Array.from({ length: size.sharedModules }, (_, index) => {
    const relativePath = `common/Cmn${pad(index, 2)}.bas`;
    const procedureId = `${relativePath}#Function:Cmn${pad(index, 2)}Run`;
    // Module 0 is declared by every program (a constants module); the rest
    // by a falling share of programs, so fan-in spreads out.
    const table = tableName(index % Math.max(1, size.tables));
    const fileCounters = counters(40 + index);
    unique = addCounters(unique, fileCounters);
    files.push(
      textFile(relativePath, 'code', fileIndex++, {
        status: 'analyzed',
        counters: fileCounters,
        procedures: [
          {
            id: procedureId,
            kind: 'Function',
            name: `Cmn${pad(index, 2)}Run`,
            visibility: 'public',
            startLine: 2,
            endLine: 12,
            codeLines: 10,
            decisionPoints: 2,
          },
        ],
        fileLevelCodeLines: 1,
        sqlTables:
          size.tables > 0
            ? [{ table, operation: 'R', line: 5, procedureId }]
            : [],
        dynamicSql: [],
        externalDeclarations: [],
        labels: [],
      }),
    );
    return { index, relativePath, procedureId, table };
  });

  const components = Array.from({ length: componentCount }, (_, index) => ({
    kind: 'component' as const,
    identifier: `{${pad(index, 8)}-0000-0000-0000-000000000000}#1.0#0`,
    fileName: `Ctl${pad(index, 2)}.ocx`,
    description: null,
  }));

  const programs: InventoryProgram[] = [];
  for (let index = 0; index < size.programs; index++) {
    const folder = `F${pad(index % folders, 2)}`;
    const name = `${folder}${pad(index, 4)}`;
    const projectPath = `${folder}/${name}/${name}.vbp`;
    files.push(textFile(projectPath, 'project', fileIndex++, null));
    const unsupported = index % 50 === 49;
    if (unsupported) {
      programs.push({
        projectPath,
        status: 'unsupported',
        issue: { reason: 'project-syntax', line: 3 },
        name,
        members: [],
        externalReferences: [],
        counters: ZERO_COUNTERS,
        complete: false,
        analysis: null,
      });
      continue;
    }
    const formPath = `${folder}/${name}/${name}.frm`;
    const formProcedure = `${formPath}#Sub:Form_Load`;
    const chosen = new Set<number>();
    if (shared.length > 0) chosen.add(0);
    const extra = Math.min(shared.length, 2 + pick(5));
    while (chosen.size < extra) chosen.add(pick(shared.length));
    const sharedChosen = [...chosen]
      .sort((a, b) => a - b)
      .flatMap((i) => {
        const module = shared[i];
        return module ? [module] : [];
      });
    const ownTables = new Set<number>();
    const tableTarget = Math.min(size.tables, 1 + pick(4));
    while (ownTables.size < tableTarget) ownTables.add(pick(size.tables));
    const sqlTables = [...ownTables]
      .sort((a, b) => a - b)
      .map((table, line) => ({
        table: tableName(table),
        operation: (['C', 'R', 'U', 'D'] as const)[(index + line) % 4] ?? 'R',
        line: 4 + line,
        procedureId: formProcedure,
      }));
    const formCounters = counters(60 + (index % 40));
    unique = addCounters(unique, formCounters);
    files.push(
      textFile(formPath, 'code', fileIndex++, {
        status: 'analyzed',
        counters: formCounters,
        procedures: [
          {
            id: formProcedure,
            kind: 'Sub',
            name: 'Form_Load',
            visibility: 'private',
            startLine: 2,
            endLine: 18,
            codeLines: 15,
            decisionPoints: 3,
          },
        ],
        fileLevelCodeLines: 1,
        sqlTables,
        dynamicSql: [],
        externalDeclarations: [],
        labels: [],
      }),
    );
    const missing = index % 37 === 36;
    const members: InventoryProgram['members'] = [
      {
        kind: 'Form',
        name,
        declaredPath: `${name}.frm`,
        relativePath: formPath,
        resolution: 'resolved',
        fileStatus: 'analyzed',
        shared: false,
      },
      ...sharedChosen.map((module) => ({
        kind: 'Module',
        name: `Cmn${pad(module.index, 2)}`,
        declaredPath: `..\\..\\${module.relativePath.replace(/\//g, '\\')}`,
        relativePath: module.relativePath,
        resolution: 'resolved' as const,
        fileStatus: 'analyzed' as const,
        shared: true,
      })),
      ...(missing
        ? [
            {
              kind: 'Module',
              name: 'Lost',
              declaredPath: '..\\..\\common\\Lost.bas',
              relativePath: null,
              resolution: 'missing' as const,
              fileStatus: null,
              shared: false,
            },
          ]
        : []),
    ];
    const calls: ProgramAnalysis['calls'] = sharedChosen.map(
      (module, line) => ({
        from: formProcedure,
        name: `Cmn${pad(module.index, 2)}Run`,
        resolution: 'program',
        targets: [module.procedureId],
        line: 10 + line,
        count: 1 + ((index + line) % 3),
      }),
    );
    const crud = new Map<string, ProgramAnalysis['crud'][number]>();
    const addCrud = (
      table: string,
      operation: 'C' | 'R' | 'U' | 'D',
      relativePath: string,
      line: number,
      viaSharedOnly: boolean,
    ) => {
      const entry = crud.get(table);
      if (!entry) {
        crud.set(table, {
          table,
          operations: [operation],
          evidence: { relativePath, line },
          viaSharedOnly,
        });
        return;
      }
      if (!entry.operations.includes(operation))
        entry.operations.push(operation);
      if (!viaSharedOnly) entry.viaSharedOnly = false;
    };
    for (const use of sqlTables)
      addCrud(use.table, use.operation, formPath, use.line, false);
    if (size.tables > 0)
      for (const module of sharedChosen)
        addCrud(module.table, 'R', module.relativePath, 5, true);
    const programCounters = sharedChosen.reduce(
      (sum, module) => addCounters(sum, counters(40 + module.index)),
      formCounters,
    );
    const score = 20 + ((index * 13) % 75);
    programs.push({
      projectPath,
      status: 'parsed',
      issue: null,
      name,
      members,
      externalReferences: components.filter(
        (_, component) => component === 0 || (index + component) % 5 === 0,
      ),
      counters: programCounters,
      complete: !missing,
      analysis: {
        calls,
        crud: [...crud.values()],
        externalApis: [],
        metrics: {
          ownFiles: 1,
          ownCodeLines: formCounters.codeLines,
          ownProcedures: 1,
          decisionPoints: 3,
          maxProcedureDecisionPoints: 3,
          reachableSharedProcedures: sharedChosen.length,
          tables: crud.size,
          dynamicSql: 0,
          components: 0,
          externalApis: 0,
        },
        complexity: {
          version: 'complexity-v1',
          score,
          level:
            score >= 70
              ? 'very-high'
              : score >= 60
                ? 'high'
                : score >= 45
                  ? 'medium'
                  : 'low',
          parts: {
            size: 10,
            decisions: 5,
            tables: 5,
            dynamicSql: 0,
            components: 0,
            externalApis: 0,
          },
        },
      },
    });
  }

  const codeFiles = files.filter((file) => file.manifest.role === 'code');
  return {
    schemaVersion: 'source-inventory-v1',
    profileId: 'vb6-cp932-v1',
    languageId: 'vb6',
    metricVersion: 'vb6-physical-code-v1',
    decoderVersion: 'whatwg-textdecoder-v1',
    normalizationVersion: 'newline-lf-v1',
    sqlAccessVersion: 'sql-access-v5',
    callGraphVersion: 'call-graph-v2',
    complexityVersion: 'complexity-v1',
    snapshotHash: HASH(999_999),
    files,
    programs,
    totals: {
      files: files.length,
      codeFiles: codeFiles.length,
      analyzedCodeFiles: codeFiles.length,
      unsupportedFiles: 0,
      errorFiles: 0,
      uniqueCounters: unique,
    },
    skipped: [],
  };
}

// A synthetic inventory plus one analyzed file that no project lists, with
// one dynamic and one concatenated SQL and one table access (AR02 review 2).
export function unownedSqlInventoryFixture(): Inventory {
  const inventory = syntheticCorpusFixture({
    programs: 2,
    sharedModules: 1,
    tables: 3,
  });
  const source = inventory.files.find(
    (file) => file.analysis?.status === 'analyzed',
  );
  if (source?.analysis?.status !== 'analyzed')
    throw new Error('fixture has no analyzed file');
  const extra = JSON.parse(JSON.stringify(source)) as InventoryFile;
  extra.manifest.relativePath = 'loose/EXTRA.BAS';
  if (extra.analysis?.status !== 'analyzed') throw new Error('fixture');
  extra.analysis.sqlTables = [
    { table: 'UNOWNED_T', operation: 'R', line: 5, procedureId: null },
  ];
  extra.analysis.dynamicSql = [{ procedureId: null, operation: 'R', line: 7 }];
  extra.analysis.concatenatedSql = [
    { procedureId: null, operation: 'U', line: 9 },
  ];
  extra.analysis.counters = {
    ...extra.analysis.counters,
    unclassifiedLines: 3,
  };
  inventory.files.push(extra);
  const total: Counters = inventory.totals.uniqueCounters;
  inventory.totals.uniqueCounters = addCounters(total, extra.analysis.counters);
  inventory.totals.files += 1;
  inventory.totals.codeFiles += 1;
  inventory.totals.analyzedCodeFiles += 1;
  return inventory;
}

// What every view must show for unownedSqlInventoryFixture() about the file
// no project lists, as counted by hand: one location of each SQL kind, and
// unclassified lines that raise the warning.
export const UNOWNED_SQL_EXPECTED = {
  dynamicSql: 1,
  concatenatedSql: 1,
  unclassifiedLines: 3,
} as const;
