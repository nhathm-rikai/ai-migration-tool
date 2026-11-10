import {
  REPORT_COUNTING_BASIS,
  REPORT_TOTAL_LABEL,
  REPORT_COUNTING_BASIS_TITLE,
  tableSchemaStatement,
  type CustomerReportLang,
  type TableSchemaState,
} from '@portal/contracts';

// Fixed wording of the customer PDF in the two report languages: Japanese
// (the default, for the customer) and Vietnamese (for review on our side). The
// document follows the language of the report JSON it is drawn from
// (report.language), so the PDF and the Excel agree. Both languages have the
// same keys (the type of VI is the type of JA). Counting rules in the
// appendix come from contracts (REPORT_COUNTING_BASIS), the same text as step
// 2 and the Excel report; docs/engineering/specs/source-inventory.md 6.2a.

export type DocLang = CustomerReportLang;

const JA = {
  title: 'アセスメント報告書',
  demoNotice:
    'DEMO：同梱のサンプルデータです（お客様のシステムではありません）',
  notAnalyzed: '未解析（再解析が必要）',
  notApplicable: '該当なし',
  allInExcel: '全件は Excel 参照',
  cover: {
    project: '対象プロジェクト',
    analysedOn: '分析日',
    issuedOn: '出力日',
    scope: '対象範囲',
    scopeValue: (programs: string, lines: string) =>
      `プログラム ${programs} 本／ソース ${lines} 行（共通ファイルは1回のみ集計）`,
    contents: '目次',
  },
  sections: {
    scale: '1. 規模概要',
    complexity: '2. 複雑度',
    dependencies: '3. 依存関係',
    database: '4. データベース',
    risks: '5. リスク・確認事項',
    items: '6. 画面・帳票一覧',
    next: '今後の進め方',
    appendix: '付録',
  },
  kpi: {
    screens: '画面',
    screensSub: (shared: string) => `うち共通 ${shared}`,
    reports: REPORT_TOTAL_LABEL.ja as string,
    reportsSub: (crystal: string, print: string, exports: string) =>
      `Crystal ${crystal} · コード印刷 ${print} · CSV・Excel出力 ${exports}`,
    reportsMissing: (missing: string) => `設計ファイルなし（.rpt）: ${missing}`,
    reportsJoin: '／',
    batches: 'バッチ',
    batchesSub: 'フォームなし・Sub Main 起動',
    programs: 'プログラム',
    programsSub: (complete: string) => `うち完全に解析 ${complete}`,
    lines: 'コード行数',
    linesSub: (physical: string) => `物理行数 ${physical}`,
    procedures: 'プロシージャ',
    tables: 'DBテーブル',
    customerCount: 'お客様提示数：未入力',
  },
  // Order of the list of screens and reports: reports first.
  itemOrder: { 帳票: 0, 出力機能: 1, バッチ: 2, 画面: 3 } as Record<
    string,
    number
  >,
  levels: {
    low: '低',
    medium: '中',
    high: '高',
    'very-high': '非常に高',
    unrated: '未評価',
  } as Record<string, string>,
  table: {
    module: 'モジュール',
    programs: 'プログラム数',
    screens: '画面',
    reports: '帳票',
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
    join: '、',
  },
  charts: {
    programLevels: 'プログラムの複雑度分布',
    reportLevels: '帳票の複雑度分布',
    notAnalyzed: '未解析',
    notApplicable: '対象外',
    top: '複雑なプログラム（上位）',
    reportNote:
      '帳票の複雑度は、帳票を作成するコードから算出しており、レイアウトの設計内容は含みません。Crystal 帳票は最低でも「中」、作成するプロシージャを特定できないものは「未評価」と表示します。',
    programNote:
      'プログラムの複雑度は移行の難しさの分類です。工数・金額ではありません。',
  },
  deps: {
    shared: '共通部品（参照プログラム数の多い順）',
    components: '外部コンポーネント（COM / OCX）',
    apis: '外部ライブラリの関数（Windows API など）',
  },
  db: {
    tablesTop: (label: string) => `${label}（上位）`,
    sql: (dynamic: string, concat: string) =>
      `動的SQL・文字列連結SQLの箇所数（動的 ${dynamic} / 連結 ${concat}）`,
  },
  notes: {
    scale:
      '解析結果から求めた移行対象の規模です。帳票数は Crystal／DataReport・コード印刷・CSV・Excel出力の合計で、算定基準は付録に記載しています。',
    dependencies:
      '複数のプログラムから参照される共通部品と、外部コンポーネント・外部ライブラリの一覧です。',
    database: (note: string) =>
      `アクセスされるテーブルと、動的SQL・文字列連結SQLの箇所数です。${note}`,
    risks:
      '解析で判断できなかった点・注意が必要な点を重要度別にまとめています。ご回答をお願いする内容を右端に記載しています。',
    items: (shown: string, total: string, all: string) =>
      `帳票・バッチ・画面の順に最大${shown}件を表示しています（全${total}件）。${all}。`,
  },
  appendix: {
    definitionsTitle: '指標の定義',
    definitions: [
      'コード行数：コメント・空白・フォームデザイン定義を除いた行数。複数のプログラムが共通で使うファイルは1回のみ集計します。',
      '物理行数：ファイルの全行数。プロシージャ：Sub・Function・Property の数。',
      'モジュール：プロジェクトファイルのあるフォルダ。複数のプログラムが共有するファイルは「共通」に集計します。',
    ],
    countingTitle: '画面・帳票・バッチの数え方（算定基準）',
    countingHead: [
      '画面：プロジェクトが宣言するフォーム（ユーザードキュメント含む）のファイル数。複数のプログラムで使う画面は共通として1回のみ数えます。ファイルが不足・解析不可の画面も数え、備考に記載します。',
      'バッチ：フォームを持たず、起動オブジェクトが Sub Main のプログラム。フォームがあるプログラムは画面として数えます。',
    ],
    countingTail:
      '数え方はソースコードの機械的な読み取り（字句解析）です。実行時に決まるファイル名や、コード以外で行う出力は検出できません。',
    labelSep: '：',
    complexityTitle: '帳票の複雑度',
    complexity: [
      '帳票ごとに、帳票を呼び出す処理の分岐数・実行行数・アクセステーブル数・動的SQLの有無・他の処理の呼び出し数を点数化し、低・中・高・非常に高の4段階に分類します。',
      '帳票を作成するプロシージャ（コード印刷・CSV・Excel出力は出力を行うプロシージャ）で同じ点数化を行い、複数の箇所がある場合は最も高い値とします。',
      '複雑度は移行の難しさの目安であり、工数や金額を示すものではありません。',
    ],
  },
  breakdown: {
    title: '帳票の内訳',
    crystal: 'Crystal Reports / DataReport',
    print: 'コード印刷',
    export: 'CSV・Excel出力',
    dataFiles: 'データファイル出力（帳票に含めない）',
    excluded: (count: string) => `ログ・一時ファイルとして除外: ${count} 件`,
  },
};

