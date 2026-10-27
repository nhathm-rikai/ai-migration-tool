import {
  PROJECT_NAME_MIN_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
} from '@portal/contracts';
import type { Messages } from './vi';

export const jaMessages = {
  app: {
    skipToContent: 'メインコンテンツへ移動',
    subtitle: 'レガシーシステムのアセスメント',
    demo: 'DEMO · サンプルデータ',
    language: '言語',
    session: {
      pending: 'ローカルバックエンドに接続しています…',
      failed:
        'ローカルバックエンドとのセッションを開始できませんでした。データはまだ送信されていません。',
      expired:
        'セッションの有効期限が切れました（バックエンドが再起動された可能性があります）。次の操作で再接続します。',
      retry: '再接続',
    },
  },
  projects: {
    workspace: 'ワークスペース',
    title: 'プロジェクト一覧',
    refresh: 'プロジェクトを再読み込み',
    createNew: '新規プロジェクト',
    tree: 'プロジェクトツリー',
    loading: 'プロジェクトを読み込み中…',
    retryList: '一覧を再読み込み',
    noMore: 'このページにプロジェクトはありません',
    empty: 'プロジェクトはまだありません',
    emptyHelp: 'プロジェクトを作成して、作業を開始してください。',
    overview: 'プロジェクト概要',
    unavailable: '未対応',
    notAvailableYet: '未対応',
    pageCount: (count: number) => `このページのプロジェクト数：${count}件`,
    firstPage: '最初のページ',
    nextPage: '次のページ',
    localWorkspace: 'ローカル環境',
    breadcrumb: 'プロジェクト',
    fixture: 'サンプルデータ',
    demoBadge: 'DEMO',
    localBadge: 'LOCAL',
    localData: '登録済みのソースフォルダー',
    assessmentSteps: 'アセスメントの手順',
    stages: {
      analysis: { title: 'AI解析', description: 'パーサー + AIエージェント' },
      report: { title: '評価レポート', description: '解析結果' },
      review: { title: 'レビュー', description: 'SA/PMによる承認' },
      proposal: { title: '提案書', description: '提案書のドラフト' },
    },
    created: 'プロジェクトを作成しました。',
    footer:
      'デモモード · ローカルAPIでプロジェクトを管理します。解析、レビュー、レポート出力は未対応です。',
    create: {
      eyebrow: 'ワークスペース',
      description:
        'プロジェクトを作成して情報を管理し、レガシーシステムの評価を準備します。',
      name: 'プロジェクト名',
      placeholder: '例：販売管理システム',
      nameInvalid: `プロジェクト名は${PROJECT_NAME_MIN_LENGTH}～${PROJECT_NAME_MAX_LENGTH}文字で入力してください。空白のみの名前は使用できません。`,
      nameHelp: `最大${PROJECT_NAME_MAX_LENGTH}文字。サンプル用の名前とデータのみを使用してください。`,
      sample: 'VB6サンプルデータ',
      sampleDescription:
        'プロジェクト情報のみを保存します。ソースコードは読み込みません。',
      kind: 'プロジェクトの種類',
      kindDemo: 'サンプルデータのデモ',
      kindLocal: 'この端末のソースコード',
      kindLocalDescription:
        '作成後にソースフォルダーを登録します。ソースは解析の実行時にのみ読み込まれます。',
      submit: '作成する',
      pending: '作成中…',
      savedLocally:
        'プロジェクトはこの端末に保存されます。プロジェクトツリーから選択して情報を開けます。',
    },
    detail: {
      title: 'プロジェクト詳細',
      close: '詳細を閉じる',
      loading: '詳細を読み込み中…',
      retry: '詳細を再読み込み',
      description: 'ローカル環境に保存されたプロジェクト情報です。',
      id: 'プロジェクトID',
      data: 'データ',
      createdAt: '作成日時',
      ready: 'プロジェクトを管理できます',
      unavailable:
        'このバージョンでは、実際のソース解析、レビュー、レポート作成は未対応です。下の解析実行はデモです。',
    },
  },
  source: {
    title: 'ソースコード',
    loading: 'ソース情報を読み込み中…',
    reload: 'ソースを再読み込み',
    unregistered:
      'ソースフォルダーが登録されていません。解析の前に登録してください。',
    fixture: (fixtureId: string) =>
      `デモプロジェクトはアプリ同梱のサンプル ${fixtureId} を使用します。別のフォルダーは登録できません。`,
    fields: {
      folder: 'フォルダー',
      revision: '登録リビジョン',
      profile: '解析プロファイル',
      defaultSchema: 'デフォルトスキーマ',
      status: '状態',
      checkedAt: '確認日時',
    },
    status: {
      ready: '読み取り可能（フォルダーのみ確認、内容は未読）',
      unreadable:
        '登録したフォルダーを読み取れません。フォルダーを確認して再登録してください。',
    },
    mappingStatus: {
      unconfigured: '未設定',
      assumed: '仮定（未確認）',
      confirmed: 'DB管理者が確認済み',
    },
    profiles: {
      'vb6-cp932-v1': 'VB6 · CP932 (vb6-cp932-v1)',
    },
    form: {
      titleNew: 'ソースを登録',
      titleEdit: 'ソースを変更',
      rootPath: 'フォルダーのパス（絶対パス）',
      rootPathHelp:
        '例：C:\\work\\order-module、/home/dev/order-module。バックエンドがフォルダーと読み取り権限を確認します。内容は解析の実行時にのみ読み込まれます。',
      rootPathInvalid: 'ソースフォルダーのパスを入力してください。',
      profile: '解析プロファイル',
      mappingStatus: 'テーブル名のデフォルトスキーマ',
      defaultSchema: 'スキーマ名',
      defaultSchemaHelp:
        '修飾なしのテーブル名が指すスキーマ（例：ログインユーザー）。DB管理者が確認した場合のみ「確認済み」を選択してください。',
      defaultSchemaInvalid:
        'スキーマ名は英字または「_」で始め、英数字・_・$・# のみで入力してください。',
      submit: '登録する',
      update: '変更を保存',
      pending: '確認中…',
      edit: 'ソースを変更',
      cancelEdit: 'キャンセル',
      saved: 'ソースを保存しました。',
    },
    errors: {
      SOURCE_FORBIDDEN:
        'このフォルダーは使用できません：ネットワークフォルダー、アプリのフォルダー、またはアプリのデータフォルダーを含むフォルダーです。',
      SOURCE_UNREADABLE:
        'フォルダーが存在しないか、アプリに読み取り権限がありません。',
      SOURCE_REVISION_CONFLICT:
        'ソースが別の操作で更新されました。ソースを再読み込みしてから保存し直してください。入力内容は保持されています。',
      SOURCE_PROFILE_UNSUPPORTED:
        'この解析プロファイルはこのバージョンでは未対応です。',
      PROJECT_MODE_CONFLICT:
        'デモプロジェクトにはソースフォルダーを登録できません。ローカルソースのプロジェクトを作成してください。',
    },
    outcomeUnknown:
      'バックエンドがソースを保存したか確認できませんでした。再送信する前にソースを再読み込みして確認してください。',
    startBlocked:
      '解析の前に、読み取り可能なソースフォルダーを登録してください。',
  },
  runs: {
    title: '解析（デモ）',
    titleLocal: '解析',
    demoNotice:
      'デモ実行はサンプルデータ上の模擬エグゼキューターを使用します。ソースコードは読み込まず、アプリ同梱のサンプルインベントリ結果のみを公開します。',
    localNotice:
      '実行時に登録フォルダーの不変スナップショットを作成します（読み取りのみ）。インベントリとレポートはこのバージョンでは未対応です。',
    snapshotTaken: 'スナップショット作成済み',
    loading: '実行を読み込み中…',
    reload: '実行を再読み込み',
    start: '解析を開始',
    starting: 'リクエストを送信中…',
    resend: 'リクエストを再送信',
    cancel: '実行をキャンセル',
    cancelSending: 'キャンセルを送信中…',
    retry: '再実行',
    noRun: 'このプロジェクトの実行はまだありません。',
    current: '表示中の実行',
    history: '実行履歴',
    loadMore: 'さらに読み込む',
    view: '表示',
    viewing: '表示中',
    connectionLost:
      'バックエンドとの接続が切れました。再試行しています… 実行状態は最後に受信したものです。',
    startUncertain:
      'バックエンドが実行リクエストを受け付けたか確認できませんでした。「リクエストを再送信」は同じリクエストを使うため、2つ目の実行は作成されません。',
    cancelUncertain:
      'キャンセルリクエストを確認できませんでした。バックエンドから状態を再読み込みしています。',
    fields: {
      id: '実行ID',
      status: '状態',
      stage: '現在のステップ',
      createdAt: '作成日時',
      startedAt: '開始',
      finishedAt: '終了',
      error: 'エラー理由',
      retryOf: '再実行元',
    },
    status: {
      queued: '待機中',
      running: '実行中',
      cancelling: 'キャンセル中…',
      succeeded: '完了（デモ）',
      failed: '失敗',
      cancelled: 'キャンセル済み',
      interrupted: '中断',
    },
    stage: {
      snapshot: 'ソースのスナップショット',
      inventory: 'インベントリ',
      publish: '公開',
    },
    interruptedHelp:
      '実行中にバックエンドが停止しました。自動では再実行しません。必要な場合は「再実行」を使ってください。',
    runError: {
      SOURCE_UNREADABLE: 'ソースコードを読み込めませんでした。',
      SOURCE_FORBIDDEN: 'ソースコードを読み込む権限がありません。',
      SOURCE_CHANGED: '実行中にソースコードが変更されました。',
      SOURCE_LIMIT_EXCEEDED: 'ソースコードが上限を超えています。',
      SOURCE_PROFILE_UNSUPPORTED: 'ソースプロファイルに対応していません。',
      ANALYSIS_OUTPUT_INVALID: '解析結果が正しくありません。',
      ARTIFACT_WRITE_FAILED: '結果を保存できませんでした。',
      TIMEOUT: '実行が制限時間を超えました。',
      STOP_UNCONFIRMED:
        '処理の停止を確認できませんでした。続行する前にバックエンドを再起動してください。',
      INTERNAL_ERROR: '実行中にバックエンドでエラーが発生しました。',
    },
    errors: {
      RUN_NOT_FOUND: 'このプロジェクトに該当する実行が見つかりません。',
      RUN_ACTIVE_CONFLICT:
        'このプロジェクトでは別の実行が進行中です。進行中の実行を表示しました。',
      RUN_STATE_CONFLICT:
        '実行の状態が変わりました。最新の状態を再読み込みしました。',
      IDEMPOTENCY_KEY_CONFLICT:
        '実行リクエストが以前のリクエストと一致しません。再読み込みしてから再試行してください。',
      SOURCE_REVISION_CONFLICT:
        'プロジェクトのソースが変更されました。再読み込みしてから再試行してください。',
      SNAPSHOT_UNAVAILABLE:
        '元の実行には再利用できるソーススナップショットがありません。',
      SOURCE_PROFILE_UNSUPPORTED:
        'このバージョンはソースプロファイルに対応していません。',
      SOURCE_NOT_REGISTERED: 'プロジェクトのソースが登録されていません。',
      RUNTIME_RECOVERY_REQUIRED:
        '停止を確認できなかった実行があるため、バックエンドの再起動が必要です。新しい実行は作成されていません。',
    },
  },
  assessment: {
    title: 'アセスメント概要',
    loading: 'インベントリ結果を読み込み中…',
    retry: '結果を再読み込み',
    empty:
      'この実行にはインベントリ結果がありません。このPC上のソースの実行は現在スナップショットのみで、インベントリは今後のバージョンで対応します。',
    demoData: 'アプリ同梱のサンプル結果です（実ソースではありません）',
    localData: 'このPC上のソースのスナップショットから作成したインベントリ',
    draftNotice:
      '数値は静的解析によるもので、レビューされるまではドラフトです。複雑度は参考値であり、工数や見積の自動算出には使用しません。',
    partialTitle: 'インベントリは不完全です。',
    partialHelp:
      '解析できなかったファイルまたはプログラムがあります。以下の数値にはその部分が含まれていません。',
    warningsTitle: '警告',
    fields: {
      mode: 'データ',
      artifact: '結果（バージョン）',
      snapshot: 'ソーススナップショット',
      createdAt: '作成日時',
      versions: '計測バージョン',
      tableMapping: 'テーブル名マッピング',
    },
    mapping: {
      unconfigured: '未設定（大文字・小文字のみ統合）',
      assumed: '仮定（DB管理者の確認が必要）',
      confirmed: '確認済み',
      absent: 'なし（旧インベントリ、ソース上の名前のみ）',
    },
    totals: {
      uniqueTitle: 'ソース全体の合計（重複なし）',
      uniqueHelp: '共通ファイルも含め、各ファイルを1回だけ数えます。',
      perProgramTitle: 'プログラム別の合計',
      perProgramHelp:
        '各プログラムのLoCを合算します。共通ファイルは宣言した各プログラムで数えられるため、ソース規模ではありません。',
      codeLines: 'コード行数（LoC）',
      physicalLines: '物理行数',
      coverage: '解析済みコードファイル',
      coverageValue: (analyzed: string, total: string) =>
        `${analyzed} / ${total}`,
      files: 'ファイル総数',
      sharedFiles: '共通ファイル',
      problemFiles: 'エラー / 未対応 / スキップ',
      problemValue: (errors: string, unsupported: string, skipped: string) =>
        `${errors} / ${unsupported} / ${skipped}`,
      unknown: '不明',
      programs: 'プログラム数',
      perProgramCodeLines:
        'プログラム別LoCの合算（共通ファイルを重複して計上）',
    },
    warnings: {
      PROGRAM_UNSUPPORTED: '解析できないプログラムがあります。',
      PROGRAM_INCOMPLETE:
        'ファイルが不足している、または未解析のファイルがあるプログラムがあります。',
      MEMBER_UNRESOLVED:
        'プロジェクトで宣言されたファイルが見つからない、または特定できません。',
      FILE_ERROR: 'デコードできないファイルがあります。',
      FILE_UNSUPPORTED: '未対応のコードファイルがあります。',
      FILES_SKIPPED:
        'スキップされたファイルがあります（リンクまたはサイズ超過）。',
      UNCLASSIFIED_LINES: '分類できない行があります。',
      TABLE_NAMES_NOT_CONFIRMED: 'テーブル名マッピングは未確認です。',
      COMPLEXITY_DRAFT: '複雑度の計算式はドラフトです。',
      COMPLEXITY_REVIEW:
        '複雑度の確認が必要なプログラムがあります（高、またはしきい値付近）。',
    },
    programs: {
      title: 'プログラム一覧',
      search: 'プログラムを検索',
      stateFilter: '状態',
      levelFilter: '複雑度',
      all: 'すべて',
      count: (shown: number, total: number) =>
        `${total} 件中 ${shown} 件のプログラムを表示`,
      noMatch: '条件に一致するプログラムはありません。',
      none: 'インベントリにプログラムがありません。',
      notAnalyzed: '未解析',
      mappedTables: (count: string) => `（マッピング後: ${count}）`,
      draft: 'ドラフト',
      needsReview: '要確認',
      columns: {
        program: 'プログラム',
        state: '状態',
        ownCodeLines: '固有LoC',
        codeLines: '共通ファイル込みLoC',
        procedures: '固有プロシージャ',
        tables: 'テーブル数',
        complexity: '複雑度（参考）',
      },
      state: {
        complete: '完全',
        partial: '不完全',
        unsupported: '解析不可',
      },
      level: { low: '低', medium: '中', high: '高' },
    },
    members: {
      title: (program: string) => `${program} のファイル`,
      issue: '解析できない理由:',
      none: '宣言されたファイルはありません。',
      shared: '共通',
      resolution: {
        'case-mismatch': '大文字・小文字の不一致',
        ambiguous: '特定不可',
        missing: '見つかりません',
        'outside-root': 'ソースフォルダー外',
        'absolute-path': '絶対パス',
      },
      fileStatus: {
        unsupported: '未対応',
        error: '読み取りエラー',
        other: 'コード以外',
      },
    },
    errors: {
      ARTIFACT_NOT_FOUND:
        'このプロジェクトに該当するバージョンの結果が見つかりません。実行を再読み込みしてください。',
      mismatch:
        '受信した結果が要求したバージョンと一致しません。結果を再読み込みしてください。',
    },
  },
  errors: {
    unexpected: '処理中にエラーが発生しました。もう一度お試しください。',
    outcomeUnknown:
      '保存結果を確認できませんでした。再作成する前に、プロジェクト一覧を再読み込みして確認してください。',
    http: {
      INVALID_INPUT:
        'リクエスト情報が正しくありません。データを確認して再試行してください。',
      PROJECT_NOT_FOUND: 'プロジェクトが見つかりません。',
      ROUTE_NOT_FOUND:
        '要求されたAPIが見つかりません。フロントエンドとバックエンドのバージョンを確認してください。',
      PAYLOAD_TOO_LARGE: '送信データが許容サイズを超えています。',
      UNSUPPORTED_MEDIA_TYPE:
        '送信データの形式に対応していません。フロントエンドとバックエンドのバージョンを確認してください。',
      INTERNAL_ERROR:
        'バックエンドでエラーが発生しました。しばらくしてから再試行してください。',
      HOST_NOT_ALLOWED:
        'バックエンドがアクセス先アドレスを拒否しました。設定されたループバックアドレスでアプリを開いてください。',
      ORIGIN_NOT_ALLOWED:
        'バックエンドが送信元ページを拒否しました。設定されたアドレスでアプリを開いてください。',
      CREDENTIAL_INVALID:
        'セッションの有効期限が切れたため、リクエストは処理されていません。もう一度お試しください。',
    },
    failure: {
      http: 'リクエストを完了できませんでした。バックエンドを確認して再試行してください。',
      network:
        'バックエンドに接続できません。起動状態を確認して再試行してください。',
      timeout:
        'リクエストがタイムアウトしました。バックエンドを確認して再試行してください。',
      'invalid-response':
        '応答形式が正しくありません。フロントエンドとバックエンドのバージョンを確認してください。',
      credential:
        'バックエンドとのセッションに接続できないため、リクエストは送信されていません。再接続してください。',
    },
    invalidInput: {
      create:
        'プロジェクトの作成情報が正しくありません。データとアプリのバージョンを確認して再試行してください。',
      get: 'プロジェクトIDが正しくありません。一覧を再読み込みして選択し直してください。',
      list: '一覧の取得条件が正しくありません。一覧を再読み込みして再試行してください。',
      runs: '実行リクエストが正しくありません。実行を再読み込みしてから再試行してください。',
      source:
        'ソース情報が正しくありません。パスはこの端末の絶対パスで入力してください。',
    },
  },
} satisfies Messages;
