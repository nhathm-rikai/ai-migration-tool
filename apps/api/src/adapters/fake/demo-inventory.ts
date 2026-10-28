import { createHash } from 'node:crypto';
import type { SourceInventoryDocument } from '@portal/contracts';

// Hand-written inventory the demo executor publishes (B07 before B08). It
// describes an invented order-management sample, not customer source, and
// is built with the analyzer's rules so totals stay consistent: program
// counters count each analyzed member file once (shared files included),
// unique totals count each analyzed file of the corpus once. It shows a
// shared module, a partial program (missing member, unsupported class) and
// assumed table name mapping, so the Assessment view has every state.

type InventoryFile = SourceInventoryDocument['files'][number];
type Program = SourceInventoryDocument['programs'][number];
type Analysis = NonNullable<Program['analysis']>;
type Counters = Program['counters'];
type Complexity = Analysis['complexity'];

const hash = (text: string) => createHash('sha256').update(text).digest('hex');

export const DEMO_SNAPSHOT_HASH = hash('portal-demo-sample-vb6-v1');

function counters(
  code: number,
  comment: number,
  blank: number,
  metadata: number,
): Counters {
  return {
    physicalLines: code + comment + blank + metadata,
    designerLines: 0,
    metadataLines: metadata,
    blankLines: blank,
    commentOnlyLines: comment,
    codeLines: code,
    unclassifiedLines: 0,
  };
}

function add(target: Counters, value: Counters): void {
  for (const key of Object.keys(target) as (keyof Counters)[])
    target[key] += value[key];
}

const zero = () => counters(0, 0, 0, 0);

function text(relativePath: string, role: 'code' | 'project', lines: number) {
  return {
    relativePath,
    role,
    byteLength: lines * 32,
    rawSha256: hash(`raw:${relativePath}`),
    kind: 'text',
    encoding: 'cp932',
    encodingSource: 'profile',
    normalizedSha256: hash(`text:${relativePath}`),
    lineCount: lines,
    newlineStyle: 'crlf',
  } as const;
}

function codeFile(
  relativePath: string,
  lines: Counters,
  procedures: {
    kind: string;
    name: string;
    codeLines: number;
    decisions: number;
  }[],
  sqlTables: {
    table: string;
    operation: 'C' | 'R' | 'U' | 'D';
    line: number;
  }[],
): InventoryFile {
  let line = lines.metadataLines + 1;
  const parsed = procedures.map((procedure) => {
    const startLine = line;
    line += procedure.codeLines + 1;
    return {
      id: `${relativePath}#${procedure.kind}:${procedure.name}`,
      kind: procedure.kind,
      name: procedure.name,
      visibility: 'public' as const,
      startLine,
      endLine: line - 1,
      codeLines: procedure.codeLines,
      decisionPoints: procedure.decisions,
    };
  });
  const procedureLines = parsed.reduce((sum, p) => sum + p.codeLines, 0);
  return {
    manifest: text(relativePath, 'code', lines.physicalLines),
    analysis: {
      status: 'analyzed',
      counters: lines,
      procedures: parsed,
      fileLevelCodeLines: lines.codeLines - procedureLines,
      sqlTables: sqlTables.map((entry) => ({
        ...entry,
        procedureId: parsed[0]?.id ?? null,
      })),
      dynamicSql: [],
      externalDeclarations: [],
      labels: [],
    },
  };
}

const COMMON = 'cmn/COMMON.BAS';
const files: InventoryFile[] = [
  codeFile(
    COMMON,
    counters(120, 18, 14, 2),
    [
      { kind: 'Function', name: 'OpenConnection', codeLines: 40, decisions: 6 },
      { kind: 'Sub', name: 'WriteAuditLog', codeLines: 70, decisions: 9 },
    ],
    [{ table: 'APP.AUDIT_LOG', operation: 'C', line: 60 }],
  ),
  { manifest: text('programs/ORDER/ORDER.VBP', 'project', 12), analysis: null },
  codeFile(
    'programs/ORDER/ORDER.BAS',
    counters(310, 40, 36, 2),
    [
      { kind: 'Sub', name: 'SaveOrder', codeLines: 180, decisions: 28 },
      { kind: 'Function', name: 'LoadOrders', codeLines: 120, decisions: 14 },
    ],
    [
      { table: 'ORDERS', operation: 'R', line: 20 },
      { table: 'APP.ORDERS', operation: 'U', line: 90 },
      { table: 'ORDER_LINES', operation: 'C', line: 110 },
    ],
  ),
  {
    manifest: text('programs/CUSTOMER/CUSTOMER.VBP', 'project', 10),
    analysis: null,
  },
  codeFile(
    'programs/CUSTOMER/CUSTOMER.BAS',
    counters(140, 22, 18, 2),
    [{ kind: 'Sub', name: 'SearchCustomer', codeLines: 132, decisions: 11 }],
    [{ table: 'CUSTOMERS', operation: 'R', line: 30 }],
  ),
  {
    manifest: text('programs/REPORT/REPORT.VBP', 'project', 11),
    analysis: null,
  },
  codeFile(
    'programs/REPORT/REPORT.BAS',
    counters(85, 10, 9, 2),
    [{ kind: 'Sub', name: 'PrintMonthly', codeLines: 80, decisions: 7 }],
    [{ table: 'ORDERS', operation: 'R', line: 15 }],
  ),
  {
    manifest: text('programs/REPORT/LAYOUT.CLS', 'code', 64),
    analysis: { status: 'unsupported', reason: 'UNBALANCED_BLOCK', line: 41 },
  },
  {
    manifest: {
      relativePath: 'programs/ORDER/ORDERFORM.FRX',
      role: 'resource',
      byteLength: 2048,
      rawSha256: hash('raw:programs/ORDER/ORDERFORM.FRX'),
      kind: 'binary',
    },
    analysis: null,
  },
];