type DocText = typeof JA;

const VI: DocText = {
  title: 'Báo cáo Assessment',
  demoNotice: 'DEMO: dữ liệu mẫu đi kèm (không phải hệ thống của khách hàng)',
  notAnalyzed: 'Chưa phân tích (cần phân tích lại)',
  notApplicable: 'Không có',
  allInExcel: 'Xem đầy đủ trong file Excel',
  cover: {
    project: 'Dự án',
    analysedOn: 'Ngày phân tích',
    issuedOn: 'Ngày xuất',
    scope: 'Phạm vi',
    scopeValue: (programs: string, lines: string) =>
      `${programs} program / ${lines} dòng mã nguồn (file dùng chung chỉ tính một lần)`,
    contents: 'Mục lục',
  },
  sections: {
    scale: '1. Quy mô',
    complexity: '2. Độ phức tạp',
    dependencies: '3. Phụ thuộc',
    database: '4. Cơ sở dữ liệu',
    risks: '5. Rủi ro và đề nghị khách hàng',
    items: '6. Danh sách màn hình, report',
    next: 'Bước tiếp theo',
    appendix: 'Phụ lục',
  },
  kpi: {
    screens: 'Màn hình',
    screensSub: (shared: string) => `trong đó dùng chung ${shared}`,
    reports: REPORT_TOTAL_LABEL.vi,
    reportsSub: (crystal: string, print: string, exports: string) =>
      `Crystal ${crystal} · In bằng code ${print} · Xuất CSV/Excel ${exports}`,
    reportsMissing: (missing: string) => `Thiếu file .rpt: ${missing}`,
    reportsJoin: ' / ',
    batches: 'Batch',
    batchesSub: 'Không có form, khởi động bằng Sub Main',
    programs: 'Program',
    programsSub: (complete: string) => `trong đó phân tích đầy đủ ${complete}`,
    lines: 'Số dòng code',
    linesSub: (physical: string) => `Số dòng vật lý ${physical}`,
    procedures: 'Procedure',
    tables: 'Bảng DB',
    customerCount: 'Số liệu khách hàng cung cấp: chưa nhập',
  },
  itemOrder: {
    Report: 0,
    'Ghi file dữ liệu': 1,
    Batch: 2,
    'Màn hình': 3,
  },
  levels: {
    low: 'Thấp',
    medium: 'Trung bình',
    high: 'Cao',
    'very-high': 'Rất cao',
    unrated: 'Chưa đánh giá',
  },
  table: {
    module: 'Module',
    programs: 'Số program',
    screens: 'Màn hình',
    reports: 'Report',
    batches: 'Batch',
    files: 'File',
    lines: 'Số dòng code',
    total: 'Tổng',
    kind: 'Loại',
    count: 'Số lượng',
    level: 'Độ phức tạp',
    score: 'Điểm',
    program: 'Program',
    file: 'File',
    procedures: 'Số procedure',
    refPrograms: 'Số program tham chiếu',
    identifier: 'Định danh',
    fileName: 'Tên file',
    description: 'Mô tả',
    function: 'Tên hàm',
    library: 'Thư viện',
    callers: 'Số program gọi',
    dbTable: 'Bảng',
    operations: 'Thao tác',
    dynamicSql: 'SQL động',
    concatSql: 'SQL ghép chuỗi',
    category: 'Phân loại',
    severity: 'Mức độ',
    content: 'Nội dung',
    confirmation: 'Đề nghị khách hàng',
    type: 'Nhóm',
    name: 'Tên',
    location: 'File:dòng',
    confidence: 'Độ tin cậy',
    affected: 'Program bị ảnh hưởng',
    other: (count: string) => `và ${count} program khác`,
    wholeSystem: '(Toàn hệ thống)',
    join: ', ',
  },
  charts: {
    programLevels: 'Phân bố độ phức tạp của program',
    reportLevels: 'Phân bố độ phức tạp của report',
    notAnalyzed: 'Chưa phân tích',
    notApplicable: 'Không áp dụng',
    top: 'Program phức tạp (top)',
    reportNote:
      'Độ phức tạp của report được tính từ code tạo report, chưa gồm thiết kế layout. Report Crystal tối thiểu là "Trung bình"; report không xác định được procedure tạo ra là "Chưa đánh giá".',
    programNote:
      'Độ phức tạp của program là phân loại mức khó migrate, không phải effort hay chi phí.',
  },
  deps: {
    shared: 'Thành phần dùng chung (nhiều program tham chiếu nhất)',
    components: 'Thành phần ngoài (COM / OCX)',
    apis: 'Hàm của thư viện ngoài (Windows API, v.v.)',
  },
  db: {
    tablesTop: (label: string) => `${label} (top)`,
    sql: (dynamic: string, concat: string) =>
      `Số vị trí SQL động / SQL ghép chuỗi (động ${dynamic} / ghép ${concat})`,
  },
  notes: {
    scale:
      'Quy mô cần migrate tính từ kết quả phân tích. Số report là tổng của Crystal/DataReport, in bằng code và xuất CSV/Excel; cơ sở tính ở phần phụ lục.',
    dependencies:
      'Danh sách thành phần dùng chung được nhiều program tham chiếu, thành phần ngoài và thư viện ngoài.',
    database: (note: string) =>
      `Các bảng được truy cập và số vị trí SQL động / SQL ghép chuỗi. ${note}`,
    risks:
      'Tổng hợp theo mức độ những điểm chưa xác định được qua phân tích hoặc cần lưu ý. Cột bên phải ghi những việc mong nhận phản hồi.',
    items: (shown: string, total: string, all: string) =>
      `Hiển thị tối đa ${shown} dòng theo thứ tự report, batch, màn hình (tổng ${total} dòng). ${all}.`,
  },
  appendix: {
    definitionsTitle: 'Định nghĩa các chỉ số',
    definitions: [
      'Số dòng code: số dòng không tính comment, dòng trống và định nghĩa thiết kế form. File dùng chung giữa nhiều program chỉ tính một lần.',
      'Số dòng vật lý: tổng số dòng của file. Procedure: số lượng Sub, Function, Property.',
      'Module: thư mục chứa file project. File dùng chung giữa nhiều program được tính ở "Dùng chung".',
    ],
    countingTitle: 'Cách đếm màn hình, report, batch (cơ sở tính)',
    countingHead: [
      'Màn hình: số file form (gồm user document) mà project khai báo. Màn hình dùng chung giữa nhiều program chỉ tính một lần. Màn hình thiếu file hoặc không phân tích được vẫn được tính và ghi ở cột ghi chú.',
      'Batch: program không có form và đối tượng khởi động là Sub Main. Program có form được tính là màn hình.',
    ],
    countingTail:
      'Cách đếm dựa trên việc đọc cơ học mã nguồn (phân tích từ vựng). Không phát hiện được tên file quyết định lúc chạy hoặc đầu ra tạo ngoài code.',
    labelSep: ': ',
    complexityTitle: 'Độ phức tạp của report',
    complexity: [
      'Với từng report, chấm điểm theo số nhánh, số dòng thực thi, số bảng truy cập, có SQL động hay không và số lời gọi xử lý khác của xử lý tạo report, rồi chia 4 mức: Thấp, Trung bình, Cao, Rất cao.',
      'Với in bằng code và xuất CSV/Excel, chấm điểm theo procedure thực hiện việc in/xuất; nếu có nhiều vị trí thì lấy giá trị cao nhất.',
      'Độ phức tạp là thước đo mức khó migrate, không thể hiện effort hay chi phí.',
    ],
  },
  breakdown: {
    title: 'Chi tiết report',
    crystal: 'Crystal Reports / DataReport',
    print: 'In bằng code',
    export: 'Xuất CSV/Excel',
    dataFiles: 'Ghi file dữ liệu (không tính vào report)',
    excluded: (count: string) => `Đã loại ${count} chỗ ghi log/file tạm`,
  },
};

