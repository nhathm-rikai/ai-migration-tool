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
        'このバージョンでは、ソース解析、レビュー、レポート作成は未対応です。',
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
    },
    failure: {
      http: 'リクエストを完了できませんでした。バックエンドを確認して再試行してください。',
      network:
        'バックエンドに接続できません。起動状態を確認して再試行してください。',
      timeout:
        'リクエストがタイムアウトしました。バックエンドを確認して再試行してください。',
      'invalid-response':
        '応答形式が正しくありません。フロントエンドとバックエンドのバージョンを確認してください。',
    },
    invalidInput: {
      create:
        'プロジェクトの作成情報が正しくありません。データとアプリのバージョンを確認して再試行してください。',
      get: 'プロジェクトIDが正しくありません。一覧を再読み込みして選択し直してください。',
      list: '一覧の取得条件が正しくありません。一覧を再読み込みして再試行してください。',
    },
  },
} satisfies Messages;
