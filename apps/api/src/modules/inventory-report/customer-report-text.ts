import type { CustomerReportLang } from '@portal/contracts';

// Every customer-facing sentence of the customer report (Excel, JSON, and the
// PDF that is drawn from the JSON) in the two report languages: Japanese (the
// default, for the customer) and Vietnamese (for review on our side). Both
// languages have the same keys (the type forces it; a test compares the risk
// catalog). The builder and the workbook have no sentences of their own.
// Internal codes (risk severity 高/中/低, item type 画面/帳票/...) stay Japanese
// in code and are translated at the end with `severity` and `itemType`.
// The report states what is missing; it does not ask the customer for
// anything (no "next steps", no "please provide" column).

export type Lang = CustomerReportLang;
export const LANGS: readonly Lang[] = ['ja', 'vi'];

export type SeverityCode = '高' | '中' | '低';
export type ItemTypeCode = '画面' | '帳票' | 'バッチ' | '出力機能';

export type ReportText = {
  notAnalyzed: string;
  notApplicable: string;
  unrated: string;
  sharedModule: string;
  unassignedModule: string;
  // Sheet names (Excel limit: 31 characters, none of []:*?/\).
  sheetNames: readonly [string, string, string, string, string, string, string];
  sheetNotes: readonly (readonly string[])[];
  sheetTitleSuffix: string;
  reportKindLabels: Record<string, string>;
  levelLabels: Record<string, string>;
  confidenceLabels: Record<string, string>;
  reasonLabels: Record<string, string>;
  factorLabels: Record<string, string>;
  severity: Record<SeverityCode, string>;
  itemType: Record<ItemTypeCode, string>;
  templateStatus: { 'design-file': string; 'missing-file': string };
  originLabels: Record<string, string>;
  warningLabels: Record<string, string>;
  items: {
    sep: string;
    batchKind: string;
    screenKind: string;
    dataFileKind: string;
    dataFileConfidence: string;
    dataFileNote: string;
    morePrograms: (labels: readonly string[], more: number) => string;
  };
  wb: {
    kvHeader: readonly [string, string, string];
    // A date and time (UTC) in the style of the language.
    dateTime: (iso: string) => string;
    info: string;
    dataKind: string;
    demo: string;
    real: string;
    project: string;
    analysedOn: string;
    analysisNo: (version: number) => string;
    scale: string;
    programs: string;
    ofComplete: (count: number) => string;
    files: string;
    ofAnalyzed: (count: number) => string;
    codeLines: string;
    sharedOnce: string;
    commentLines: string;
    blankLines: string;
    physicalLines: string;
    procedures: string;
    dbTables: string;
    screens: string;
    ofShared: (count: number) => string;
    reportTotal: string;
    reportParts: (crystal: number, print: number, exports: number) => string;
    crystalRow: string;
    designSplit: (design: number, missing: number) => string;
    printRow: string;
    exportRow: string;
    dataFilesRow: string;
    excluded: (count: number) => string;
    batches: string;
    breakdownByKind: string;
    kindHeader: readonly [string, string];
    breakdownByLevel: string;
    levelHeader: readonly [string, string];
    byModule: string;
    moduleHeader: readonly string[];
    total: string;
    // Sheet 2
    programLevels: string;
    programLevelHeader: readonly [string, string, string];
    notAnalyzedLabel: string;
    notApplicableLevel: string;
    reportLevels: string;
    reportLevelHeader: readonly [string, string];
    topPrograms: string;
    topHeader: readonly string[];
    // Sheet 3
    sharedHeading: string;
    sharedHeader: readonly string[];
    componentsHeading: string;
    componentsHeader: readonly string[];
    ocxKind: string;
    referenceKind: string;
    apisHeading: string;
    apisHeader: readonly string[];
    // Sheet 4
    tablesRaw: string;
    tablesNormalized: string;
    schemaAssumed: string;
    tablesHeader: readonly string[];
    sqlHeading: (dynamic: number, concat: number | string) => string;
    sqlHeader: readonly string[];
    // Sheet 5
    riskColumns: readonly [string, string, string, string, string];
    wholeSystem: string;
    joinPrograms: string;
    otherPrograms: (count: number) => string;
    // Sheet 6
    itemColumns: readonly string[];
    designYes: string;
    designNo: string;
    dataFilesHeading: string;
    dataFilesHeader: readonly string[];
    // Sheet 7
    basisHeader: readonly [string, string];
  };
};

