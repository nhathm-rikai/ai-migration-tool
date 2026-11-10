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
