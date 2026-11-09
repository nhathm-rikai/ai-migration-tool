import type { CustomerReport } from './customer-report.js';
import {
  LEVEL_LABELS,
  NOT_ANALYZED,
  NOT_APPLICABLE,
  REPORT_KIND_LABELS,
  SHEET_NAMES,
  SHEET_NOTES,
  CUSTOMER_PROVIDED_COUNT,
  REFERENCE_VALUE,
} from './customer-report-constants.js';
import type { CellValue, Sheet, SheetColumn } from './xlsx-writer.js';

// Lays the customer report out as the six sheets of scope section 3. The JSON
// stays the source of truth; every sheet has a title, "how to read" notes and
// then its tables. A table without rows says 該当なし instead of staying empty.

const LEVELS = ['low', 'medium', 'high', 'very-high'] as const;

class SheetBuilder {
  readonly rows: CellValue[][] = [];
  readonly headingRows: number[] = [];
  readonly subHeaderRows: number[] = [];
  constructor(private readonly width: number) {}

  private pad(cells: readonly CellValue[]): CellValue[] {
    if (cells.length > this.width) throw new Error('row wider than sheet');
    return [
      ...cells,
      ...Array<CellValue>(this.width - cells.length).fill(null),
    ];
  }
  heading(title: string) {
    this.headingRows.push(this.rows.length);
    this.rows.push(this.pad([title]));
  }
  subHeader(labels: readonly string[]) {
    this.subHeaderRows.push(this.rows.length);
    this.rows.push(this.pad(labels));
  }
  row(...cells: CellValue[]) {
    this.rows.push(this.pad(cells));
  }
  // Rows of a table, or the 該当なし line.
  table(rows: readonly (readonly CellValue[])[]) {
    if (rows.length === 0) this.row(NOT_APPLICABLE);
    for (const row of rows) this.row(...row);
  }
}

const col = (header: string, width: number, wrap = false): SheetColumn => ({
  header,
  width,
  ...(wrap ? { wrap } : {}),
});

function sheetOf(
  name: (typeof SHEET_NAMES)[number],
  columns: SheetColumn[],
  built: SheetBuilder | readonly (readonly CellValue[])[],
  extra: Partial<Sheet> = {},
): Sheet {
  const isBuilder = built instanceof SheetBuilder;
  return {
    name,
    title: name.replace(/^\d_/, '') + '（アセスメント報告書）',
    notes: SHEET_NOTES[name],
    tabColor: 'FF1F3864',
    columns,
    rows: isBuilder ? built.rows : built,
    ...(isBuilder && built.headingRows.length > 0
      ? { headingRows: built.headingRows, filter: false }
      : {}),
    ...(isBuilder && built.subHeaderRows.length > 0
      ? { subHeaderRows: built.subHeaderRows }
      : {}),
    ...extra,
  };
}

const percent = (count: number, total: number) =>
  total === 0 ? 0 : Math.round((count / total) * 1000) / 10;