// 2026-11-10T01:53:26.814Z → parts of the date and the time (UTC).
const parts = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m
    ? {
        y: m[1] ?? '',
        mo: Number(m[2]),
        d: Number(m[3]),
        h: m[4] ?? '',
        mi: m[5] ?? '',
      }
    : null;
};

const JA: ReportText = {
  notAnalyzed: '未解析（再解析が必要）',
  notApplicable: '該当なし',
  unrated: '未評価',
  sharedModule: '共通',
  unassignedModule: 'プログラム未所属',
  sheetNames: [
    '1_規模概要',
    '2_複雑度',
    '3_依存関係',
    '4_データベース',
    '5_リスク',
    '6_画面・帳票一覧',
    '7_算定基準',
  ],
  sheetNotes: [
    [
      'このシートの見方：ソースコードの解析結果から求めた移行対象の規模です。数値は解析時点のものです。',
      '共通モジュールのファイルは「共通」の行に1回だけ集計し、合計はソース全体の実数に一致します。',
      '帳票数の算定基準は「7_算定基準」シートに記載しています。',
    ],
    [
      'このシートの見方：プログラムと帳票の複雑度の分布です。工数や金額ではありません。',
      '複雑度は、処理の分岐数・実行行数・アクセステーブル数・動的SQL・呼び出し数を点数化し、低・中・高・非常に高の4段階に分類します。範囲は「7_算定基準」に記載しています。',
    ],
    [
      'このシートの見方：複数のプログラムから参照される共通部品と、外部コンポーネント（COM/OCX）・Windows API の一覧です。',
      '参照元の多い共通部品は、変更時の影響範囲が広くなります。',
    ],
    [
      'このシートの見方：アクセスされるテーブルと、動的SQL・文字列連結SQLの箇所数です。',
    ],
    [
      'このシートの見方：解析で判断できなかった点・注意が必要な点を、重要度別にまとめています。',
    ],
    [
      'このシートの見方：画面・帳票・バッチを1行ずつ列挙した一覧です。ファイル出力（帳票に含めない）は表の下にまとめています。',
      '設計ファイル：あり＝ソース内に定義ファイルがある、なし＝コード上に名前のみ（Crystal／DataReport のみ）。',
      '帳票の数え方は「7_算定基準」によります（コード印刷・CSV・Excel出力は、該当するソースファイル1つを1件とする換算単位）。',
    ],
    [
      'このシートの見方：報告書の数値の前提となる算定基準（帳票の数え方・換算単位・複雑度の範囲）です。',
    ],
  ],
  sheetTitleSuffix: '（アセスメント報告書）',
  reportKindLabels: {
    'data-report': 'DataReport / ActiveReports',
    crystal: 'Crystal Reports',
    excel: 'CSV・Excel出力',
    print: 'コード印刷',
    'file-output': 'ファイル出力（帳票に含めない）',
    unknown: '帳票ライブラリのみ（帳票に含めない）',
  },
  levelLabels: {
    low: '低',
    medium: '中',
    high: '高',
    'very-high': '非常に高',
    unrated: '未評価',
  },
  confidenceLabels: {
    detected: '検出',
    referenced: '参照（定義ファイル不足）',
    suspected: '帳票に含めない',
  },
  reasonLabels: {
    SUSPECTED: '帳票に含めない',
    NO_PROCEDURE: '帳票を呼び出す処理を特定できないため評価不可',
    DESIGN_NOT_ANALYZED_FLOOR:
      '帳票定義（.rpt）が未解析のため、最低レベルは「中」です',
  },
  factorLabels: {
    decisionPoints: '分岐数',
    executableLines: '実行行数',
    tables: 'アクセステーブル数',
    dynamicSql: '動的SQL',
    calls: '呼び出し数',
    printDensity: '印刷・描画命令数',
    'design-not-analyzed': '定義ファイル未解析',
  },
  severity: { 高: '高', 中: '中', 低: '低' },
  itemType: {
    画面: '画面',
    帳票: '帳票',
    バッチ: 'バッチ',
    出力機能: '出力機能',
  },
  templateStatus: {
    'design-file': '設計ファイルあり',
    'missing-file': '設計ファイルなし',
  },
  originLabels: { print: 'コード印刷', export: 'CSV・Excel出力' },
  warningLabels: {
    SCREEN_FILE_MISSING: '画面ファイルがソースにありません',
    SCREEN_FILE_NOT_ANALYZED:
      '画面ファイルを解析できません（画面数には含みます）',
    REPORT_FILE_MISSING: '帳票定義ファイル(.rpt)がソースにありません',
  },
  items: {
    sep: '；',
    batchKind: 'バッチ（Sub Main 起動・画面なし）',
    screenKind: '画面（フォーム）',
    dataFileKind: 'ファイル出力（帳票に含めない）',
    dataFileConfidence: '帳票に含めない',
    dataFileNote: '算定基準：CSV・Excel以外のファイル出力は帳票に数えません。',
    morePrograms: (labels, more) => `${labels.join('、')} 他${more}件`,
  },
  wb: {
    kvHeader: ['項目', '値', '補足'],
    dateTime: (iso) => {
      const p = parts(iso);
      return p ? `${p.y}年${p.mo}月${p.d}日 ${p.h}:${p.mi}（UTC）` : iso;
    },
    info: '基本情報',
    dataKind: 'データ区分',
    demo: 'DEMO：同梱のサンプルデータです（お客様のシステムではありません）',
    real: 'お客様ソースの解析結果',
    project: 'プロジェクト',
    analysedOn: '解析日時',
    analysisNo: (version) => `解析 #${version}`,
    scale: '規模',
    programs: 'プログラム数',
    ofComplete: (count) => `うち完全に解析 ${count}`,
    files: 'ファイル数',
    ofAnalyzed: (count) => `うち解析済みコード ${count}`,
    codeLines: 'コード行数',
    sharedOnce: '共通ファイルは1回のみ集計',
    commentLines: 'コメント行数',
    blankLines: '空白行数',
    physicalLines: '物理行数',
    procedures: 'プロシージャ数',
    dbTables: 'DBテーブル数',
    screens: '画面',
    ofShared: (count) => `うち共通 ${count}（1回のみ集計）`,
    reportTotal: '帳票数（算定基準による）',
    reportParts: (crystal, print, exports) =>
      `Crystal ${crystal}／コード印刷 ${print}／CSV・Excel出力 ${exports}`,
    crystalRow: '　Crystal Reports / DataReport',
    designSplit: (design, missing) =>
      `設計ファイルあり ${design}／なし ${missing}`,
    printRow: '　コードによる印刷',
    exportRow: '　CSV・Excel出力',
    dataFilesRow: 'データファイル出力（帳票に含めない）',
    excluded: (count) => `ログ・一時ファイルとして除外 ${count} 件`,
    batches: 'バッチ',
    breakdownByKind: '帳票（作成方法別）',
    kindHeader: ['作成方法', '件数'],
    breakdownByLevel: '帳票（複雑度別）',
    levelHeader: ['複雑度', '件数'],
    byModule: 'モジュール別（共通は別行）',
    moduleHeader: [
      'モジュール',
      'プログラム数',
      '画面',
      '帳票',
      'バッチ',
      'ファイル',
      'コード行数',
    ],
    total: '合計',
    programLevels: 'プログラムの複雑度の分布',
    programLevelHeader: ['レベル', 'プログラム数', '割合(%)'],
    notAnalyzedLabel: '未解析',
    notApplicableLevel: '対象外',
    reportLevels: '帳票の複雑度の分布',
    reportLevelHeader: ['レベル', '帳票数'],
    topPrograms: '複雑なプログラム上位20',
    topHeader: [
      'プログラム',
      'モジュール',
      'レベル',
      '点数',
      'コード行数',
      '画面',
      '帳票',
    ],
    sharedHeading: '共通部品（参照プログラム数の多い順・上位15）',
    sharedHeader: [
      '共通ファイル',
      '参照プログラム数',
      'ファイル内のプロシージャ数',
      'ファイルのコード行数',
    ],
    componentsHeading: '外部コンポーネント（COM / OCX）',
    componentsHeader: ['名称', '種類', '説明', '使用プログラム数'],
    ocxKind: 'コントロール（OCX）',
    referenceKind: '参照設定（ライブラリ）',
    apisHeading: 'Windows API など外部ライブラリの関数',
    apisHeader: ['関数名', 'ライブラリ', '呼び出しプログラム数'],
    tablesRaw: 'アクセスされるテーブル（ソース上の名称・上位30）',
    tablesNormalized: 'アクセスされるテーブル（名称統一後・上位30）',
    schemaAssumed: '※スキーマは仮定（DB管理者の確認前）',
    tablesHeader: [
      'テーブル',
      '参照プログラム数',
      '操作（C=作成 R=参照 U=更新 D=削除 X=DDL）',
    ],
    sqlHeading: (dynamic, concat) =>
      `動的SQL・文字列連結SQLの箇所数（動的 ${dynamic} / 連結 ${concat}）`,
    sqlHeader: [
      'モジュール',
      '動的SQL（テーブル名が実行時決定）',
      '文字列連結SQL',
    ],
    riskColumns: ['区分', '重要度', '件数', '内容', '影響プログラム'],
    wholeSystem: '（全体）',
    joinPrograms: '、',
    otherPrograms: (count) => ` 他${count}件`,
    itemColumns: [
      '種別',
      '名称',
      'プログラム',
      'モジュール',
      'ファイル',
      '行',
      '設計ファイル',
      '複雑度',
      '使用箇所数',
      '備考',
    ],
    designYes: 'あり',
    designNo: 'なし',
    dataFilesHeading: 'ファイル出力（帳票に含めない）',
    dataFilesHeader: ['プログラム', 'ファイル', '行', 'プロシージャ'],
    basisHeader: ['項目', '内容'],
  },
};

