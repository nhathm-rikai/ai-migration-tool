import { jaMessages } from '../../shared/i18n/ja';
import {
  effectiveBase,
  moduleOf,
  QUOTE_SCOPE_ITEMS,
  QUOTE_VALIDITY_DAYS,
  SHARED_MODULE,
  type ComplexityLevel,
  type QuoteItem,
  type QuoteItemId,
  type QuoteParams,
  type QuoteResult,
  type QuoteScopeItem,
} from './quote-model';
import type { Cell, Sheet } from './xlsx';

// The quote as an Excel workbook laid out like the WBS estimate
// (BSN_Estimation): a summary sheet, a sheet with one row per program and a
// . Always in Japanese, whatever the screen
// language, because the quote goes to the customer. Totals are formulas, with
// the computed value saved beside them.

const copy = jaMessages.quote;

const LEVELS: Record<ComplexityLevel, string> = {
  low: '低',
  medium: '中',
  high: '高',
  'very-high': '超高',
};

const GROUPS: { id: 'doc' | 'code' | 'test' | 'mgmt'; items: QuoteItemId[] }[] =
  [
    { id: 'doc', items: ['BD', 'DD'] },
    { id: 'code', items: ['coding'] },
    { id: 'test', items: ['UT', 'IT', 'UAT support'] },
    { id: 'mgmt', items: ['pm', 'brse', 'comtor'] },
  ];

const ROLE_LABEL: Record<QuoteItemId, string> = {
  BD: 'SA',
  DD: 'SA',
  coding: 'DEV',
  UT: 'DEV, QC',
  IT: 'DEV, QC',
  'UAT support': 'DEV, QC',
  pm: 'PM',
  brse: 'BrSE',
  comtor: 'Comtor',
};

const scopeItems: QuoteScopeItem[] = [
  ...QUOTE_SCOPE_ITEMS.doc,
  ...QUOTE_SCOPE_ITEMS.test,
];

const round2 = (value: number) => Math.round(value * 100) / 100;

