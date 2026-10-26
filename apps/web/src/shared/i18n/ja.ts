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
  runs: {
    title: '解析（デモ）',
    demoNotice:
      'デモ実行はサンプルデータ上の模擬エグゼキューターを使用します。ソースコードは読み込まず、解析結果も作成しません。',
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
    },
  },
} satisfies Messages;
