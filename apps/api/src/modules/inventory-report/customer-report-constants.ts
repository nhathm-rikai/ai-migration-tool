// Fixed wording of the customer report (R2, R8, R9). Everything a TL or PM
// may want to reword lives here, so the builder and the workbook have no
// customer-facing sentences of their own. Japanese only (R2).

export const CUSTOMER_REPORT_VERSION = 'customer-assessment-report-v1';

// R8: the customer's own figures are not collected yet.
export const CUSTOMER_PROVIDED_COUNT = 'お客様提示数：未入力';
export const NOT_ANALYZED = '未解析（再解析が必要）';
export const NOT_APPLICABLE = '該当なし';
export const UNRATED = '未評価';
export const REFERENCE_VALUE = '参考値';
export const SHARED_MODULE = '共通';
export const UNASSIGNED_MODULE = 'プログラム未所属';

// R9: next steps are a fixed paragraph, not computed.
export const RECOMMENDATIONS: readonly string[] = [
  '本報告は静的解析（ソースコードの機械的な読み取り）による参考値です。画面数・帳票数はお客様の台帳と照合のうえ、ご確認ください。',
  '「5_リスク・確認事項」の確認事項（特に重要度「高」）へのご回答をお願いします。ご回答により解析対象と数値を確定します。',
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
    '「疑い」の帳票は出力の可能性がある箇所の数で、帳票数の合計には含みません。',
  ],
  '2_複雑度': [
    'このシートの見方：プログラムと帳票の複雑度の分布です。複雑度は参考分類で、工数や金額ではありません。',
    '帳票の複雑度は、帳票を呼び出す処理の分岐・行数・アクセステーブル・動的SQL・呼び出し数から機械的に評価しています。',
  ],
  '3_依存関係': [
    'このシートの見方：複数のプログラムから参照される共通部品と、外部コンポーネント（COM/OCX）・Windows API の一覧です。',
    '参照元の多い共通部品は、変更時の影響範囲が広くなります。',
  ],
  '4_データベース': [
    'このシートの見方：アクセスされるテーブルと、動的SQL・文字列連結SQLの箇所数です。',
    'テーブル名は解析時に仮定したスキーマで統一しています。データベース管理者による確認が必要です。',
  ],
  '5_リスク・確認事項': [
    'このシートの見方：解析で判断できなかった点・注意が必要な点を、重要度別にまとめています。',
    '「お客様への確認事項」の列に、ご回答をお願いする内容を記載しています。',
  ],
  '6_画面・帳票一覧': [
    'このシートの見方：画面・帳票・バッチを1行ずつ列挙した一覧です。お客様の台帳との照合にご利用ください。',
    '帳票の信頼度：検出＝定義ファイルあり、参照＝コード上に名前のみ（定義ファイル不足）、疑い＝出力の可能性のみ。',
    '複雑度は参考値です。定義ファイル未解析の帳票は最低でも「中」とし、評価できないものは「未評価」と表示します。',
  ],
};

export const REPORT_KIND_LABELS: Record<string, string> = {
  'data-report': 'DataReport / ActiveReports',
  crystal: 'Crystal Reports',
  excel: 'Excel出力（疑い）',
  print: '印刷（疑い）',
  'file-output': 'ファイル出力（疑い）',
  unknown: '種別不明（疑い）',
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
  suspected: '疑い（要確認）',
};

export const REASON_LABELS: Record<string, string> = {
  SUSPECTED: '出力の可能性のみで、帳票様式の数は不明',
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