export function buildQuoteSheets({
  projectName,
  quoteNumber,
  params,
  result,
}: {
  projectName: string;
  quoteNumber: string;
  params: QuoteParams;
  result: QuoteResult;
}): Sheet[] {
  const base = effectiveBase(params);
  const itemOf = (id: QuoteItemId): QuoteItem =>
    result.items.find((item) => item.id === id) ?? { id, mm: 0, cost: 0 };
  const rateOf = (id: QuoteItemId) => {
    const item = itemOf(id);
    if (item.mm > 0) return Math.round(item.cost / item.mm);
    if (id === 'BD' || id === 'DD') return params.rate.sa;
    if (id === 'pm' || id === 'brse' || id === 'comtor') return params.rate[id];
    return params.rate.dev;
  };
  const moduleLabel = (name: string) =>
    name === SHARED_MODULE ? copy.sharedModule : name;

  // ---------------------------------------------------------------- Summary
  const rows: Cell[][] = [];
  const merges: string[] = [];
  const heights: Record<number, number> = {};
  const at = () => rows.length + 1;
  const push = (...cells: Cell[]) => rows.push(cells);
  const section = (label: string) =>
    push(
      { v: label, s: 'section' },
      ...Array<Cell>(7).fill({ v: null, s: 'section' }),
    );
  const header = (...labels: string[]) => {
    heights[at()] = 30;
    push(...labels.map((v): Cell => ({ v, s: 'head' })));
  };

  push({ v: copy.title(projectName), s: 'title' });
  merges.push('A1:H1');
  heights[1] = 26;
  push('', { v: copy.quoteNumber, s: 'label' }, { v: quoteNumber, s: 'text' });
  push(
    '',
    { v: copy.validityDays, s: 'label' },
    { v: QUOTE_VALIDITY_DAYS, s: 'text' },
  );
  push(
    '',
    { v: '通貨 / 税', s: 'label' },
    { v: '日本円（JPY）· 税抜', s: 'text' },
  );
  push();

  // A. Parameters
  section('A. 見積パラメータ');
  header('#', 'パラメータ', '値', '単位 / 備考');
  merges.push(`D${at() - 1}:H${at() - 1}`);
  const paramRow = (
    index: number,
    label: string,
    value: Cell,
    note: string,
  ) => {
    merges.push(`D${at()}:H${at()}`);
    push(
      { v: index, s: 'textCenter' },
      { v: label, s: 'text' },
      value,
      { v: note, s: 'text' },
      ...Array<Cell>(4).fill({ v: null, s: 'text' }),
    );
  };
  let n = 0;
  paramRow(
    ++n,
    '対象コード行数',
    { v: result.codeLines, s: 'input' },
    `プログラム ${result.programs} 本 + 共通コード ${result.sharedLines.toLocaleString('en-US')} 行`,
  );
  paramRow(
    ++n,
    '1 人月の人日',
    { v: base.coding.daysPerMM, s: 'input' },
    '人日 / 人月',
  );
  paramRow(
    ++n,
    'AI 削減率（DD・コーディング）',
    { v: params.aiCode / 100, s: 'inputPct' },
    'BD は削減対象外',
  );
  paramRow(
    ++n,
    'AI 削減率（テスト）',
    { v: params.aiTest / 100, s: 'inputPct' },
    'UT / IT / UAT',
  );
  paramRow(
    ++n,
    '開発者数',
    { v: params.devs, s: 'input' },
    '名 · 期間の計算に使用',
  );
  for (const item of [
    ...QUOTE_SCOPE_ITEMS.doc,
    ...QUOTE_SCOPE_ITEMS.test,
  ] as const) {
    const excluded = params.excluded.includes(item);
    paramRow(
      ++n,
      `${item} の比率`,
      { v: base.weights[item] / 100, s: 'inputPct' },
      excluded
        ? '見積対象外'
        : `コーディング = 100% に対する比率（${copy.items[item]}）`,
    );
  }
  for (const key of ['pm', 'brse', 'comtor'] as const) {
    paramRow(
      ++n,
      `${copy.roles[key]} の比率`,
      { v: params.pct[key] / 100, s: 'inputPct' },
      '開発工数（ドキュメント + コーディング + テスト）に対する比率',
    );
  }
  paramRow(
    ++n,
    `${copy.roles.sa}の単価`,
    { v: params.rate.sa, s: 'inputYen' },
    '円 / 人月',
  );
  paramRow(
    ++n,
    `${copy.roles.dev}の単価`,
    { v: params.rate.dev, s: 'inputYen' },
    '円 / 人月',
  );
  for (const key of ['pm', 'brse', 'comtor'] as const) {
    paramRow(
      ++n,
      `${copy.roles[key]} の単価`,
      { v: params.rate[key], s: 'inputYen' },
      '円 / 人月',
    );
  }
  push();

  // B. Work items.
  section('B. 作業項目別の工数と金額');
  header(
    '#',
    'グループ',
    '作業項目',
    '根拠',
    '役割',
    '工数\n（人月）',
    '単価（円）',
    '金額（円）',
  );
  const subtotalRows: number[] = [];
  let itemNo = 0;
  for (const group of GROUPS) {
    const first = at();
    for (const id of group.items) {
      const item = itemOf(id);
      const scoped = scopeItems.find((item) => item === id);
      const weight = scoped ? base.weights[scoped] : 0;
      const basis =
        id === 'coding'
          ? '要素別人日の合計（上の表）→ AI 削減後'
          : id === 'pm' || id === 'brse' || id === 'comtor'
            ? `${params.pct[id]}% × 開発工数`
            : `コーディング基準 × ${weight}%${id === 'BD' ? '' : ' → AI 削減後'}${scoped && params.excluded.includes(scoped) ? '（対象外）' : ''}`;
      const row = at();
      push(
        { v: ++itemNo, s: 'textCenter' },
        { v: id === group.items[0] ? copy.phases[group.id] : null, s: 'label' },
        { v: copy.items[id], s: 'text' },
        { v: basis, s: 'text' },
        { v: ROLE_LABEL[id], s: 'textCenter' },
        { v: round2(item.mm), s: 'mm' },
        { v: rateOf(id), s: 'yen' },
        { v: Math.round(item.cost), s: 'yen', f: `F${row}*G${row}` },
      );
    }
    const last = at() - 1;
    if (last > first) merges.push(`B${first}:B${last}`);
    const sumMm = group.items.reduce(
      (sum, id) => sum + round2(itemOf(id).mm),
      0,
    );
    const sumCost = group.items.reduce(
      (sum, id) => sum + Math.round(itemOf(id).cost),
      0,
    );
    subtotalRows.push(at());
    merges.push(`B${at()}:E${at()}`);
    push(
      { v: null, s: 'subText' },
      { v: `小計 — ${copy.phases[group.id]}`, s: 'subText' },
      { v: null, s: 'subText' },
      { v: null, s: 'subText' },
      { v: null, s: 'subText' },
      { v: round2(sumMm), s: 'subMm', f: `SUM(F${first}:F${last})` },
      { v: null, s: 'subText' },
      { v: sumCost, s: 'subYen', f: `SUM(H${first}:H${last})` },
    );
  }
  const sumOf = (column: 'F' | 'H') =>
    subtotalRows.map((row) => `${column}${row}`).join('+');
  const totalRow = at();
  merges.push(`B${totalRow}:E${totalRow}`);
  push(
    { v: null, s: 'totalText' },
    { v: copy.total, s: 'totalText' },
    { v: null, s: 'totalText' },
    { v: null, s: 'totalText' },
    { v: null, s: 'totalText' },
    { v: round2(result.totalMM), s: 'totalMm', f: sumOf('F') },
    { v: null, s: 'totalText' },
    { v: Math.round(result.totalCost), s: 'totalYen', f: sumOf('H') },
  );
  const averageRow = at();
  merges.push(`B${averageRow}:E${averageRow}`);
  push(
    { v: null, s: 'text' },
    { v: '平均単価（円 / 人月）', s: 'label' },
    { v: null, s: 'text' },
    { v: null, s: 'text' },
    { v: null, s: 'text' },
    { v: null, s: 'text' },
    {
      v: result.totalMM > 0 ? Math.round(result.totalCost / result.totalMM) : 0,
      s: 'yen',
      f: `IF(F${totalRow}=0,0,H${totalRow}/F${totalRow})`,
    },
    { v: null, s: 'text' },
  );
  merges.push(`B${at()}:E${at()}`);
  push(
    { v: null, s: 'text' },
    { v: copy.duration, s: 'label' },
    { v: null, s: 'text' },
    { v: null, s: 'text' },
    { v: null, s: 'text' },
    { v: result.months, s: 'int' },
    { v: 'か月', s: 'text' },
    { v: `${params.devs} 名`, s: 'text' },
  );
  push();

  // C. By module.
  section('C. モジュール別');
  header(
    '#',
    'モジュール',
    'プログラム数',
    'コード行数',
    '平均複雑度',
    '工数\n（人月）',
    '構成比',
    '金額（円）',
  );
  const moduleFirst = at();
  result.modules.forEach((row, index) => {
    push(
      { v: index + 1, s: 'textCenter' },
      { v: moduleLabel(row.name), s: 'text' },
      { v: row.programs, s: 'int' },
      { v: row.codeLines, s: 'int' },
      { v: row.programs > 0 ? row.score : null, s: 'int' },
      { v: round2(row.mm), s: 'mm' },
      { v: row.share, s: 'pct' },
      { v: Math.round(row.cost), s: 'yen' },
    );
  });
  const moduleLast = at() - 1;
  push(
    { v: null, s: 'totalText' },
    { v: copy.total, s: 'totalText' },
    {
      v: result.programs,
      s: 'totalInt',
      f: `SUM(C${moduleFirst}:C${moduleLast})`,
    },
    {
      v: result.codeLines,
      s: 'totalInt',
      f: `SUM(D${moduleFirst}:D${moduleLast})`,
    },
    { v: result.averageScore, s: 'totalInt' },
    {
      v: round2(result.totalMM),
      s: 'totalMm',
      f: `SUM(F${moduleFirst}:F${moduleLast})`,
    },
    { v: null, s: 'totalText' },
    {
      v: Math.round(result.totalCost),
      s: 'totalYen',
      f: `SUM(H${moduleFirst}:H${moduleLast})`,
    },
  );
  push();
  section('前提と範囲');
  for (const line of copy.assumptions()) {
    merges.push(`B${at()}:H${at()}`);
    heights[at()] = 28;
    push('', { v: line, s: 'note' });
  }
  const summary: Sheet = {
    name: '見積サマリー',
    rows,
    widths: [5, 26, 36, 46, 12, 14, 14, 18],
    merges,
    heights,
  };

  // -------------------------------------------------------------------- WBS
  const wbs: Cell[][] = [];
  const itemColumns: QuoteItemId[] = [
    'BD',
    'DD',
    'coding',
    'UT',
    'IT',
    'UAT support',
  ];
  wbs.push([
    { v: `WBS — ${copy.programTitle} · ${result.programs}`, s: 'title' },
  ]);
  wbs.push([]);
  wbs.push(
    [
      '#',
      'プログラム',
      'モジュール',
      '難易度',
      'コード行数',
      ...itemColumns.map((id) => copy.items[id]),
      '小計\n（開発）',
      'PM / BrSE\nComtor',
      '合計\n（人月）',
      '金額（円）',
    ].map((v): Cell => ({ v, s: 'head' })),
  );
  const programRows = [
    ...result.rows.map((row) => ({
      name: row.name,
      module: moduleOf(row.projectPath),
      level: LEVELS[row.level],
      lines: row.codeLines,
      share: row.share,
      cost: row.cost,
    })),
    ...(result.sharedLines > 0
      ? [
          {
            name: copy.sharedModule,
            module: SHARED_MODULE,
            level: '–',
            lines: result.sharedLines,
            share:
              result.modules.find((m) => m.name === SHARED_MODULE)?.share ?? 0,
            cost:
              result.modules.find((m) => m.name === SHARED_MODULE)?.cost ?? 0,
          },
        ]
      : []),
  ];
  const first = 5;
  const last = first + programRows.length - 1;
  const sumColumn = (col: string) => `SUM(${col}${first}:${col}${last})`;
  const itemMm = (id: QuoteItemId, share: number) =>
    round2(itemOf(id).mm * share);
  const mgmtMm = (share: number) =>
    round2(
      (['pm', 'brse', 'comtor'] as const).reduce(
        (sum, id) => sum + itemOf(id).mm,
        0,
      ) * share,
    );
  const devMm = (share: number) =>
    round2(itemColumns.reduce((sum, id) => sum + itemOf(id).mm, 0) * share);
  wbs.push([
    { v: null, s: 'totalText' },
    { v: `${copy.total} — ${result.programs}`, s: 'totalText' },
    { v: null, s: 'totalText' },
    { v: null, s: 'totalText' },
    { v: result.codeLines, s: 'totalInt', f: sumColumn('E') },
    ...itemColumns.map((id, index): Cell => ({
      v: round2(itemOf(id).mm),
      s: 'totalMm',
      f: sumColumn(String.fromCharCode(70 + index)),
    })),
    { v: round2(result.devMM), s: 'totalMm', f: sumColumn('L') },
    { v: round2(result.mgmtMM), s: 'totalMm', f: sumColumn('M') },
    { v: round2(result.totalMM), s: 'totalMm', f: sumColumn('N') },
    { v: Math.round(result.totalCost), s: 'totalYen', f: sumColumn('O') },
  ]);
  programRows.forEach((row, index) => {
    const at = first + index;
    wbs.push([
      { v: index + 1, s: 'textCenter' },
      { v: row.name, s: 'text' },
      { v: moduleLabel(row.module), s: 'text' },
      { v: row.level, s: 'textCenter' },
      { v: row.lines, s: 'int' },
      ...itemColumns.map((id): Cell => ({ v: itemMm(id, row.share), s: 'mm' })),
      { v: devMm(row.share), s: 'mm', f: `SUM(F${at}:K${at})` },
      { v: mgmtMm(row.share), s: 'mm' },
      {
        v: round2(devMm(row.share) + mgmtMm(row.share)),
        s: 'mm',
        f: `L${at}+M${at}`,
      },
      { v: Math.round(row.cost), s: 'yen' },
    ]);
  });
  const wbsSheet: Sheet = {
    name: '工数一覧（WBS）',
    rows: wbs,
    widths: [5, 18, 22, 8, 12, 9, 9, 13, 9, 9, 11, 11, 12, 12, 16],
    merges: ['A1:O1'],
    heights: { 1: 26, 3: 34 },
    freeze: { rows: 4, columns: 2 },
  };

  return [summary, wbsSheet];
}