function sheet1(report: CustomerReport): Sheet {
  const { scale, source } = report;
  const origin = source.origin;
  const b = new SheetBuilder(8);
  b.heading('データの出所');
  if (origin) {
    b.row(
      'データ区分',
      origin.mode === 'demo'
        ? 'DEMO：同梱のサンプルデータです（お客様のシステムではありません）'
        : 'お客様ソースの解析結果',
    );
    b.row('プロジェクト', origin.projectName);
    b.row('解析ラン', origin.runId);
    b.row('解析結果', `${origin.artifactId} v${origin.artifactVersion}`);
    b.row('解析日時', origin.createdAt);
  }
  b.row('スナップショット', source.snapshotHash.slice(0, 12));
  b.row('報告書版', report.reportVersion);
  b.row('複雑度モデル', source.versions.complexityVersion, REFERENCE_VALUE);

  b.heading('規模');
  b.row(
    'プログラム数',
    scale.programs,
    `うち完全に解析 ${scale.completePrograms}`,
  );
  b.row('ファイル数', scale.files, `うち解析済みコード ${scale.analyzedFiles}`);
  b.row('コード行数', scale.codeLines, '共通ファイルは1回のみ集計');
  b.row('コメント行数', scale.commentLines);
  b.row('空白行数', scale.blankLines);
  b.row('物理行数', scale.physicalLines);
  b.row('プロシージャ数', scale.procedures);
  b.row(
    'DBテーブル数',
    scale.tablesView === null ? NOT_ANALYZED : scale.tables,
  );
  const sr = scale.screenReport;
  b.row(
    '画面',
    sr ? sr.screens : NOT_ANALYZED,
    sr ? `うち共通 ${sr.sharedScreens}（1回のみ集計）` : null,
  );
  b.row(
    '帳票（検出）',
    sr ? sr.reports.counted : NOT_ANALYZED,
    sr ? '検出＋参照。「疑い」は含みません' : null,
  );
  b.row(
    '帳票（疑い）',
    sr ? sr.reports.suspected : NOT_ANALYZED,
    sr
      ? `${sr.suspectedPrograms} プログラムに出力の可能性（合計に含まない）`
      : null,
  );
  b.row('バッチ', sr ? sr.batches : NOT_ANALYZED);
  b.row('画面・帳票（お客様提示）', CUSTOMER_PROVIDED_COUNT);

  b.heading('帳票の内訳（種別）');
  b.subHeader(['種別', '件数']);
  b.table(
    sr
      ? (
          Object.keys(REPORT_KIND_LABELS) as (keyof typeof sr.reports.byKind)[]
        ).map((kind) => [
          REPORT_KIND_LABELS[kind] ?? kind,
          sr.reports.byKind[kind],
        ])
      : [[NOT_ANALYZED]],
  );
  b.heading(`帳票の内訳（複雑度・${REFERENCE_VALUE}）`);
  b.subHeader(['複雑度', '件数', 'モデル版']);
  b.table(
    sr
      ? [...LEVELS, 'unrated' as const].map((level) => [
          LEVEL_LABELS[level] ?? level,
          sr.reports.byLevel[level],
          report.complexity.reportModelVersion,
        ])
      : [[NOT_ANALYZED]],
  );

  b.heading('モジュール別（共通は別行）');
  b.subHeader([
    'モジュール',
    'プログラム数',
    '画面',
    '帳票（検出）',
    '帳票（疑い）',
    'バッチ',
    'ファイル',
    'コード行数',
  ]);
  const count = (value: number) => (sr ? value : NOT_ANALYZED);
  b.table([
    ...report.modules.map((m) => [
      m.module,
      m.programs,
      count(m.screens),
      count(m.reports),
      count(m.suspectedReports),
      count(m.batches),
      m.files,
      m.codeLines,
    ]),
    ...(report.modules.length > 0
      ? [
          [
            '合計',
            report.modules.reduce((n, m) => n + m.programs, 0),
            sr ? sr.screens : NOT_ANALYZED,
            sr ? sr.reports.counted : NOT_ANALYZED,
            sr ? sr.reports.suspected : NOT_ANALYZED,
            sr ? sr.batches : NOT_ANALYZED,
            report.modules.reduce((n, m) => n + m.files, 0),
            report.modules.reduce((n, m) => n + m.codeLines, 0),
          ],
        ]
      : []),
  ]);

  b.heading('今後の進め方');
  for (const line of report.recommendations) b.row(line);

  return sheetOf(
    SHEET_NAMES[0],
    [
      col('項目', 28),
      col('値', 22),
      col('補足', 24),
      col('', 14),
      col('', 14),
      col('', 12),
      col('', 12),
      col('', 14),
    ],
    b,
    { boldFirstColumn: true },
  );
}

function sheet2(report: CustomerReport): Sheet {
  const { complexity } = report;
  const total = report.scale.programs;
  const b = new SheetBuilder(7);
  b.row('モデル', complexity.version, REFERENCE_VALUE);
  const levelRows: CellValue[][] = LEVELS.map((level) => {
    const value = complexity.levels[level];
    return value === null
      ? [LEVEL_LABELS[level] ?? level, '対象外（旧モデルにないレベル）', null]
      : [LEVEL_LABELS[level] ?? level, value, percent(value, total)];
  });
  levelRows.push([
    '未解析',
    complexity.notAnalyzed,
    percent(complexity.notAnalyzed, total),
  ]);
  b.heading('プログラムの複雑度の分布');
  b.subHeader(['レベル', 'プログラム数', '割合(%)']);
  b.table(total === 0 ? [] : levelRows);

  b.heading(`帳票の複雑度の分布（${REFERENCE_VALUE}）`);
  b.subHeader(['レベル', '帳票数', 'モデル版']);
  b.table(
    complexity.reportLevels
      ? [...LEVELS, 'unrated' as const].map((level) => [
          LEVEL_LABELS[level] ?? level,
          complexity.reportLevels?.[level] ?? 0,
          complexity.reportModelVersion,
        ])
      : [[NOT_ANALYZED]],
  );

  b.heading('複雑なプログラム上位20');
  b.subHeader([
    'プログラム',
    'モジュール',
    'レベル',
    '点数',
    'コード行数',
    '画面',
    '帳票',
  ]);
  b.table(
    complexity.top.map((p) => [
      p.program,
      p.module,
      LEVEL_LABELS[p.level] ?? p.level,
      p.score,
      p.codeLines,
      p.screens ?? NOT_ANALYZED,
      p.reports ?? NOT_ANALYZED,
    ]),
  );
  return sheetOf(
    SHEET_NAMES[1],
    [
      col('項目', 28),
      col('値', 26),
      col('補足', 14),
      col('', 10),
      col('', 14),
      col('', 10),
      col('', 10),
    ],
    b,
    { boldFirstColumn: true },
  );
}

