// Fixed wording of the customer report (R2, R8, R9). Everything a TL or PM
// may want to reword lives here, so the builder and the workbook have no
// customer-facing sentences of their own. Japanese only (R2).

export { CUSTOMER_REPORT_VERSION } from '@portal/contracts';

// R8: the customer's own figures are not collected yet.
export const CUSTOMER_PROVIDED_COUNT = 'お客様提示数：未入力';
export const NOT_ANALYZED = '未解析（再解析が必要）';
export const NOT_APPLICABLE = '該当なし';
export const UNRATED = '未評価';
// The conventions behind the report total (the same text step 2 and the PDF
// show) come from contracts: REPORT_COUNTING_BASIS.
export const REPORT_BASIS_POINTER =
  '帳票数の算定基準は、このシート末尾の「算定基準」に記載しています。';
export const COMPLEXITY_LEVEL_RULE =
  '前提：複雑度は、処理の分岐数・実行行数・アクセステーブル数・動的SQL・呼び出し数を点数化し、低・中・高・非常に高の4段階に分類します。範囲は「1_規模概要」の算定基準に記載しています。';
export const SHARED_MODULE = '共通';
export const UNASSIGNED_MODULE = 'プログラム未所属';

// R9: next steps are a fixed paragraph, not computed.
export const RECOMMENDATIONS: readonly string[] = [
  '本報告は静的解析（ソースコードの機械的な読み取り）の結果です。数え方の前提は各シートに記載しています。',
  '「5_リスク・確認事項」の各項目（特に重要度「高」）について、必要に応じてソース等のご提供をお願いします。',
  '確認後の数値を基に、移行範囲・順序（移行単位）を協議し、見積りを確定します。',
];

export const SHEET_NAMES = [
  '1_規模概要',
  '2_複雑度',
  '3_依存関係',
  '4_データベース',
  '5_リスク・確認事項',
  '6_画面・帳票一覧',
] as const;

// "How to read this sheet" lines, 1-3 per sheet.
export const SHEET_NOTES: Record<(typeof SHEET_NAMES)[number], string[]> = {
  '1_規模概要': [
    'このシートの見方：ソースコードの解析結果から求めた移行対象の規模です。数値は解析時点のものです。',
    '共通モジュールのファイルは「共通」の行に1回だけ集計し、合計はソース全体の実数に一致します。',
    REPORT_BASIS_POINTER,
  ],
  '2_複雑度': [
    'このシートの見方：プログラムと帳票の複雑度の分布です。工数や金額ではありません。',
    COMPLEXITY_LEVEL_RULE,
  ],
  '3_依存関係': [
    'このシートの見方：複数のプログラムから参照される共通部品と、外部コンポーネント（COM/OCX）・Windows API の一覧です。',
    '参照元の多い共通部品は、変更時の影響範囲が広くなります。',
  ],
  '4_データベース': [
    'このシートの見方：アクセスされるテーブルと、動的SQL・文字列連結SQLの箇所数です。',
  ],
  '5_リスク・確認事項': [
    'このシートの見方：解析で判断できなかった点・注意が必要な点を、重要度別にまとめています。',
    '「お客様への確認事項」の列に、ご回答をお願いする内容を記載しています。',
  ],
  '6_画面・帳票一覧': [
    'このシートの見方：画面・帳票・バッチを1行ずつ列挙した一覧です。お客様の台帳との照合にご利用ください。',
    '帳票の設計ファイル：あり＝ソース内に定義ファイルがある、なし＝コード上に名前のみ（設計ファイルなし）。',
    '帳票の数え方は「1_規模概要」の算定基準によります（コード印刷・CSV・Excel出力は、該当するソースファイル1つを1件とする換算単位）。',
  ],
};

export const REPORT_KIND_LABELS: Record<string, string> = {
  'data-report': 'DataReport / ActiveReports',
  crystal: 'Crystal Reports',
  excel: 'CSV・Excel出力',
  print: 'コード印刷',
  'file-output': 'ファイル出力（帳票に含めない）',
  unknown: '帳票ライブラリのみ（帳票に含めない）',
};

export const LEVEL_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  'very-high': '非常に高',
  unrated: UNRATED,
};

export const CONFIDENCE_LABELS: Record<string, string> = {
  detected: '検出',
  referenced: '参照（定義ファイル不足）',
  suspected: '帳票に含めない',
};

export const REASON_LABELS: Record<string, string> = {
  SUSPECTED: '帳票に含めない',
  NO_PROCEDURE: '帳票を呼び出す処理を特定できないため評価不可',
  DESIGN_NOT_ANALYZED_FLOOR: '定義ファイル未解析のため最低でも「中」',
};

export const FACTOR_LABELS: Record<string, string> = {
  decisionPoints: '分岐数',
  executableLines: '実行行数',
  tables: 'アクセステーブル数',
  dynamicSql: '動的SQL',
  calls: '呼び出し数',
  'design-not-analyzed': '定義ファイル未解析',
};
