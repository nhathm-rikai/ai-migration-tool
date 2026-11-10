// Customer-facing risk catalog (AR02): maps every warning code of the
// technical report, plus two groups taken from data (COM/OCX and native
// APIs), to {区分, 重要度, 内容, 確認事項}. Edit wording and severity here;
// the builder never writes a customer sentence itself. A code that is not
// listed becomes the "その他" row, so no warning is dropped.

export type RiskSeverity = '高' | '中' | '低';

export type RiskEntry = {
  category: string;
  severity: RiskSeverity;
  content: string;
  confirmation: string;
};

export const OTHER_RISK_CODE = 'OTHER';

export const RISK_CATALOG: Record<string, RiskEntry> = {
  PROGRAM_UNSUPPORTED: {
    category: '解析対象外',
    severity: '高',
    content:
      'プロジェクトファイルを解析できず、規模に含まれないプログラムがあります。',
    confirmation: '該当プロジェクトの形式（VB6以外・破損等）をご確認ください。',
  },
  PROGRAM_INCOMPLETE: {
    category: 'ソース不足',
    severity: '高',
    content:
      'ファイル不足・未対応形式・未分類の行があり、数値が一部のみのプログラムがあります。',
    confirmation:
      '不足しているファイルのご提供、または対象外であることをご確認ください。',
  },
  MEMBER_MISSING: {
    category: 'ソース不足',
    severity: '高',
    content: 'プロジェクトが宣言しているファイルがソース内に見つかりません。',
    confirmation: '該当ファイルのご提供をお願いします。',
  },
  MEMBER_ABSOLUTE_PATH: {
    category: 'ソース不足',
    severity: '高',
    content: '絶対パスで宣言されたファイルを特定できません。',
    confirmation: '該当ファイルの所在とご提供をお願いします。',
  },
  MEMBER_OUTSIDE_ROOT: {
    category: 'ソース不足',
    severity: '高',
    content: '提供範囲の外にあるファイルが宣言されています。',
    confirmation: '該当ファイルのご提供をお願いします。',
  },
  MEMBER_AMBIGUOUS: {
    category: 'ソース不足',
    severity: '中',
    content: '同名で大文字小文字のみ異なるファイルが複数あり、特定できません。',
    confirmation: '正しいファイルをご指定ください。',
  },
  MEMBER_CASE_MISMATCH: {
    category: '解析の前提',
    severity: '低',
    content:
      '宣言と実ファイルの大文字小文字が異なります（解析には影響しません）。',
    confirmation: '特にありません。',
  },
  FILE_ERROR: {
    category: 'ソース不足',
    severity: '高',
    content: '文字コード等の理由で読み込めないファイルがあります。',
    confirmation: 'ファイルの文字コードをご確認ください。',
  },
  FILE_UNSUPPORTED: {
    category: '未対応の構成要素',
    severity: '高',
    content:
      'ユーザーコントロール等、現在の解析が対応していない種類のファイルがあります。',
    confirmation: '該当部品の利用範囲と重要度をご確認ください。',
  },
  FILES_SKIPPED: {
    category: 'ソース不足',
    severity: '高',
    content: 'サイズ超過・リンク等の理由で読み込まなかったファイルがあります。',
    confirmation: '読み込まなかったファイルの要否をご確認ください。',
  },
  UNCLASSIFIED_LINES: {
    category: '解析の前提',
    severity: '中',
    content: '分類できなかった行があり、行数に含まれていません。',
    confirmation: '該当ファイルの記述形式をご確認ください。',
  },
  REPORT_FILE_MISSING: {
    category: '帳票',
    severity: '高',
    content:
      'コードから参照されている帳票定義ファイル（.rpt）がソース内にありません（設計ファイルなし）。',
    confirmation: '特にありません。',
  },
  SCREEN_FILE_MISSING: {
    category: 'ソース不足',
    severity: '高',
    content: '画面（フォーム）のファイルがソース内にありません。',
    confirmation: '該当画面のファイルのご提供をお願いします。',
  },
  SCREEN_FILE_NOT_ANALYZED: {
    category: '未対応の構成要素',
    severity: '中',
    content: '画面ファイルを解析できませんでした（画面数には含めています）。',
    confirmation: '該当画面の内容をご確認ください。',
  },
  SCREEN_REPORT_MISSING: {
    category: '解析の前提',
    severity: '中',
    content: '画面・帳票・バッチの数がこの解析結果に含まれていません。',
    confirmation: 'ソースの再解析を実施します（ご対応は不要です）。',
  },
  DYNAMIC_SQL: {
    category: 'データベース',
    severity: '中',
    content:
      'テーブル名が実行時に決まるSQLがあり、アクセス先テーブルを機械的に特定できません。',
    confirmation: '動的に指定されるテーブルの一覧と用途をご確認ください。',
  },
  TABLE_NAMES_NOT_CONFIRMED: {
    category: 'データベース',
    severity: '中',
    content: 'テーブル名のスキーマを仮定して集計しています。',
    confirmation:
      'データベース管理者により、既定スキーマ・同義語をご確認ください。',
  },
  CALL_AMBIGUOUS: {
    category: '解析の前提',
    severity: '低',
    content:
      '同名の処理が複数あり、呼び出し先を一意に決められない箇所があります。',
    confirmation: '特にありません（移行設計時に確認します）。',
  },
  COMPLEXITY_DRAFT: {
    category: '解析の前提',
    severity: '低',
    content:
      '複雑度は、分岐数・実行行数・アクセステーブル数・動的SQL・呼び出し数の点数で算出しています。',
    confirmation: '特にありません。',
  },
  COMPLEXITY_REFERENCE_ONLY: {
    category: '解析の前提',
    severity: '低',
    content:
      '複雑度は移行の難しさの分類であり、工数・金額の算定根拠ではありません。ファイル処理・DB更新・トランザクションは点数に含まれません。',
    confirmation: '特にありません。',
  },
  PROCEDURE_LINES_MISSING: {
    category: '解析の前提',
    severity: '低',
    content: 'プロシージャ単位の行数内訳がこの解析結果にありません。',
    confirmation: 'ソースの再解析を実施します（ご対応は不要です）。',
  },
  // Groups taken from data, not from warnings.
  EXTERNAL_COMPONENT: {
    category: '外部コンポーネント',
    severity: '中',
    content:
      'COM / OCX など外部コンポーネントを利用しています。移行先での代替が必要になる場合があります。',
    confirmation:
      '利用中の外部コンポーネントのライセンス・入手方法・代替可否をご確認ください。',
  },
  CONCATENATED_SQL: {
    category: 'データベース',
    severity: '中',
    content:
      '文字列連結で組み立てているSQLがあります。実行時の内容を機械的に特定できず、移行時の書き換え対象になります。',
    confirmation:
      '該当SQLの用途と、入力値の扱い（SQLインジェクション対策）をご確認ください。',
  },
  EXTERNAL_API: {
    category: '外部コンポーネント',
    severity: '低',
    content: 'Windows API など外部ライブラリの関数を呼び出しています。',
    confirmation: '特にありません（移行設計時に確認します）。',
  },
  [OTHER_RISK_CODE]: {
    category: 'その他',
    severity: '中',
    content: '上記以外の注意事項があります。',
    confirmation: '詳細は担当者よりご連絡します。',
  },
};