const VI: ReportText = {
  notAnalyzed: 'Chưa phân tích (cần phân tích lại)',
  notApplicable: 'Không có',
  unrated: 'Chưa đánh giá',
  sharedModule: 'Dùng chung',
  unassignedModule: 'Chưa thuộc program nào',
  sheetNames: [
    '1_Quy mô',
    '2_Độ phức tạp',
    '3_Phụ thuộc',
    '4_Cơ sở dữ liệu',
    '5_Rủi ro',
    '6_Màn hình-Report',
    '7_Cơ sở tính',
  ],
  sheetNotes: [
    [
      'Cách đọc sheet: quy mô cần migrate, tính từ kết quả phân tích mã nguồn. Số liệu là tại thời điểm phân tích.',
      'File của module dùng chung chỉ được tính một lần ở dòng "Dùng chung"; tổng khớp với số thực của toàn bộ mã nguồn.',
      'Cơ sở tính số report ghi ở sheet "7_Cơ sở tính".',
    ],
    [
      'Cách đọc sheet: phân bố độ phức tạp của program và report. Đây không phải effort hay chi phí.',
      'Độ phức tạp được chấm điểm theo số nhánh, số dòng thực thi, số bảng truy cập, SQL động và số lời gọi, rồi chia 4 mức: Thấp, Trung bình, Cao, Rất cao. Phạm vi nêu ở sheet "7_Cơ sở tính".',
    ],
    [
      'Cách đọc sheet: danh sách thành phần dùng chung được nhiều program tham chiếu, thành phần ngoài (COM/OCX) và Windows API.',
      'Thành phần dùng chung có nhiều nơi tham chiếu thì phạm vi ảnh hưởng khi thay đổi rộng hơn.',
    ],
    [
      'Cách đọc sheet: các bảng được truy cập và số vị trí SQL động / SQL ghép chuỗi.',
    ],
    [
      'Cách đọc sheet: tổng hợp theo mức độ những điểm chưa xác định được qua phân tích hoặc cần lưu ý.',
    ],
    [
      'Cách đọc sheet: danh sách từng dòng màn hình, report, batch. Ghi file (không tính vào report) nằm ở bảng dưới cùng.',
      'File thiết kế: Có = file định nghĩa có trong mã nguồn; Thiếu file = chỉ có tên trong code (chỉ Crystal / DataReport).',
      'Cách đếm report theo sheet "7_Cơ sở tính" (in bằng code và xuất CSV/Excel: mỗi file mã nguồn liên quan là một đơn vị quy đổi).',
    ],
    [
      'Cách đọc sheet: các quy ước đằng sau số liệu của báo cáo (cách đếm report, đơn vị quy đổi, phạm vi độ phức tạp).',
    ],
  ],
  sheetTitleSuffix: ' (Báo cáo Assessment)',
  reportKindLabels: {
    'data-report': 'DataReport / ActiveReports',
    crystal: 'Crystal Reports',
    excel: 'Xuất CSV/Excel',
    print: 'In bằng code',
    'file-output': 'Ghi file (không tính vào report)',
    unknown: 'Chỉ có thư viện report (không tính vào report)',
  },
  levelLabels: {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
    'very-high': 'Rất cao',
    unrated: 'Chưa đánh giá',
  },
  confidenceLabels: {
    detected: 'Phát hiện',
    referenced: 'Tham chiếu (thiếu file định nghĩa)',
    suspected: 'Không tính vào report',
  },
  reasonLabels: {
    SUSPECTED: 'Không tính vào report',
    NO_PROCEDURE:
      'Không xác định được procedure tạo report nên không đánh giá được',
    DESIGN_NOT_ANALYZED_FLOOR:
      'Chưa phân tích thiết kế .rpt nên mức tối thiểu là Trung bình',
  },
  factorLabels: {
    decisionPoints: 'Số nhánh',
    executableLines: 'Số dòng thực thi',
    tables: 'Số bảng truy cập',
    dynamicSql: 'SQL động',
    calls: 'Số lời gọi',
    printDensity: 'Số lệnh in/vẽ',
    'design-not-analyzed': 'Chưa phân tích file thiết kế',
  },
  severity: { 高: 'Cao', 中: 'Trung bình', 低: 'Thấp' },
  itemType: {
    画面: 'Màn hình',
    帳票: 'Report',
    バッチ: 'Batch',
    出力機能: 'Ghi file dữ liệu',
  },
  templateStatus: {
    'design-file': 'Có file thiết kế',
    'missing-file': 'Thiếu file thiết kế',
  },
  originLabels: { print: 'In bằng code', export: 'Xuất CSV/Excel' },
  warningLabels: {
    SCREEN_FILE_MISSING: 'Không có file màn hình trong mã nguồn',
    SCREEN_FILE_NOT_ANALYZED:
      'Không phân tích được file màn hình (vẫn tính vào số màn hình)',
    REPORT_FILE_MISSING:
      'Không có file định nghĩa report (.rpt) trong mã nguồn',
  },
  items: {
    sep: '; ',
    batchKind: 'Batch (khởi động bằng Sub Main, không có màn hình)',
    screenKind: 'Màn hình (form)',
    dataFileKind: 'Ghi file (không tính vào report)',
    dataFileConfidence: 'Không tính vào report',
    dataFileNote:
      'Cơ sở tính: ghi file không phải CSV/Excel không được tính là report.',
    morePrograms: (labels, more) =>
      `${labels.join(', ')} và ${more} program khác`,
  },
  wb: {
    kvHeader: ['Hạng mục', 'Giá trị', 'Ghi chú'],
    dateTime: (iso) => {
      const p = parts(iso);
      return p
        ? `${String(p.d).padStart(2, '0')}/${String(p.mo).padStart(2, '0')}/${p.y} ${p.h}:${p.mi} (UTC)`
        : iso;
    },
    info: 'Thông tin',
    dataKind: 'Loại dữ liệu',
    demo: 'DEMO: dữ liệu mẫu đi kèm (không phải hệ thống của khách hàng)',
    real: 'Kết quả phân tích mã nguồn của khách hàng',
    project: 'Dự án',
    analysedOn: 'Thời điểm phân tích',
    analysisNo: (version) => `Lần phân tích #${version}`,
    scale: 'Quy mô',
    programs: 'Số program',
    ofComplete: (count) => `trong đó phân tích đầy đủ ${count}`,
    files: 'Số file',
    ofAnalyzed: (count) => `trong đó file code đã phân tích ${count}`,
    codeLines: 'Số dòng code',
    sharedOnce: 'File dùng chung chỉ tính một lần',
    commentLines: 'Số dòng comment',
    blankLines: 'Số dòng trống',
    physicalLines: 'Số dòng vật lý',
    procedures: 'Số procedure',
    dbTables: 'Số bảng DB',
    screens: 'Màn hình',
    ofShared: (count) => `trong đó dùng chung ${count} (tính một lần)`,
    reportTotal: 'Report theo quy ước Assessment',
    reportParts: (crystal, print, exports) =>
      `Crystal ${crystal} / In bằng code ${print} / Xuất CSV/Excel ${exports}`,
    crystalRow: '　Crystal Reports / DataReport',
    designSplit: (design, missing) =>
      `Có file thiết kế ${design} / Thiếu ${missing}`,
    printRow: '　In bằng code',
    exportRow: '　Xuất CSV/Excel',
    dataFilesRow: 'Ghi file dữ liệu (không tính vào report)',
    excluded: (count) => `Đã loại ${count} chỗ ghi log/file tạm`,
    batches: 'Batch',
    breakdownByKind: 'Report theo cách tạo',
    kindHeader: ['Cách tạo', 'Số lượng'],
    breakdownByLevel: 'Report theo độ phức tạp',
    levelHeader: ['Độ phức tạp', 'Số lượng'],
    byModule: 'Theo module (dùng chung là dòng riêng)',
    moduleHeader: [
      'Module',
      'Số program',
      'Màn hình',
      'Report',
      'Batch',
      'Số file',
      'Số dòng code',
    ],
    total: 'Tổng',
    programLevels: 'Phân bố độ phức tạp của program',
    programLevelHeader: ['Mức', 'Số program', 'Tỷ lệ (%)'],
    notAnalyzedLabel: 'Chưa phân tích',
    notApplicableLevel: 'Không áp dụng',
    reportLevels: 'Phân bố độ phức tạp của report',
    reportLevelHeader: ['Mức', 'Số report'],
    topPrograms: 'Top 20 program phức tạp',
    topHeader: [
      'Program',
      'Module',
      'Mức',
      'Điểm',
      'Số dòng code',
      'Màn hình',
      'Report',
    ],
    sharedHeading:
      'Thành phần dùng chung (nhiều program tham chiếu nhất, top 15)',
    sharedHeader: [
      'File dùng chung',
      'Số program tham chiếu',
      'Số procedure trong file',
      'Số dòng code của file',
    ],
    componentsHeading: 'Thành phần ngoài (COM / OCX)',
    componentsHeader: ['Tên', 'Loại', 'Mô tả', 'Số program dùng'],
    ocxKind: 'Control (OCX)',
    referenceKind: 'Thư viện tham chiếu',
    apisHeading: 'Hàm của thư viện ngoài như Windows API',
    apisHeader: ['Tên hàm', 'Thư viện', 'Số program gọi'],
    tablesRaw: 'Bảng được truy cập (tên theo mã nguồn, top 30)',
    tablesNormalized: 'Bảng được truy cập (sau khi thống nhất tên, top 30)',
    schemaAssumed: ' *Schema là giả định (quản trị viên DB chưa xác nhận)',
    tablesHeader: [
      'Bảng',
      'Số program tham chiếu',
      'Thao tác (C=tạo R=đọc U=sửa D=xóa X=DDL)',
    ],
    sqlHeading: (dynamic, concat) =>
      `Số vị trí SQL động / SQL ghép chuỗi (động ${dynamic} / ghép ${concat})`,
    sqlHeader: [
      'Module',
      'SQL động (tên bảng quyết định lúc chạy)',
      'SQL ghép chuỗi',
    ],
    riskColumns: [
      'Phân loại',
      'Mức độ',
      'Số lượng',
      'Nội dung',
      'Program bị ảnh hưởng',
    ],
    wholeSystem: '(Toàn hệ thống)',
    joinPrograms: ', ',
    otherPrograms: (count) => ` và ${count} program khác`,
    itemColumns: [
      'Loại',
      'Tên',
      'Program',
      'Module',
      'File',
      'Dòng',
      'File thiết kế',
      'Độ phức tạp',
      'Số nơi dùng',
      'Ghi chú',
    ],
    designYes: 'Có',
    designNo: 'Thiếu file',
    dataFilesHeading: 'Ghi file dữ liệu (không tính vào report)',
    dataFilesHeader: ['Program', 'File', 'Dòng', 'Procedure'],
    basisHeader: ['Mục', 'Nội dung'],
  },
};

const TEXT: Record<Lang, ReportText> = { ja: JA, vi: VI };

export const reportText = (lang: Lang): ReportText => TEXT[lang];