const byPath = new Map(files.map((file) => [file.manifest.relativePath, file]));
const sharedPaths = new Set([COMMON]);

function member(
  kind: string,
  name: string | null,
  declaredPath: string,
  relativePath: string | null,
): Program['members'][number] {
  const file = relativePath ? byPath.get(relativePath) : undefined;
  return {
    kind,
    name,
    declaredPath,
    relativePath,
    resolution: relativePath ? 'resolved' : 'missing',
    fileStatus: !file
      ? null
      : file.analysis?.status === 'analyzed'
        ? 'analyzed'
        : file.analysis?.status === 'unsupported'
          ? 'unsupported'
          : 'other',
    shared: relativePath !== null && sharedPaths.has(relativePath),
  };
}

function complexity(score: number, parts: Complexity['parts']): Complexity {
  return {
    version: 'complexity-v0',
    score,
    level: score < 40 ? 'low' : score < 55 ? 'medium' : 'high',
    parts,
  };
}

function program(input: {
  name: string;
  projectPath: string;
  members: Program['members'];
  crud: Analysis['crud'];
  normalizedCrud: NonNullable<Analysis['normalizedCrud']>;
  complexity: Complexity;
  normalizedComplexity: Complexity;
}): Program {
  const programCounters = zero();
  let ownFiles = 0;
  let ownCodeLines = 0;
  let ownProcedures = 0;
  let decisionPoints = 0;
  let maxProcedureDecisionPoints = 0;
  for (const entry of input.members) {
    const analysis = entry.relativePath
      ? byPath.get(entry.relativePath)?.analysis
      : undefined;
    if (analysis?.status !== 'analyzed') continue;
    add(programCounters, analysis.counters);
    if (entry.shared) continue;
    ownFiles += 1;
    ownCodeLines += analysis.counters.codeLines;
    ownProcedures += analysis.procedures.length;
    for (const procedure of analysis.procedures) {
      decisionPoints += procedure.decisionPoints;
      maxProcedureDecisionPoints = Math.max(
        maxProcedureDecisionPoints,
        procedure.decisionPoints,
      );
    }
  }
  return {
    projectPath: input.projectPath,
    status: 'parsed',
    issue: null,
    name: input.name,
    members: input.members,
    externalReferences: [],
    counters: programCounters,
    complete: input.members.every((entry) => entry.fileStatus === 'analyzed'),
    analysis: {
      calls: [],
      crud: input.crud,
      normalizedCrud: input.normalizedCrud,
      externalApis: [],
      metrics: {
        ownFiles,
        ownCodeLines,
        ownProcedures,
        decisionPoints,
        maxProcedureDecisionPoints,
        reachableSharedProcedures: input.members.some((entry) => entry.shared)
          ? 1
          : 0,
        tables: input.crud.length,
        normalizedTables: input.normalizedCrud.length,
        dynamicSql: 0,
        components: 0,
        externalApis: 0,
      },
      complexity: input.complexity,
      normalizedComplexity: input.normalizedComplexity,
    },
  };
}

const parts = (size: number, decisions: number, tables: number) => ({
  size,
  decisions,
  tables,
  dynamicSql: 0,
  components: 0,
  externalApis: 0,
});

const evidence = (relativePath: string, line: number) => ({
  relativePath,
  line,
});

