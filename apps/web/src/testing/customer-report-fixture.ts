import type { CustomerReportDocument } from '@portal/contracts';

type Item = CustomerReportDocument['items'][number];

// Hand-written customer report JSON (numbers are set here, not computed):
// the invented demo corpus. 3 programs, 3 screens (1 shared), 3 reports
// found + 2 suspected, 1 batch.
const item = (
  row: Partial<Item> & Pick<Item, 'type' | 'name' | 'file'>,
): Item => ({
  kindLabel: '',
  programs: 'ORDER',
  module: 'programs/ORDER',
  line: null,
  shared: false,
  confidence: 'detected',
  confidenceLabel: '検出',
  level: null,
  levelLabel: null,
  score: null,
  modelVersion: null,
  factors: '',
  note: '',
  ...row,
});

export function customerReportFixture(): CustomerReportDocument {
  return {
    reportVersion: 'customer-assessment-report-v1',
    language: 'ja',
    source: {
      origin: {
        mode: 'demo',
        projectId: 'p-1',
        projectName: 'デモ受注管理',
        runId: 'run-0001',
        artifactId: 'artifact-0001',
        artifactVersion: 1,
        createdAt: '2026-11-06T09:00:00.000Z',
      },
      snapshotHash: '56c0b728afaa' + '0'.repeat(52),
      versions: {
        complexityVersion: 'complexity-v1',
        screenReportVersion: 'screen-report-v1',
        reportComplexityVersion: 'report-complexity-v1-draft',
      },
    },
    scale: {
      programs: 3,
      completePrograms: 2,
      files: 9,
      analyzedFiles: 4,
      codeLines: 655,
      commentLines: 90,
      blankLines: 77,
      physicalLines: 830,
      procedures: 6,
      tables: 4,
      tablesView: 'normalized',
      screenReport: {
        screens: 3,
        sharedScreens: 1,
        batches: 1,
        // rows / counted = report TEMPLATES; suspected = print and export
        // functions to confirm.
        reports: {
          rows: 3,
          counted: 3,
          suspected: 2,
          byKind: {
            'data-report': 1,
            crystal: 2,
            excel: 1,
            print: 1,
            'file-output': 0,
            unknown: 0,
          },
          byLevel: { low: 0, medium: 1, high: 1, 'very-high': 0, unrated: 1 },
        },
        suspectedPrograms: 2,
      },
      reportTemplates: { templates: 3, designFile: 2, missingFile: 1 },
      outputFunctions: {
        functions: 2,
        programs: 2,
        excluded: 0,
        groups: {
          export: { functions: 1, programs: 1 },
          print: { functions: 1, programs: 1 },
        },
      },
    },
    modules: [
      {
        module: 'programs/CUSTOMER',
        kind: 'module',
        programs: 1,
        screens: 0,
        reports: 0,
        suspectedReports: 1,
        batches: 1,
        files: 1,
        codeLines: 140,
      },
      {
        module: 'programs/ORDER',
        kind: 'module',
        programs: 1,
        screens: 1,
        reports: 1,
        suspectedReports: 0,
        batches: 0,
        files: 1,
        codeLines: 310,
      },
      {
        module: 'programs/REPORT',
        kind: 'module',
        programs: 1,
        screens: 1,
        reports: 2,
        suspectedReports: 1,
        batches: 0,
        files: 1,
        codeLines: 85,
      },
      {
        module: '共通',
        kind: 'shared',
        programs: 0,
        screens: 1,
        reports: 0,
        suspectedReports: 0,
        batches: 0,
        files: 1,
        codeLines: 120,
      },
    ],
    complexity: {
      version: 'complexity-v1',
      levels: { low: 2, medium: 1, high: 0, 'very-high': 0 },
      notAnalyzed: 0,
      reportModelVersion: 'report-complexity-v1-draft',
      reportLevels: { low: 0, medium: 1, high: 1, 'very-high': 0, unrated: 1 },
      top: [
        {
          program: 'ORDER',
          module: 'programs/ORDER',
          level: 'medium',
          score: 52,
          codeLines: 430,
          screens: 2,
          reports: 1,
        },
        {
          program: 'CUSTOMER',
          module: 'programs/CUSTOMER',
          level: 'low',
          score: 31,
          codeLines: 260,
          screens: 0,
          reports: 0,
        },
        {
          program: 'REPORT',
          module: 'programs/REPORT',
          level: 'low',
          score: 24,
          codeLines: 205,
          screens: 2,
          reports: 2,
        },
      ],
    },
    dependencies: {
      shared: [
        { file: 'cmn/COMMON.BAS', programs: 2, procedures: 2, codeLines: 120 },
      ],
      components: [
        {
          identifier: '{831FDD16-0C5C-11D2-A9FC-0000F8754DA1}',
          fileName: 'MSCOMCTL.OCX',
          description: null,
          programs: 2,
        },
      ],
      apis: [{ name: 'GetTickCount', library: 'kernel32', programs: 1 }],
    },
    database: {
      tables: [
        { table: 'ORDERS', programs: 2, operations: 'RU' },
        { table: 'AUDIT_LOG', programs: 2, operations: 'C' },
        { table: 'CUSTOMERS', programs: 1, operations: 'R' },
        { table: 'ORDER_LINES', programs: 1, operations: 'C' },
      ],
      sqlByModule: [
        { module: 'programs/ORDER', dynamicSql: 3, concatenatedSql: 5 },
        { module: '共通', dynamicSql: 0, concatenatedSql: 2 },
      ],
      dynamicSql: 3,
      concatenatedSql: 7,
    },
    risks: [
      {
        code: 'REPORT_FILE_MISSING',
        source: 'warning',
        category: '帳票',
        severity: '高',
        count: 1,
        content:
          'コードから参照されている帳票定義ファイル（.rpt）がソース内にありません。',
        programs: ['REPORT'],
        otherPrograms: 0,
        confirmation: '帳票定義ファイル(.rpt)のご提供をお願いします。',
      },
      {
        code: 'REPORT_SUSPECTED',
        source: 'warning',
        category: '帳票',
        severity: '中',
        count: 2,
        content:
          '印刷・Excel・ファイル出力を行う可能性のあるプログラムがあります。',
        programs: ['CUSTOMER', 'REPORT'],
        otherPrograms: 0,
        confirmation: '帳票一覧（台帳）をご提供ください。',
      },
      {
        code: 'EXTERNAL_COMPONENT',
        source: 'data',
        category: '外部コンポーネント',
        severity: '中',
        count: 1,
        content: 'COM / OCX など外部コンポーネントを利用しています。',
        programs: ['ORDER', 'REPORT'],
        otherPrograms: 0,
        confirmation: 'ライセンス・代替可否をご確認ください。',
      },
      {
        code: 'COMPLEXITY_REFERENCE_ONLY',
        source: 'warning',
        category: '解析の前提',
        severity: '低',
        count: 1,
        content: '複雑度は参考分類です。',
        programs: [],
        otherPrograms: 0,
        confirmation: '特にありません。',
      },
    ],
    items: [
      item({
        type: '画面',
        kindLabel: '画面（フォーム）',
        name: 'ORDERFORM',
        file: 'programs/ORDER/ORDERFORM.FRM',
      }),
      item({
        type: '画面',
        kindLabel: '画面（フォーム）',
        name: 'LOGIN',
        file: 'cmn/LOGIN.FRM',
        shared: true,
        programs: 'ORDER、REPORT',
        module: '共通',
      }),
      item({
        type: '画面',
        kindLabel: '画面（フォーム）',
        name: '',
        file: 'programs/REPORT/PREVIEW.FRM',
        programs: 'REPORT',
        module: 'programs/REPORT',
        note: '画面ファイルがソースにありません',
      }),
      item({
        type: '帳票',
        kindLabel: 'Crystal Reports',
        name: 'order.rpt',
        file: 'programs/ORDER/ORDER.BAS',
        line: 130,
        level: 'high',
        levelLabel: '高',
        score: 6,
        modelVersion: 'report-complexity-v1-draft',
        factors: '分岐数 28 (+2)；実行行数 150 (+3)',
      }),
      item({
        type: '帳票',
        kindLabel: 'Crystal Reports',
        name: 'summary.rpt',
        file: 'programs/REPORT/REPORT.BAS',
        line: 40,
        programs: 'REPORT',
        module: 'programs/REPORT',
        confidence: 'referenced',
        confidenceLabel: '参照（定義ファイル不足）',
        level: 'medium',
        levelLabel: '中',
        score: 2,
        modelVersion: 'report-complexity-v1-draft',
        note: '定義ファイル未解析のため最低でも「中」；帳票定義ファイル(.rpt)がソースにありません',
      }),
      item({
        type: '帳票',
        kindLabel: 'DataReport / ActiveReports',
        name: 'rptMonthly',
        file: 'programs/REPORT/MONTHLY.DSR',
        line: 2,
        programs: 'REPORT',
        module: 'programs/REPORT',
        level: 'unrated',
        levelLabel: '未評価',
        modelVersion: 'report-complexity-v1-draft',
        factors: '定義ファイル未解析',
        note: '帳票を呼び出す処理を特定できないため評価不可',
      }),
      item({
        type: '出力機能',
        kindLabel: 'Excel出力',
        name: 'PrintMonthly',
        file: 'programs/REPORT/REPORT.BAS',
        line: 60,
        programs: 'REPORT',
        module: 'programs/REPORT',
        confidence: 'suspected',
        confidenceLabel: '要確認',
        note: '印刷・出力の可能性があります。帳票の数には含みません。',
      }),
      item({
        type: '出力機能',
        kindLabel: '印刷',
        name: 'SearchCustomer',
        file: 'programs/CUSTOMER/CUSTOMER.BAS',
        line: 70,
        programs: 'CUSTOMER',
        module: 'programs/CUSTOMER',
        confidence: 'suspected',
        confidenceLabel: '要確認',
        note: '印刷・出力の可能性があります。帳票の数には含みません。',
      }),
      item({
        type: 'バッチ',
        kindLabel: 'バッチ（Sub Main 起動・画面なし）',
        name: 'CUSTOMER',
        file: 'programs/CUSTOMER/CUSTOMER.VBP',
        programs: 'CUSTOMER',
        module: 'programs/CUSTOMER',
      }),
    ],
    recommendations: [
      '本報告は静的解析による参考値です。画面数・帳票数はお客様の台帳と照合のうえ、ご確認ください。',
      '確認事項（特に重要度「高」）へのご回答をお願いします。',
      '確認後の数値を基に、移行範囲・順序を協議し、見積りを確定します。',
    ],
  };
}

// An inventory written before screen/report counting (AR04).
export function legacyCustomerReportFixture(): CustomerReportDocument {
  const report = customerReportFixture();
  report.scale.screenReport = null;
  report.source.versions.screenReportVersion = null;
  report.source.versions.reportComplexityVersion = null;
  report.complexity.reportLevels = null;
  report.complexity.reportModelVersion = null;
  report.items = [];
  for (const row of report.modules) {
    row.screens = 0;
    row.reports = 0;
    row.suspectedReports = 0;
    row.batches = 0;
  }
  return report;
}
