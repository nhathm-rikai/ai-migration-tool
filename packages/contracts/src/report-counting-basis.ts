// "Cơ sở tính" of the report total: the conventions behind the number, written
// once and read by step 2 (vi / ja), the customer Excel report and the PDF
// (ja). The total is a count of output units by these conventions, not a count
// of business reports. A change here changes what the screen, the Excel report
// and the PDF say; keep it in step with docs/engineering/specs/source-inventory.md
// section 6.2a.

export type ReportCountingBasisItem = {
  id:
    | 'template'
    | 'file-unit'
    | 'overlap'
    | 'other-output'
    | 'log-temp'
    | 'complexity';
  vi: { label: string; text: string };
  ja: { label: string; text: string };
};

export const REPORT_TOTAL_LABEL = {
  vi: 'Report theo quy ước Assessment',
  ja: '帳票数（算定基準による）',
} as const;

export const REPORT_COUNTING_BASIS_TITLE = {
  vi: 'Cơ sở tính',
  ja: '算定基準',
} as const;

export const REPORT_COUNTING_BASIS: readonly ReportCountingBasisItem[] = [
  {
    id: 'template',
    vi: {
      label: 'Crystal / DataReport',
      text: 'Mỗi mẫu là một đơn vị. Khi code ghi thư mục của file .rpt (ví dụ sales/Detail.rpt) thì mẫu được định danh bằng đường dẫn chuẩn hóa, không phân biệt hoa thường: sales/Detail.rpt và stock/Detail.rpt là hai mẫu. Khi code chỉ ghi tên file (kể cả App.Path & "\\Detail.rpt") thì giả định cùng tên file là cùng một mẫu; tên chỉ ghi như vậy được gộp vào mẫu có đường dẫn khi trên toàn dự án chỉ có một đường dẫn cùng tên file.',
    },
    ja: {
      label: 'Crystal ／ DataReport',
      text: '帳票定義（テンプレート）ごとに1件です。コードに .rpt のフォルダが書かれている場合（例：sales/Detail.rpt）は、大文字小文字を区別しない正規化したパスで識別し、sales/Detail.rpt と stock/Detail.rpt は別の帳票とします。ファイル名のみが書かれている場合（App.Path & "\\Detail.rpt" を含む）は、同じファイル名は同じ帳票とみなします。名前のみの記述は、同名のパス付き帳票がプロジェクト内に1つだけのときにその帳票へまとめます。',
    },
  },
  {
    id: 'file-unit',
    vi: {
      label: 'In bằng code, xuất CSV/Excel',
      text: 'Mỗi file chứa code (.frm, .bas, .cls) có lệnh in trực tiếp, hoặc có lệnh xuất CSV/Excel, là một đơn vị cho từng cách. Đây là đơn vị quy đổi, không phải số mẫu thực tế: một file in nhiều chứng từ vẫn tính một.',
    },
    ja: {
      label: 'コード印刷、CSV・Excel出力',
      text: '直接印刷のコード、または CSV・Excel出力のコードを持つソースファイル（.frm／.bas／.cls）1つを、それぞれ1件として数えます。換算単位であり実際の帳票様式数ではありません。1つのファイルで複数の帳票を印刷していても1件です。',
    },
  },
  {
    id: 'overlap',
    vi: {
      label: 'Trùng giữa các cách',
      text: 'Mỗi cách tạo đầu ra được tính riêng. Crystal/DataReport tính theo từng mẫu (một mẫu chỉ tính một lần trong dự án, dù nhiều file gọi); in bằng code và xuất CSV/Excel mỗi loại tối đa 1 đơn vị cho mỗi file. Ví dụ: một file gọi 2 mẫu Crystal, có lệnh in và có lệnh xuất CSV được 2 + 1 + 1 = 4 đơn vị (nếu 2 mẫu chưa được tính ở file khác). Tổng là số đơn vị đầu ra theo quy ước này, không phải số báo cáo nghiệp vụ.',
    },
    ja: {
      label: '作成方法の重複',
      text: '作成方法ごとに別々に数えます。Crystal／DataReport は帳票定義ごと（複数のファイルから呼ばれても、プロジェクトで1件）、コード印刷と CSV・Excel出力は、それぞれ1ファイルにつき最大1件です。例：1つのファイルが Crystal の帳票定義2つを呼び、コード印刷と CSV出力も行う場合は 2 + 1 + 1 = 4件です（2つの帳票定義が他のファイルで数えられていない場合）。合計はこの基準による出力単位の数であり、業務上の帳票数ではありません。',
    },
  },
  {
    id: 'other-output',
    vi: {
      label: 'Ghi file khác',
      text: 'Ghi file không phải CSV/Excel được coi là file dữ liệu hoặc trao đổi, không tính vào tổng và được liệt kê riêng. Thư viện report chỉ khai báo mà không có mẫu cũng không tính.',
    },
    ja: {
      label: 'その他のファイル出力',
      text: 'CSV・Excel 以外のファイル出力はデータ・連携用ファイルとし、合計に含めず別に一覧します。帳票ライブラリの宣言のみで帳票定義がないものも数えません。',
    },
  },
  {
    id: 'log-temp',
    vi: {
      label: 'Log, file tạm',
      text: 'Đã loại các dấu hiệu log/tạm theo quy tắc nhận diện: đường dẫn ghi file chứa log, tmp, temp, debug, err. Quy tắc dựa trên từ trong đường dẫn nên không bảo đảm loại hết.',
    },
    ja: {
      label: 'ログ・一時ファイル',
      text: 'ログ・一時ファイルとみられる出力は、識別ルール（出力先のパスに log／tmp／temp／debug／err を含む）により除外しています。パス中の語による判定のため、すべてを除外できるとは限りません。',
    },
  },
  {
    id: 'complexity',
    vi: {
      label: 'Phạm vi độ phức tạp',
      text: 'Độ phức tạp tính từ code tạo report (số nhánh, dòng thực thi, bảng truy cập, SQL động, lời gọi), chưa gồm thiết kế layout. Crystal chưa phân tích file thiết kế nên tối thiểu là Trung bình; report không xác định được procedure tạo ra là Chưa đánh giá.',
    },
    ja: {
      label: '複雑度の範囲',
      text: '複雑度は、帳票を作成するコード（分岐数・実行行数・アクセステーブル数・動的SQL・呼び出し数）から算出しており、レイアウトの設計内容は含みません。Crystal は定義ファイルの中身を解析しないため最低でも「中」、作成するプロシージャを特定できないものは「未評価」とします。',
    },
  },
];
