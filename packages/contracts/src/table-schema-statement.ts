// What the customer report says about the table names (AR03 review 2): one
// state and one wording, used by the Excel note (sheet 4), the PDF section 4
// and the PDF appendix, so they cannot disagree. A statement about a schema
// is made only when there are tables to talk about.

export type TableSchemaState =
  'unanalyzed' | 'none' | 'raw' | 'assumed' | 'confirmed';

export function tableSchemaState(scale: {
  tables: number;
  tablesView: 'normalized' | 'raw' | null;
  tablesAssumed?: boolean | undefined;
}): TableSchemaState {
  if (scale.tablesView === null) return 'unanalyzed';
  if (scale.tables === 0) return 'none';
  if (scale.tablesView === 'raw') return 'raw';
  // A report that does not say (an older JSON) is read as assumed.
  return scale.tablesAssumed === false ? 'confirmed' : 'assumed';
}

const DEFINITION = 'DBテーブル数：SQL からアクセスされるテーブル名の種類数。';
const DEFINITION_VI = 'Số bảng DB: số loại tên bảng được truy cập từ SQL. ';

export const TABLE_SCHEMA_STATEMENT: Record<
  TableSchemaState,
  { note: string; definition: string }
> = {
  unanalyzed: {
    note: 'テーブルは解析データがないため集計していません（再解析が必要です）。',
    definition: 'DBテーブル数：解析データがないため集計していません。',
  },
  none: {
    note: 'SQLからアクセスされるテーブルは検出されませんでした。',
    definition: DEFINITION + 'この解析結果では 0 件です。',
  },
  raw: {
    note: 'テーブル名はソース上の名称のまま集計しています。',
    definition: DEFINITION + 'ソース上の名称のまま集計しています。',
  },
  assumed: {
    note: 'テーブル名は解析時に仮定したスキーマで統一しています。データベース管理者による確認が必要です。',
    definition:
      DEFINITION + '同義語・既定スキーマは未確認のため仮定を含みます。',
  },
  confirmed: {
    note: 'テーブル名は確認済みの既定スキーマで統一しています。',
    definition: DEFINITION + '既定スキーマは確認済みです。',
  },
};

// The same statements in Vietnamese (customer report with lang=vi).
export const TABLE_SCHEMA_STATEMENT_VI: Record<
  TableSchemaState,
  { note: string; definition: string }
> = {
  unanalyzed: {
    note: 'Chưa thống kê bảng vì chưa có dữ liệu phân tích (cần phân tích lại).',
    definition: 'Số bảng DB: chưa thống kê vì chưa có dữ liệu phân tích.',
  },
  none: {
    note: 'Không phát hiện bảng nào được truy cập từ SQL.',
    definition: DEFINITION_VI + 'Trong kết quả phân tích này là 0.',
  },
  raw: {
    note: 'Tên bảng được thống kê đúng theo tên trong mã nguồn.',
    definition: DEFINITION_VI + 'Thống kê đúng theo tên trong mã nguồn.',
  },
  assumed: {
    note: 'Tên bảng được thống nhất theo schema giả định khi phân tích; quản trị viên cơ sở dữ liệu chưa xác nhận schema này.',
    definition:
      DEFINITION_VI +
      'Từ đồng nghĩa và schema mặc định chưa được xác nhận nên có chứa giả định.',
  },
  confirmed: {
    note: 'Tên bảng được thống nhất theo schema mặc định đã xác nhận.',
    definition: DEFINITION_VI + 'Schema mặc định đã được xác nhận.',
  },
};

export const tableSchemaStatement = (
  state: TableSchemaState,
  lang: 'ja' | 'vi',
) =>
  (lang === 'vi' ? TABLE_SCHEMA_STATEMENT_VI : TABLE_SCHEMA_STATEMENT)[state];