// The same catalog in Vietnamese (customer report with lang=vi): same codes,
// same severities; only the wording differs. A test compares the keys.
type RiskWording = Pick<RiskEntry, 'category' | 'content' | 'confirmation'>;

const SRC = 'Thiếu mã nguồn';
const PREMISE = 'Cơ sở phân tích';
const UNSUPPORTED = 'Thành phần chưa hỗ trợ';
const DATABASE = 'Cơ sở dữ liệu';
const EXTERNAL = 'Thành phần ngoài';
const NONE = 'Không có.';
const REANALYZE =
  'Chúng tôi sẽ phân tích lại mã nguồn (khách hàng không cần xử lý).';

export const RISK_CATALOG_VI: Record<string, RiskWording> = {
  PROGRAM_UNSUPPORTED: {
    category: 'Ngoài phạm vi phân tích',
    content:
      'Có program không phân tích được file project nên không nằm trong quy mô.',
    confirmation:
      'Vui lòng kiểm tra định dạng của project đó (không phải VB6, bị hỏng, v.v.).',
  },
  PROGRAM_INCOMPLETE: {
    category: SRC,
    content:
      'Có program thiếu file, có định dạng chưa hỗ trợ hoặc có dòng chưa phân loại nên số liệu chỉ là một phần.',
    confirmation:
      'Vui lòng cung cấp các file còn thiếu, hoặc cho biết các file đó nằm ngoài phạm vi.',
  },
  MEMBER_MISSING: {
    category: SRC,
    content: 'Không tìm thấy trong mã nguồn các file mà project khai báo.',
    confirmation: 'Vui lòng cung cấp các file tương ứng.',
  },
  MEMBER_ABSOLUTE_PATH: {
    category: SRC,
    content: 'Không xác định được file được khai báo bằng đường dẫn tuyệt đối.',
    confirmation: 'Vui lòng cho biết vị trí và cung cấp các file tương ứng.',
  },
  MEMBER_OUTSIDE_ROOT: {
    category: SRC,
    content: 'Có file được khai báo nằm ngoài phạm vi mã nguồn đã cung cấp.',
    confirmation: 'Vui lòng cung cấp các file tương ứng.',
  },
  MEMBER_AMBIGUOUS: {
    category: SRC,
    content:
      'Có nhiều file trùng tên chỉ khác chữ hoa/thường nên không xác định được file nào.',
    confirmation: 'Vui lòng chỉ định file đúng.',
  },
  MEMBER_CASE_MISMATCH: {
    category: PREMISE,
    content:
      'Chữ hoa/thường của khai báo và file thật khác nhau (không ảnh hưởng đến phân tích).',
    confirmation: NONE,
  },
  FILE_ERROR: {
    category: SRC,
    content: 'Có file không đọc được do bảng mã ký tự hoặc lý do tương tự.',
    confirmation: 'Vui lòng kiểm tra bảng mã ký tự của file.',
  },
  FILE_UNSUPPORTED: {
    category: UNSUPPORTED,
    content:
      'Có loại file mà phân tích hiện tại chưa hỗ trợ, như user control.',
    confirmation:
      'Vui lòng cho biết phạm vi sử dụng và mức độ quan trọng của các thành phần đó.',
  },
  FILES_SKIPPED: {
    category: SRC,
    content:
      'Có file không được đọc do vượt dung lượng, là liên kết (link) hoặc lý do tương tự.',
    confirmation: 'Vui lòng cho biết có cần các file không được đọc hay không.',
  },
  UNCLASSIFIED_LINES: {
    category: PREMISE,
    content: 'Có dòng không phân loại được nên không nằm trong số dòng.',
    confirmation: 'Vui lòng kiểm tra cách viết của các file tương ứng.',
  },
  REPORT_FILE_MISSING: {
    category: 'Report',
    content:
      'File định nghĩa report (.rpt) được code tham chiếu không có trong mã nguồn (thiếu file thiết kế).',
    confirmation: NONE,
  },
  SCREEN_FILE_MISSING: {
    category: SRC,
    content: 'Không có trong mã nguồn các file màn hình (form).',
    confirmation: 'Vui lòng cung cấp file của các màn hình tương ứng.',
  },
  SCREEN_FILE_NOT_ANALYZED: {
    category: UNSUPPORTED,
    content: 'Không phân tích được file màn hình (vẫn tính vào số màn hình).',
    confirmation: 'Vui lòng cho biết nội dung của các màn hình tương ứng.',
  },
  SCREEN_REPORT_MISSING: {
    category: PREMISE,
    content:
      'Số màn hình, report và batch không có trong kết quả phân tích này.',
    confirmation: REANALYZE,
  },
  DYNAMIC_SQL: {
    category: DATABASE,
    content:
      'Có SQL mà tên bảng được quyết định lúc chạy nên không xác định cơ học được bảng được truy cập.',
    confirmation:
      'Vui lòng cho biết danh sách và mục đích của các bảng được chỉ định động.',
  },
  TABLE_NAMES_NOT_CONFIRMED: {
    category: DATABASE,
    content: 'Tên bảng được thống kê theo schema giả định.',
    confirmation:
      'Vui lòng nhờ quản trị viên cơ sở dữ liệu kiểm tra schema mặc định và từ đồng nghĩa.',
  },
  CALL_AMBIGUOUS: {
    category: PREMISE,
    content:
      'Có nhiều xử lý trùng tên nên có chỗ không xác định được duy nhất nơi được gọi.',
    confirmation: 'Không có (sẽ kiểm tra khi thiết kế migrate).',
  },
  COMPLEXITY_DRAFT: {
    category: PREMISE,
    content:
      'Độ phức tạp được tính theo điểm của số nhánh, số dòng thực thi, số bảng truy cập, SQL động và số lời gọi.',
    confirmation: NONE,
  },
  COMPLEXITY_REFERENCE_ONLY: {
    category: PREMISE,
    content:
      'Độ phức tạp là phân loại mức khó migrate, không phải cơ sở tính effort hay chi phí. Xử lý file, cập nhật DB và transaction không nằm trong điểm.',
    confirmation: NONE,
  },
  PROCEDURE_LINES_MISSING: {
    category: PREMISE,
    content:
      'Kết quả phân tích này không có chi tiết số dòng theo từng procedure.',
    confirmation: REANALYZE,
  },
  EXTERNAL_COMPONENT: {
    category: EXTERNAL,
    content:
      'Đang dùng thành phần ngoài như COM / OCX. Có thể cần thay thế khi migrate.',
    confirmation:
      'Vui lòng cho biết giấy phép, cách có được và khả năng thay thế của các thành phần ngoài đang dùng.',
  },
  CONCATENATED_SQL: {
    category: DATABASE,
    content:
      'Có SQL được ghép từ chuỗi. Không xác định cơ học được nội dung lúc chạy và đây là đối tượng phải viết lại khi migrate.',
    confirmation:
      'Vui lòng cho biết mục đích của các SQL đó và cách xử lý giá trị nhập (phòng chống SQL injection).',
  },
  EXTERNAL_API: {
    category: EXTERNAL,
    content: 'Có gọi hàm của thư viện ngoài như Windows API.',
    confirmation: 'Không có (sẽ kiểm tra khi thiết kế migrate).',
  },
  [OTHER_RISK_CODE]: {
    category: 'Khác',
    content: 'Có những lưu ý ngoài các mục trên.',
    confirmation: 'Người phụ trách sẽ liên hệ để trao đổi chi tiết.',
  },
};

export const riskCatalog = (lang: 'ja' | 'vi'): Record<string, RiskEntry> =>
  lang === 'ja'
    ? RISK_CATALOG
    : Object.fromEntries(
        Object.entries(RISK_CATALOG).map(([code, entry]) => [
          code,
          { ...entry, ...(RISK_CATALOG_VI[code] ?? {}) },
        ]),
      );