const TEXT: Record<DocLang, DocText> = { ja: JA, vi: VI };

export const documentText = (lang: DocLang): DocText => TEXT[lang];

// The appendix lists: counting rules (screens, batches, the shared counting
// basis, the lexical limit) and the definitions with the table-count line.
export function appendixCounting(lang: DocLang): string[] {
  const t = TEXT[lang];
  return [
    ...t.appendix.countingHead,
    ...REPORT_COUNTING_BASIS.map(
      (item) => `${item[lang].label}${t.appendix.labelSep}${item[lang].text}`,
    ),
    t.appendix.countingTail,
  ];
}
export const appendixDefinitions = (
  lang: DocLang,
  state: TableSchemaState,
): string[] => [
  ...TEXT[lang].appendix.definitions,
  tableSchemaStatement(state, lang).definition,
];
export const databaseNote = (lang: DocLang, state: TableSchemaState) =>
  TEXT[lang].notes.database(tableSchemaStatement(state, lang).note);

export const basisTitle = (lang: DocLang) => REPORT_COUNTING_BASIS_TITLE[lang];

// 2026-11-06T09:00:00.000Z or 2026-11-06 → 2026年11月6日 (ja) / 6/11/2026 (vi).
export function formatDate(lang: DocLang, iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return lang === 'vi'
    ? `${Number(day)}/${Number(month)}/${year}`
    : `${year}年${Number(month)}月${Number(day)}日`;
}
export const jaDate = (iso: string) => formatDate('ja', iso);

export const numberFormat = (lang: DocLang) => {
  const format = new Intl.NumberFormat(lang === 'vi' ? 'vi-VN' : 'ja-JP');
  return (value: number) => format.format(value);
};

export const docTitle = (lang: DocLang) => TEXT[lang].title;
