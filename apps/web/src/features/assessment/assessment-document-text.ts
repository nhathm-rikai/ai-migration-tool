import {
  TABLE_SCHEMA_STATEMENT,
  type TableSchemaState,
} from '@portal/contracts';
// Fixed Japanese wording of the customer PDF (R2): the document goes to the
// customer, so it does not follow the screen language. Counting rules in the
// appendix mirror docs/engineering/specs/source-inventory.md section 6.

export const DOC_TITLE = 'アセスメント報告書';
export const DEMO_NOTICE =
  'DEMO：同梱のサンプルデータです（お客様のシステムではありません）';
export const NOT_ANALYZED = '未解析（再解析が必要）';
export const NOT_APPLICABLE = '該当なし';
export const REFERENCE = '参考値';
export const ALL_IN_EXCEL = '全件は Excel 参照';

export const COVER = {
  project: '対象プロジェクト',
  analysedOn: '分析日',
  issuedOn: '出力日',
  scope: '対象範囲',
  scopeValue: (programs: string, lines: string) =>
    `プログラム ${programs} 本／ソース ${lines} 行（共通ファイルは1回のみ集計）`,
  origin: 'データの出所',
  originValue: (artifact: string, version: number, snapshot: string) =>
    `解析結果 ${artifact} v${version}／スナップショット ${snapshot}`,
  models: '解析モデル',
  contents: '目次',
};

export const SECTIONS = {
  scale: '1. 規模概要',
  complexity: '2. 複雑度',
  dependencies: '3. 依存関係',
  database: '4. データベース',
  risks: '5. リスク・確認事項',
  items: '6. 画面・帳票一覧',
  next: '今後の進め方',
  appendix: '付録',
} as const;

export const KPI = {
  screens: '画面',
  screensSub: (shared: string) => `うち共通 ${shared}`,
  reports: '帳票（検出）',
  reportsSub: (programs: string, suspected: string) =>
    `疑い ${suspected} 件（${programs} プログラム）は合計に含まない`,
  batches: 'バッチ',
  batchesSub: 'フォームなし・Sub Main 起動',
  programs: 'プログラム',
  programsSub: (complete: string) => `うち完全に解析 ${complete}`,
  lines: 'コード行数',
  linesSub: (physical: string) => `物理行数 ${physical}`,
  procedures: 'プロシージャ',
  tables: 'DBテーブル',
  customerCount: 'お客様提示数：未入力',
};

export const REPORT_KINDS: Record<string, string> = {
  'data-report': 'DataReport / ActiveReports',
  crystal: 'Crystal Reports',
  excel: 'Excel出力（疑い）',
  print: '印刷（疑い）',
  'file-output': 'ファイル出力（疑い）',
  unknown: '種別不明（疑い）',
};

export const LEVELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  'very-high': '非常に高',
  unrated: '未評価',
};

export const TABLE = {
  module: 'モジュール',
  programs: 'プログラム数',
  screens: '画面',
  reports: '帳票（検出）',
  suspected: '帳票（疑い）',
  batches: 'バッチ',
  files: 'ファイル',
  lines: 'コード行数',
  total: '合計',
  kind: '種別',
  count: '件数',
  level: '複雑度',
  score: '点数',
  program: 'プログラム',
  file: 'ファイル',
  procedures: 'プロシージャ数',
  refPrograms: '参照プログラム数',
  identifier: '識別子',
  fileName: 'ファイル名',
  description: '説明',
  function: '関数名',
  library: 'ライブラリ',
  callers: '呼び出しプログラム数',
  dbTable: 'テーブル',
  operations: '操作',
  dynamicSql: '動的SQL',
  concatSql: '文字列連結SQL',
  category: '区分',
  severity: '重要度',
  content: '内容',
  confirmation: 'お客様への確認事項',
  type: '区分',
  name: '名称',
  location: 'ファイル:行',
  confidence: '信頼度',
  affected: '影響プログラム',
  other: (count: string) => `他${count}件`,
  wholeSystem: '（全体）',
};

