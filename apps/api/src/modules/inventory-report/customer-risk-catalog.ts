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
    content: '分類できなかった行があり、行数に誤差が出る可能性があります。',
    confirmation: '該当ファイルの記述形式をご確認ください。',
  },
  REPORT_FILE_MISSING: {
    category: '帳票',
    severity: '高',
    content:
      'コードから参照されている帳票定義ファイル（.rpt）がソース内にありません。',
    confirmation: '帳票定義ファイル(.rpt)のご提供をお願いします。',
  },
  REPORT_SUSPECTED: {
    category: '帳票',
    severity: '中',
    content:
      '印刷・Excel・ファイル出力を行う可能性のあるプログラムがあります（帳票数には含みません）。',
    confirmation:
      '帳票一覧（台帳）をご提供のうえ、該当プログラムの出力内容をご確認ください。',
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
    content: '複雑度は暫定モデルによる参考値です。',
    confirmation: '特にありません。',
  },
  COMPLEXITY_REFERENCE_ONLY: {
    category: '解析の前提',
    severity: '低',
    content:
      '複雑度は参考分類であり、工数・金額の根拠ではありません。ファイル処理・DB更新・トランザクションは別途確認します。',
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