const programs: Program[] = [
  program({
    name: 'ORDER',
    projectPath: 'programs/ORDER/ORDER.VBP',
    members: [
      member('Module', 'ORDER', 'ORDER.BAS', 'programs/ORDER/ORDER.BAS'),
      member('Module', 'COMMON', '..\\..\\cmn\\COMMON.BAS', COMMON),
    ],
    crud: [
      {
        table: 'APP.AUDIT_LOG',
        operations: ['C'],
        evidence: evidence(COMMON, 60),
        viaSharedOnly: true,
      },
      {
        table: 'APP.ORDERS',
        operations: ['U'],
        evidence: evidence('programs/ORDER/ORDER.BAS', 90),
        viaSharedOnly: false,
      },
      {
        table: 'ORDER_LINES',
        operations: ['C'],
        evidence: evidence('programs/ORDER/ORDER.BAS', 110),
        viaSharedOnly: false,
      },
      {
        table: 'ORDERS',
        operations: ['R'],
        evidence: evidence('programs/ORDER/ORDER.BAS', 20),
        viaSharedOnly: false,
      },
    ],
    normalizedCrud: [
      {
        table: 'AUDIT_LOG',
        operations: ['C'],
        evidence: evidence(COMMON, 60),
        viaSharedOnly: true,
        names: ['APP.AUDIT_LOG'],
      },
      {
        table: 'ORDER_LINES',
        operations: ['C'],
        evidence: evidence('programs/ORDER/ORDER.BAS', 110),
        viaSharedOnly: false,
        names: ['ORDER_LINES'],
      },
      {
        table: 'ORDERS',
        operations: ['R', 'U'],
        evidence: evidence('programs/ORDER/ORDER.BAS', 20),
        viaSharedOnly: false,
        names: ['APP.ORDERS', 'ORDERS'],
      },
    ],
    complexity: complexity(42, parts(18.6, 12.1, 11.3)),
    normalizedComplexity: complexity(40, parts(18.6, 12.1, 9.6)),
  }),
  program({
    name: 'CUSTOMER',
    projectPath: 'programs/CUSTOMER/CUSTOMER.VBP',
    members: [
      member(
        'Module',
        'CUSTOMER',
        'CUSTOMER.BAS',
        'programs/CUSTOMER/CUSTOMER.BAS',
      ),
      member('Module', 'COMMON', '..\\..\\cmn\\COMMON.BAS', COMMON),
    ],
    crud: [
      {
        table: 'APP.AUDIT_LOG',
        operations: ['C'],
        evidence: evidence(COMMON, 60),
        viaSharedOnly: true,
      },
      {
        table: 'CUSTOMERS',
        operations: ['R'],
        evidence: evidence('programs/CUSTOMER/CUSTOMER.BAS', 30),
        viaSharedOnly: false,
      },
    ],
    normalizedCrud: [
      {
        table: 'AUDIT_LOG',
        operations: ['C'],
        evidence: evidence(COMMON, 60),
        viaSharedOnly: true,
        names: ['APP.AUDIT_LOG'],
      },
      {
        table: 'CUSTOMERS',
        operations: ['R'],
        evidence: evidence('programs/CUSTOMER/CUSTOMER.BAS', 30),
        viaSharedOnly: false,
        names: ['CUSTOMERS'],
      },
    ],
    complexity: complexity(27, parts(15.2, 7.4, 4.8)),
    normalizedComplexity: complexity(27, parts(15.2, 7.4, 4.8)),
  }),
  program({
    name: 'REPORT',
    projectPath: 'programs/REPORT/REPORT.VBP',
    members: [
      member('Module', 'REPORT', 'REPORT.BAS', 'programs/REPORT/REPORT.BAS'),
      member('Class', 'LAYOUT', 'LAYOUT.CLS', 'programs/REPORT/LAYOUT.CLS'),
      member('Form', null, 'PREVIEW.FRM', null),
    ],
    crud: [
      {
        table: 'ORDERS',
        operations: ['R'],
        evidence: evidence('programs/REPORT/REPORT.BAS', 15),
        viaSharedOnly: false,
      },
    ],
    normalizedCrud: [
      {
        table: 'ORDERS',
        operations: ['R'],
        evidence: evidence('programs/REPORT/REPORT.BAS', 15),
        viaSharedOnly: false,
        names: ['ORDERS'],
      },
    ],
    complexity: complexity(19, parts(13.1, 5.2, 0.7)),
    normalizedComplexity: complexity(19, parts(13.1, 5.2, 0.7)),
  }),
];

const uniqueCounters = zero();
for (const file of files)
  if (file.analysis?.status === 'analyzed')
    add(uniqueCounters, file.analysis.counters);

export const demoInventory: SourceInventoryDocument = {
  schemaVersion: 'source-inventory-v1',
  profileId: 'vb6-cp932-v1',
  languageId: 'vb6',
  metricVersion: 'vb6-physical-code-v1',
  decoderVersion: 'whatwg-textdecoder-v1',
  normalizationVersion: 'newline-lf-v1',
  sqlAccessVersion: 'sql-access-v4',
  callGraphVersion: 'call-graph-v2',
  complexityVersion: 'complexity-v0',
  tableNames: {
    version: 'table-name-v1',
    defaultSchema: 'APP',
    status: 'assumed',
  },
  snapshotHash: DEMO_SNAPSHOT_HASH,
  files,
  programs,
  totals: {
    files: files.length,
    codeFiles: files.filter((file) => file.manifest.role === 'code').length,
    analyzedCodeFiles: files.filter(
      (file) => file.analysis?.status === 'analyzed',
    ).length,
    unsupportedFiles: files.filter(
      (file) => file.analysis?.status === 'unsupported',
    ).length,
    errorFiles: 0,
    uniqueCounters,
  },
  skipped: [],
};