function sheet3(report: CustomerReport): Sheet {
  const { dependencies } = report;
  const b = new SheetBuilder(4);
  b.heading('共通部品（参照プログラム数の多い順・上位15）');
  b.subHeader(['ファイル', '参照プログラム数', 'プロシージャ数', 'コード行数']);
  b.table(
    dependencies.shared.map((s) => [
      s.file,
      s.programs,
      s.procedures,
      s.codeLines,
    ]),
  );
  b.heading('外部コンポーネント（COM / OCX）');
  b.subHeader(['識別子', 'ファイル名', '説明', '参照プログラム数']);
  b.table(
    dependencies.components.map((c) => [
      (c.kind === 'reference' ? '【参照設定】' : '【コンポーネント】') +
        c.identifier,
      c.fileName,
      c.description,
      c.programs,
    ]),
  );
  b.heading('Windows API など外部ライブラリの関数');
  b.subHeader(['関数名', 'ライブラリ', '呼び出しプログラム数']);
  b.table(dependencies.apis.map((a) => [a.name, a.library, a.programs]));
  return sheetOf(
    SHEET_NAMES[2],
    [col('項目', 40), col('値', 24), col('補足', 30), col('', 18)],
    b,
    { boldFirstColumn: true },
  );
}

function sheet4(report: CustomerReport): Sheet {
  const { database } = report;
  const b = new SheetBuilder(3);
  b.heading(
    (report.scale.tablesView === 'raw'
      ? 'アクセスされるテーブル（ソース上の名称・上位30）'
      : 'アクセスされるテーブル（名称統一後・上位30）') +
      (report.scale.tablesAssumed ? '※スキーマは仮定（DB管理者の確認前）' : ''),
  );
  b.subHeader([
    'テーブル',
    '参照プログラム数',
    '操作（C=作成 R=参照 U=更新 D=削除 X=DDL）',
  ]);
  b.table(database.tables.map((t) => [t.table, t.programs, t.operations]));
  b.heading(
    `動的SQL・文字列連結SQLの箇所数（動的 ${database.dynamicSql} / 連結 ${database.concatenatedSql ?? NOT_ANALYZED}）`,
  );
  b.subHeader([
    'モジュール',
    '動的SQL（テーブル名が実行時決定）',
    '文字列連結SQL',
  ]);
  b.table(
    database.sqlByModule.map((m) => [
      m.module,
      m.dynamicSql,
      m.concatenatedSql ?? NOT_ANALYZED,
    ]),
  );
  return sheetOf(
    SHEET_NAMES[3],
    [col('項目', 36), col('値', 30), col('補足', 44)],
    b,
    { boldFirstColumn: true },
  );
}

function sheet5(report: CustomerReport): Sheet {
  const rows: CellValue[][] = report.risks.map((risk) => [
    risk.category,
    risk.severity,
    risk.count,
    risk.content,
    risk.programs.length === 0
      ? '（全体）'
      : risk.programs.join('、') +
        (risk.otherPrograms > 0 ? ` 他${risk.otherPrograms}件` : ''),
    risk.confirmation,
  ]);
  if (rows.length === 0)
    rows.push([NOT_APPLICABLE, null, null, null, null, null]);
  return sheetOf(
    SHEET_NAMES[4],
    [
      col('区分', 18),
      col('重要度', 9),
      col('件数', 8),
      col('内容', 50, true),
      col('影響プログラム', 36, true),
      col('お客様への確認事項', 50, true),
    ],
    rows,
  );
}

function sheet6(report: CustomerReport): Sheet {
  const columns = [
    col('区分', 8),
    col('種別', 22),
    col('プログラム', 24),
    col('モジュール', 22),
    col('名称', 22),
    col('ファイル', 36),
    col('行', 7),
    col('信頼度', 22),
    col('複雑度', 12),
    col('点数', 8),
    col('モデル版', 26),
    col('評価要因', 40),
    col('備考', 44),
  ];
  const rows: CellValue[][] =
    report.scale.screenReport === null
      ? [[NOT_ANALYZED, ...Array<CellValue>(columns.length - 1).fill(null)]]
      : report.items.map((item) => [
          item.type,
          item.kindLabel,
          item.programs,
          item.module,
          item.name,
          item.file,
          item.line,
          item.confidenceLabel,
          item.levelLabel,
          item.score,
          item.modelVersion,
          item.factors,
          item.type === '帳票' && item.level !== 'unrated'
            ? [item.note, REFERENCE_VALUE].filter(Boolean).join('；')
            : item.note,
        ]);
  if (rows.length === 0)
    rows.push([
      NOT_APPLICABLE,
      ...Array<CellValue>(columns.length - 1).fill(null),
    ]);
  return sheetOf(SHEET_NAMES[5], columns, rows);
}

export function customerReportSheets(report: CustomerReport): Sheet[] {
  return [
    sheet1(report),
    sheet2(report),
    sheet3(report),
    sheet4(report),
    sheet5(report),
    sheet6(report),
  ];
}