export const CHARTS = {
  programLevels: 'プログラムの複雑度分布',
  reportLevels: '帳票の複雑度分布',
  notAnalyzed: '未解析',
  notApplicable: '対象外（旧モデル）',
  top: '複雑なプログラム（上位）',
  reportNote: (version: string | null) =>
    `帳票の複雑度は${REFERENCE}です${version ? `（モデル ${version}）` : ''}。定義ファイル未解析の帳票は最低でも「中」、評価できないものは「未評価」と表示します。`,
  programNote: (version: string) =>
    `プログラムの複雑度は${REFERENCE}です（モデル ${version}）。工数・金額ではありません。`,
};

export const SECTION_NOTES = {
  scale:
    '解析結果から求めた移行対象の規模です。「疑い」の帳票は出力の可能性がある箇所で、帳票数の合計には含みません。',
  dependencies:
    '複数のプログラムから参照される共通部品と、外部コンポーネント・外部ライブラリの一覧です。',
  // The statement about the table names comes from the report's own state
  // (tableSchemaState), the same one the appendix and the Excel note use.
  database: (state: TableSchemaState) =>
    `アクセスされるテーブルと、動的SQL・文字列連結SQLの箇所数です。${TABLE_SCHEMA_STATEMENT[state].note}`,
  risks:
    '解析で判断できなかった点・注意が必要な点を重要度別にまとめています。ご回答をお願いする内容を右端に記載しています。',
  items: (shown: string, total: string) =>
    `帳票・バッチ・画面の順に最大${shown}件を表示しています（全${total}件）。${ALL_IN_EXCEL}。`,
};

export const APPENDIX = {
  // The last definition (DB table count) depends on the report: see
  // appendixDefinitions().
  definitionsTitle: '指標の定義',
  definitions: [
    'コード行数：コメント・空白・フォームデザイン定義を除いた行数。複数のプログラムが共通で使うファイルは1回のみ集計します。',
    '物理行数：ファイルの全行数。プロシージャ：Sub・Function・Property の数。',
    'モジュール：プロジェクトファイルのあるフォルダ。複数のプログラムが共有するファイルは「共通」に集計します。',
  ],
  countingTitle: '画面・帳票・バッチの数え方',
  counting: [
    '画面：プロジェクトが宣言するフォーム（ユーザードキュメント含む）のファイル数。複数のプログラムで使う画面は共通として1回のみ数えます。ファイルが不足・解析不可の画面も数え、備考に記載します。',
    'バッチ：フォームを持たず、起動オブジェクトが Sub Main のプログラム。フォームがあるプログラムは画面として数えます。',
    '帳票（検出）：Crystal Reports の .rpt をコード上で指定している箇所（定義ファイルがあれば「検出」、名称のみなら「参照」）と、DataReport / ActiveReports の定義。「帳票（検出）」は検出と参照の合計です。',
    '帳票（疑い）：Excel 出力、印刷、ファイル出力（Open … For Output/Append）を行う可能性のある箇所。様式の数が分からないため合計に含めず、別に表示します。',
    '数え方はソースコードの機械的な読み取り（字句解析）です。実行時に決まるファイル名や、コード以外で行う出力は検出できません。',
  ],
  complexityTitle: '帳票の複雑度（参考値）',
  complexity: [
    '帳票ごとに、帳票を呼び出す処理の分岐数・実行行数・アクセステーブル数・動的SQLの有無・他の処理の呼び出し数を点数化し、低・中・高・非常に高の4段階に分類します。',
    '定義ファイル（.rpt・.dsr）の中身は未解析のため、呼び出しコードのみを評価し、最低でも「中」とします。評価できない帳票（疑い・呼び出し処理を特定できないもの）は「未評価」です。',
    '複雑度は移行の難しさの目安であり、工数や金額を示すものではありません。',
  ],
  modelsTitle: '解析モデルの版',
};

// The definitions of the appendix; the table-count line follows the same
// state as section 4.
export const appendixDefinitions = (state: TableSchemaState): string[] => [
  ...APPENDIX.definitions,
  TABLE_SCHEMA_STATEMENT[state].definition,
];
