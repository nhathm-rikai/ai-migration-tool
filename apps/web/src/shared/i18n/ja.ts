import {
  PROJECT_NAME_MIN_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
} from '@portal/contracts';
import type { ProgramState } from '../../features/assessment/assessment-summary';
import type { Messages } from './vi';

export const jaMessages = {
  app: {
    skipToContent: 'メインコンテンツへ移動',
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
  shell: {
    project: 'プロジェクト',
    newProject: '新規プロジェクト',
    chooseProject: 'ソースフォルダーを選択して開始',
    projectDetail: {
      demo: 'VB6 · サンプルデータ',
      local: 'VB6 · このPC上のソース',
      noSource: 'ソース未選択',
    },
    pageTitles: {
      source: '顧客ソースコードの取込',
      analysis: 'ソースコード解析',
      documents: 'ドキュメント生成',
      review: 'ドキュメントのレビュー・承認',
      quote: '見積',
    },
    stepsTitle: 'ワークフロー',
    steps: {
      source: 'ソース取込',
      analysis: '解析',
      documents: 'ドキュメント生成',
      review: 'レビュー・承認',
      quote: '見積',
    },
    stepState: {
      done: '完了済み',
      todo: '未実施',
      unavailable: '利用不可',
    },
    selectProjectFirst: 'プロジェクトを選択または作成すると各手順を開けます。',
    projectLoading: 'プロジェクトを開いています…',
    retry: '再試行',
    stepEyebrow: (index: number) => `ステップ ${index} / 5`,
    unavailable: {
      title: 'まだ利用できません',
      reasons: {
        documents:
          'AIによるドキュメント生成はこの版では未提供です。提供後は手順2の解析結果を使い、プログラムごとにドキュメントを生成します。',
        review:
          'レビュー・承認にはドキュメント生成の成果物が必要ですが、この版では未提供です。',
        quote:
          '解析結果に基づく見積はこの版では未提供です。見積モデルがまだ設定・承認されていません。',
      },
      back: '解析に戻る',
    },
    analysis: {
      loading: '解析結果を探しています…',
      loadFailed: 'プロジェクトの解析状況を読み込めませんでした。',
      empty: '解析結果はまだありません',
      emptyHelp:
        'ソース取り込みの手順で解析を開始してください。実行が完了し棚卸しが作成されると、ここに表示されます。',
      goSource: 'ソース取り込みへ',
      olderRun: '特定の実行の結果を表示しています。',
      latest: '最新の結果を表示',
    },
    notFound: {
      title: 'ページが見つかりません',
      help: 'このアドレスはアプリにありません。',
      projectTitle: 'プロジェクトが見つかりません',
      projectHelp: 'アドレスのプロジェクトは存在しないか、削除されています。',
      back: 'ソース取込へ戻る',
    },
  },
  projects: {
    results: '解析結果',
    fixture: 'サンプルデータ',
    demoBadge: 'DEMO',
    localBadge: 'LOCAL',
    assessmentSteps: 'アセスメントの手順',
    create: {
      nameInvalid: `プロジェクト名は${PROJECT_NAME_MIN_LENGTH}～${PROJECT_NAME_MAX_LENGTH}文字で入力してください。空白のみの名前は使用できません。`,
    },
  },
  source: {
    loading: 'ソース情報を読み込み中…',
    reload: 'ソースを再読み込み',
    form: {
      rootPathHelp:
        '例：C:\\work\\order-module、/home/dev/order-module。バックエンドがフォルダーと読み取り権限を確認します。内容は解析の実行時にのみ読み込まれます。',
      rootPathInvalid: 'ソースフォルダーのパスを入力してください。',
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
  },
  sourceStep: {
    lead: '旧システムのソースフォルダーを選択します。処理はすべてこの端末で行われ、ソースが端末の外に出ることはありません。',
    hero: {
      chooseTitle: 'ソースフォルダーを選択',
      chosenTitle: 'フォルダーを選択しました',
      chosenHelp:
        '下のプロジェクト情報を確認して「ソースをスキャン」を押してください。',
      demoHelp:
        'デモプロジェクトはアプリ同梱のサンプルをスキャンします。端末のフォルダーは読み込みません。',
      unreadableHelp:
        '選択したフォルダーを読み込めません。フォルダーを確認するか、別のフォルダーを選択してください。',
      scan: 'ソースをスキャン',
      changeFolder: 'フォルダーを変更',
      queuedTitle: '開始を待っています…',
      scanningTitle: 'フォルダーをスキャンしています…',
      cancellingTitle: 'スキャンをキャンセルしています…',
      progressDone: 'スキャンの進捗',
      files: (done: number, total: number) => `${done} / ${total} ファイル`,
      megabytes: (value: string) => `${value} MB`,
      readingFiles: '読み込み中のファイル',
      progressLabel: 'スキャン中（ファイル総数は未確定）',
      stage: (stage: string) => `現在の工程：${stage}`,
      doneTitle: 'スキャン完了・解析画面へ移動します…',
      goNow: 'すぐに結果を見る',
      endedTitle: {
        failed: 'スキャンに失敗しました',
        cancelled: 'スキャンをキャンセルしました',
        interrupted: 'スキャンが中断されました',
      },
      cancelledHelp:
        '要求によりスキャンを停止しました。新しい結果はありません。',
      lastResult: '前回のスキャン結果を見る',
      target: 'スキャン対象',
      targetFolder: 'フォルダー',
      targetLanguage: '言語',
      noFileCount:
        'ファイル数と進捗率は、バックエンドがファイル単位の進捗を報告すると表示されます。',
    },
    steps: {
      title: '進行状況',
      items: [
        'フォルダー構成の読み込み',
        'スナップショットとハッシュ',
        '解析（デコード・SQL・コールグラフ）',
        '結果の保存',
      ],
      state: { done: '完了', active: '処理中', todo: '未着手' },
    },
    form: {
      title: 'プロジェクト情報',
      name: 'プロジェクト名',
      folder: 'ソースフォルダーのパス（絶対パス）',
      pick: 'フォルダーを選択',
      picking: 'ダイアログを開いています…',
      pickingHelp:
        'この端末でフォルダー選択ダイアログが開いています。フォルダーを選んで OK を押してください。',
      useFolder: 'このフォルダーを使用',
      pickerUnavailable: {
        'no-tool':
          'この端末にはフォルダー選択ダイアログがありません。下にフォルダーのパスを入力してください。',
        failed:
          'フォルダー選択ダイアログを開けませんでした。下にフォルダーのパスを入力してください。',
        timeout:
          '選択されないまま時間が経過したため、ダイアログを閉じました。もう一度押すか、下にパスを入力してください。',
      },
      cancel: 'キャンセル',
      saving: '確認中…',
      demoFolder: (fixtureId: string) => `${fixtureId}（サンプル）`,
      language: '解析言語（1つ選択）',
      languageRequired: 'スキャンする前に解析言語を選択してください。',
      comingSoon: '対応予定',
    },
    recent: {
      title: '最近のプロジェクト',
      search: '名前でプロジェクトを検索',
      noMatch: '一致するプロジェクトはありません。',
      new: '+ 新規プロジェクト',
      loading: '最近のプロジェクトを読み込んでいます…',
      failed: 'プロジェクト一覧を読み込めませんでした。',
      empty: 'プロジェクトはまだありません。',
      open: '表示中',
      updated: (date: string) => `更新 ${date}`,
      status: {
        none: '未解析',
        active: '解析中',
        succeeded: '解析済み',
        failed: '失敗',
        cancelled: 'キャンセル済み',
        interrupted: '中断',
        unknown: '状態を取得できません',
      },
    },
  },
  runs: {
    demoNotice:
      'デモ実行はサンプルデータ上の模擬エグゼキューターを使用します。ソースコードは読み込まず、アプリ同梱のサンプルインベントリ結果のみを公開します。',
    localNotice:
      '実行時に登録フォルダーの不変スナップショットを作成し（読み取りのみ）、そのスナップショットから静的インベントリを作成します。業務理解とレポートはこのバージョンでは未対応です。',
    localSucceeded: '完了',
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
    openResults: '解析結果を表示',
    technical: '技術情報',
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
      RUN_EVENTS_LIMIT:
        '実行を監視するストリームが多すぎます。状態は定期的に更新されます。',
      RUNTIME_RECOVERY_REQUIRED:
        '停止を確認できなかった実行があるため、バックエンドの再起動が必要です。新しい実行は作成されていません。',
    },
  },
  assessment: {
    title: 'アセスメント概要',
    tabsLabel: '解析結果の項目',
    tabs: {
      programs: 'プログラム一覧',
      graph: 'コールグラフ',
      tables: 'DBテーブル',
    },
    dashboard: {
      kpis: {
        programs: 'プログラム',
        programsSub: (complete: string) => `完全 ${complete}`,
        physical: '物理行数',
        physicalSub: 'コード',
        procedures: 'プロシージャ',
        proceduresSub: '解析済みコードファイル',
        perProgram: 'プログラム別合計（共有ファイル重複あり）',
        sql: 'SQLアクセス箇所',
        sqlSub: (count: string) => `実行時の値を連結したSQL ${count} 件`,
        sqlSubOld: 'テーブルアクセスのある行（ファイルごとに1回）',
        tables: 'アクセスされるテーブル',
        tablesMapped: 'テーブル名マッピング後',
        tablesInferred: (schema: string) =>
          `マッピング後 · スキーマ ${schema} と仮定`,
        tablesRaw: 'ソース記載の名前',
        high: '高・非常に高のプログラム',
        highSub: (analyzed: string) => `解析済み ${analyzed} 本中 · 参考`,
      },
      analysedAt: (time: string) => `解析完了 ${time}`,
      files: (count: string) => `${count} ファイル`,
      sharedFiles: (count: string) => `共有 ${count} ファイル`,
      locTitle: 'コード行の内訳',
      locTotal: '物理行数',
      loc: {
        code: 'コード',
        comment: 'コメント',
        blank: '空行',
        designer: 'デザイナー + メタデータ',
        unclassified: '未分類',
      },
      histogramTitle: '複雑度の分布',
      histogramPrograms: (count: string) => `${count} プログラム`,
      histogramNote: (version: string) => `参考 · ${version}`,
      notAnalyzed: (count: string) => `未解析 ${count} プログラム`,
      sectionLabel: '解析の詳細',
      graph: {
        loading: 'コールグラフを読み込み中…',
        empty: 'インベントリにグラフを描画するプログラムがありません。',
        lanes: {
          program: 'プログラム',
          own: '専用モジュール',
          shared: '共通モジュール',
          tables: 'DBテーブル · COM',
        },
        kinds: {
          program: 'プログラム',
          'own-module': '専用モジュール',
          'shared-module': '共通',
          table: 'DBテーブル',
          component: 'COM',
        },
        summary: (nodes: string, edges: string, calls: string) =>
          `${nodes} ノード · ${edges} エッジ · ファイル間呼び出し ${calls} 回`,
        tableView: {
          mapped: 'マッピング後のテーブル名',
          raw: 'ソース上のテーブル名',
        },
        showCommon: (count: string) =>
          `ほぼ全プログラムが使うモジュールを表示（${count}）`,
        showCommonTitle:
          '80% を超えるプログラムが宣言するモジュール/COM（主に定数・共通処理）。ほぼすべてのプログラムにつながりグラフが煩雑になるため非表示にしています。共通モジュールのパネルには「非表示」付きで表示されます。',
        lanesLabel: '左から右へのレーン順',
        layoutPending: 'グラフを配置中…',
        layoutFailed:
          '自動配置できなかったため、簡易レーン配置で表示しています。',
        canvasLabel: 'プロジェクト全体のコールグラフ',
        rootGroup: '（ルートフォルダ）',
        groupCount: (count: string) => `${count} プログラム`,
        boxCount: (count: string) => `${count} ノード`,
        folderType: 'フォルダ',
        expandFolder: (folder: string, count: string) =>
          `フォルダ ${folder} を開く（${count}）`,
        collapseFolder: (folder: string) => `フォルダ ${folder} を閉じる`,
        expandBox: (box: string, count: string) => `${box} を開く（${count}）`,
        collapseBox: (box: string) => `${box} を閉じる`,
        collapse: '閉じる',
        focusBox: (box: string, count: string) =>
          `${box}（${count}）の接続を強調表示`,
        openBox: '展開',
        fullScreen: '全画面で表示',
        exitFullScreen: '全画面を終了',
        openBoxes: '展開中',
        showBox: (box: string) => `${box} を表示範囲に移動`,
        expandAll: 'すべてのフォルダを開く',
        collapseAll: 'すべて閉じる',
        search: 'プログラム・モジュール・テーブルを検索',
        searchResults: '検索結果',
        searchNone: '該当するノードはありません。',
        state: {
          complete: '完全',
          partial: '不完全',
          unsupported: '未解析',
        } satisfies Record<ProgramState, string>,
        unknownDependencies: '未解析のため依存関係は不明です',
        missingMembers: (count: string) =>
          `宣言されたファイル ${count} 件が見つかりません`,
        focusNode: (kind: string, label: string) =>
          `${kind} ${label} を強調表示`,
        calls: (count: string) => `呼び出し ${count} 回`,
        commonTitle: '共通モジュール（ファンイン）',
        commonNote:
          'ファンイン = ファイルを宣言するプログラム数。ファンインが高いモジュールは変更の影響が大きいため、先にドキュメント化することを推奨します。',
        commonHidden: '非表示中',
        commonNone: '共通モジュールはありません。',
        focusedTitle: '選択中のノード',
        clearFocus: '選択解除',
        fanIn: 'ファンイン',
        fanOut: 'ファンアウト',
        callers: '呼び出し元ファイル',
        flow: {
          controls: 'ズーム操作',
          zoomIn: '拡大',
          zoomOut: '縮小',
          fitView: '全体を表示',
          minimap: 'ミニマップ',
        },
      },
      tablesNone: 'テーブルアクセスは検出されませんでした。',
      tablesPagination: 'DBテーブルのページ',
      columns: {
        table: 'テーブル',
        programs: 'プログラム',
        locations: 'アクセス箇所',
        top: '最も多くアクセスするプログラム',
      },
      createDocs: 'このプログラムのドキュメントを生成',
      detailColumn: '詳細を開く',
      expand: (program: string) => `${program} の詳細を開く`,
      kinds: {
        form: 'Form',
        module: 'Module',
        class: 'Class',
        'user-control': 'UserControl',
        'property-page': 'PropertyPage',
        'user-document': 'UserDocument',
        designer: 'Designer',
      },
    },
    technical: '技術情報',
    programCount: (count: string) => `${count} プログラム`,
    showPrograms: '一覧を表示',
    moreMissing: (count: string) => `ほか ${count} ファイル`,
    loading: 'インベントリ結果を読み込み中…',
    retry: '結果を再読み込み',
    empty:
      'この実行にはインベントリ結果がありません（以前のバージョンで作成したこのPC上のソースの実行はスナップショットのみです）。再実行するとインベントリを作成します。',
    demoData: 'アプリ同梱のサンプル結果です（実ソースではありません）',
    localData: 'このPC上のソースのスナップショットから作成したインベントリ',
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
    mappingInferred: (schema: string) =>
      `スキーマ ${schema} と仮定（ソースで最も多い接頭辞、未確認）`,
    totals: {
      coverageValue: (analyzed: string, total: string) =>
        `${analyzed} / ${total}`,
    },
    tableSchema: {
      assumed: (schema: string, inferred: boolean) =>
        inferred
          ? `テーブル名はスキーマ ${schema} を仮定してまとめています（ソースで最も多い接頭辞）。`
          : `テーブル名はスキーマ ${schema} を仮定してまとめています。`,
      none: '既定スキーマがないため、テーブル名はソースのままです。',
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
        'スキップされたファイルがあります（リンク、サイズ超過、または読み取り不可）。',
      UNCLASSIFIED_LINES: '分類できない行があります。',
      TABLE_NAMES_NOT_CONFIRMED: 'テーブル名マッピングは未確認です。',
      COMPLEXITY_DRAFT: '複雑度の計算式はドラフトです。',
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
      rawTables: (count: string) => `（元: ${count}）`,
      draft: 'ドラフト',
      declaredName: (name: string) => `プロジェクト内の名前: ${name}`,
      sortBy: (column: string) => `${column}で並べ替え`,
      pageSize: '1ページの行数',
      page: (page: number, pages: number) => `${page} / ${pages} ページ`,
      previous: '前のページ',
      next: '次のページ',
      pagination: 'プログラム一覧のページ',
      columns: {
        program: 'プログラム',
        kind: '種類',
        state: '状態',
        ownCodeLines: '固有LoC',
        codeLines: 'LoC（共通込み）',
        procedures: '固有プロシージャ',
        tables: 'テーブル数',
        complexity: '複雑度',
      },
      columnHints: {
        codeLines:
          '共通ファイルを含むLoC（共通ファイルは宣言する各プログラムで数える）',
        complexity: '参考の複雑度。工数の算出には使いません',
      },
      state: {
        complete: '完全',
        partial: '不完全',
        unsupported: '解析不可',
      },
      level: { low: '低', medium: '中', high: '高', 'very-high': '非常に高' },
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
    detail: {
      title: (program: string) => `プログラム ${program} の詳細`,
      tabsLabel: 'プログラム詳細の項目',
      tabs: {
        summary: '概要',
        files: 'ファイル',
        procedures: 'プロシージャ',
        crud: 'CRUD',
        calls: '呼び出し',
        graph: '呼び出し図',
      },
      rowRange: (from: string, to: string, total: string) =>
        `${total} 行中 ${from}–${to} 行`,
      rowsPagination: '表のページ',
      issue: '解析できない理由:',
      incomplete:
        'このプログラムは不完全です（ファイル不足、未対応、または未分類の行があります）。数値は解析できた部分のみです。',
      unavailable:
        'このプログラムは解析されていないため、LoC・CRUD・呼び出しはありません（0とは表示しません）。',
      notAnalyzed: '未解析',
      ownCodeLines: '固有LoC',
      codeLines: '共通ファイル込みLoC',
      ownProcedures: '固有プロシージャ',
      rawComplexity: '複雑度（ソース上のテーブル名）',
      mappedComplexity: 'マッピング後の複雑度',
      proceduresTitle: 'プロシージャとLoC',
      proceduresHelp:
        'プロシージャごとのLoCはインベントリの計測バージョンによります。共通ファイルのプロシージャは他のプログラムにも属します。',
      noProcedures: '解析済みファイルにプロシージャはありません。',
      crudTitle: 'テーブル別CRUD',
      showRaw: '元の名前を表示',
      showMapped: 'マッピング後を表示',
      crudViews: {
        raw: 'ソース上の名前',
        mapped: 'テーブル名マッピング後',
      },
      noCrud: 'テーブルへのアクセスは検出されませんでした。',
      viaShared: '共通ファイル経由のみ',
      callsTitle: '呼び出し',
      callsHelp:
        '名前による静的解析です（実行はしません）。複数のプロシージャに一致する名前は推測せず、未特定とします。',
      noCalls: '記録された呼び出しはありません。',
      ambiguousTarget: '未特定',
      candidates: '候補:',
      resolution: {
        local: '同一ファイル内',
        program: 'プログラム内',
        ambiguous: '未特定',
        external: '外部API',
      },
      externalTitle: '外部依存',
      noExternal: '外部参照・外部APIはありません。',
      externalUnknown:
        '未解析のため外部APIは特定できていません。プロジェクトファイルから読み取れた参照のみ表示します（ある場合）。',
      externalPartial:
        'このプログラムは不完全です。一覧は解析済みの部分のみで、未検出の依存がある可能性があります。',
      externalApi: '外部API',
      referenceKind: {
        reference: '参照',
        component: 'コンポーネント',
      },
      columns: {
        file: 'ファイル',
        kind: '種別',
        codeLines: 'LoC',
        procedures: 'プロシージャ',
        procedure: 'プロシージャ',
        lines: '行',
        decisions: '分岐数',
        table: 'テーブル',
        sourceNames: 'ソース上の名前',
        operations: '操作',
        evidence: '根拠',
        caller: '呼び出し元',
        callee: '呼び出し名',
        resolution: '特定',
        targets: '呼び出し先',
        uses: '回数',
      },
      graph: {
        loading: '呼び出し図を読み込み中…',
        empty: 'このプログラムの解析済みファイルにプロシージャがありません。',
        lanes: {
          own: '専用プロシージャ',
          shared: '共通プロシージャ',
          api: '外部API',
          tables: 'DBテーブル',
        },
        kinds: { api: '外部API', table: 'DBテーブル' },
        fileLevel: 'プロシージャ外',
        shared: '共通',
        summary: (own: string, shared: string, edges: string) =>
          `専用プロシージャ ${own} · 到達可能な共通プロシージャ ${shared} · 関係 ${edges}`,
        tableView: {
          mapped: 'マッピング後のテーブル名',
          raw: 'ソース上のテーブル名',
        },
        showIsolated: (count: string) =>
          `呼び出し関係のないプロシージャ ${count} 件を表示`,
        layoutPending: '図を配置しています…',
        layoutFailed:
          '図を自動配置できなかったため、簡易レーンで表示しています。',
        canvasLabel: 'プロシージャ間の呼び出し図',
        fullScreen: '全画面で表示',
        exitFullScreen: '全画面を終了',
        sideLabel: '選択中のプロシージャ',
        sideHint:
          '図または検索でプロシージャを選ぶと、呼び出し元・呼び出し先・アクセスするテーブルを表示します。',
        note: '名前による静的解析で、プログラムは実行していません。破線は特定できない呼び出し（同名のプロシージャが複数）です。オブジェクト経由の呼び出し（Form1.Foo）は結び付けられません。一覧は「呼び出し」タブにあります。',
        search: 'プロシージャ・API・テーブルを検索',
        searchResults: '検索結果',
        searchNone: '該当するノードがありません。',
        focusNode: (kind: string, label: string) =>
          `${kind} ${label} を強調表示`,
        uses: (count: string) => `${count} 回`,
        dynamicSql: (count: string) => `動的SQL ${count} 件`,
        ambiguous: '未特定',
        candidate: '候補',
        candidateNote:
          '特定できない呼び出し（同名のプロシージャが複数）の候補にすぎません。呼び出されるとは限らないため、その先の呼び出しやテーブルアクセスは描画しません。',
        focusedTitle: '選択中のプロシージャ',
        clearFocus: '選択解除',
        codeLines: 'LoC',
        decisions: '分岐点',
        callers: '呼び出し元',
        calledBy: '呼び出し元',
        callsTo: '呼び出し先',
        tables: 'アクセスするテーブル',
        noEdges: '呼び出し・被呼び出し・テーブルアクセスはありません。',
        flow: {
          controls: 'ズーム操作',
          zoomIn: '拡大',
          zoomOut: '縮小',
          fitView: '全体を表示',
          minimap: 'ミニマップ',
        },
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
      FOLDER_PICKER_BUSY:
        'フォルダー選択ダイアログがすでに開いています。そのダイアログで選択するか、閉じてから再試行してください。',
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
      update:
        'プロジェクト情報が正しくありません。プロジェクト名と顧客を確認して再試行してください。',
      source:
        'ソース情報が正しくありません。パスはこの端末の絶対パスで入力してください。',
    },
  },
} satisfies Messages;
