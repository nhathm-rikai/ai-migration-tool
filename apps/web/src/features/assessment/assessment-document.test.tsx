import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  customerReportFixture,
  legacyCustomerReportFixture,
} from '../../testing/customer-report-fixture';
import { AssessmentDocument } from './assessment-document';

// AR03-AC01: every number in the document is the number in the JSON.

const draw = (report = customerReportFixture()) => {
  const view = render(
    <AssessmentDocument report={report} issuedOn="2026-11-07" />,
  );
  const root = view.container.querySelector('.assess-doc-root');
  if (!(root instanceof HTMLElement)) throw new Error('document root');
  const section = (name: string) => {
    const found = root.querySelector(`[data-doc="${name}"]`);
    if (!(found instanceof HTMLElement)) throw new Error(`section ${name}`);
    return found;
  };
  const text = (selector: string, from: ParentNode = root) =>
    from.querySelector(selector)?.textContent ?? '';
  return { root, section, text };
};

describe('AssessmentDocument cover and scale', () => {
  it('shows project, dates, DEMO label and origin on the cover', () => {
    const { section } = draw();
    const cover =
      (section('cover').textContent ?? '') +
      (section('cover-detail').textContent ?? '');
    expect(cover).toContain('アセスメント報告書');
    expect(cover).toContain('デモ受注管理');
    expect(cover).toContain('2026年11月6日');
    expect(cover).toContain('2026年11月7日');
    expect(cover).toContain('DEMO');
    // No internal id, model version or hash on the cover.
    expect(cover).not.toContain('artifact-0001');
    expect(cover).not.toContain('56c0b728afaa');
    expect(cover).not.toContain('-v1');
    expect(cover).not.toContain('解析モデル');
  });

  it('draws the KPI cards from the JSON, including 画面 / 帳票 / バッチ', () => {
    const report = customerReportFixture();
    const { section, text } = draw(report);
    const scale = section('summary');
    const kpi = (name: string) => text(`[data-kpi="${name}"]`, scale);
    const sr = report.scale.screenReport;
    expect(sr).not.toBeNull();
    expect(kpi('screens')).toContain(String(sr?.screens));
    expect(kpi('screens')).toContain(`共通 ${sr?.sharedScreens}`);
    // One total over Crystal, code print and CSV/Excel export.
    expect(kpi('reports')).toContain(String(sr?.reports.counted));
    expect(kpi('reports')).toContain(
      'Crystal 3 · コード印刷 1 · CSV・Excel出力 1',
    );
    expect(kpi('reports')).toContain('設計ファイルなし（.rpt）: 1');
    expect(sr?.reports.suspected).toBe(0);
    expect(kpi('batches')).toContain(String(sr?.batches));
    expect(kpi('programs')).toContain(String(report.scale.programs));
    expect(kpi('lines')).toContain('655');
    expect(kpi('procedures')).toContain(String(report.scale.procedures));
    expect(kpi('tables')).toContain(String(report.scale.tables));
    // The customer's own count is not collected: no line for it.
    expect(scale.textContent).not.toContain('お客様提示');
  });

  it('lists the report breakdown and the levels, each total equal to the rows', () => {
    const report = customerReportFixture();
    const { section } = draw(report);
    const scale = section('scale');
    const reports = report.scale.screenReport?.reports;
    const breakdown = report.scale.reportBreakdown;
    if (!reports || !breakdown) throw new Error('fixture');
    for (const kind of ['crystal', 'print', 'export'] as const)
      expect(
        scale.querySelector(`[data-kind="${kind}"] .num`)?.textContent,
      ).toBe(String(breakdown[kind]));
    expect(breakdown.crystal + breakdown.print + breakdown.export).toBe(
      breakdown.total,
    );
    for (const [level, count] of Object.entries(reports.byLevel))
      expect(
        scale.querySelector(`[data-level="${level}"] .num`)?.textContent,
      ).toBe(String(count));
    expect(scale.querySelector('[data-total="kind"]')?.textContent).toBe(
      String(reports.rows),
    );
    expect(scale.querySelector('[data-total="level"]')?.textContent).toBe(
      String(reports.rows),
    );
  });

  it('has the module table with the shared row and a total equal to the unique totals', () => {
    const report = customerReportFixture();
    const { section } = draw(report);
    const rows = Array.from(
      section('scale').querySelectorAll('[data-module-row]'),
    );
    expect(rows).toHaveLength(report.modules.length);
    expect(rows.some((row) => row.textContent?.startsWith('共通'))).toBe(true);
    const total = section('scale').querySelector('[data-module-total]');
    const cells = Array.from(total?.querySelectorAll('td') ?? []).map(
      (cell) => cell.textContent,
    );
    const sr = report.scale.screenReport;
    expect(cells).toEqual([
      '合計',
      String(report.scale.programs),
      String(sr?.screens),
      String(sr?.reports.counted),
      String(sr?.batches),
      String(report.modules.reduce((n, m) => n + m.files, 0)),
      String(report.scale.codeLines),
    ]);
  });
});

describe('AssessmentDocument sections 2 to 6', () => {
  it('complexity: SVG bars carry the program and report counts; top programs listed', () => {
    const report = customerReportFixture();
    const { section } = draw(report);
    const complexity = section('complexity');
    // The program levels are on page 1 (summary), the report levels here.
    const summary = section('summary');
    expect(summary.querySelectorAll('svg')).toHaveLength(1);
    expect(complexity.querySelectorAll('svg')).toHaveLength(1);
    for (const [level, count] of Object.entries(report.complexity.levels))
      expect(
        summary
          .querySelector(`[data-bar="program-${level}"]`)
          ?.getAttribute('data-count'),
      ).toBe(count === null ? 'na' : String(count));
    for (const [level, count] of Object.entries(
      report.complexity.reportLevels ?? {},
    ))
      expect(
        complexity
          .querySelector(`[data-bar="report-${level}"]`)
          ?.getAttribute('data-count'),
      ).toBe(String(count));
    expect(complexity.textContent).toContain(
      'レイアウトの設計内容は含みません',
    );
    expect(complexity.textContent).not.toContain('report-complexity-v1');
    expect(complexity.querySelectorAll('[data-top-row]')).toHaveLength(
      report.complexity.top.length,
    );
  });

  it('keeps the module table as one block with one header (the PDF page layout splits it)', () => {
    const report = customerReportFixture();
    const base = report.modules[0];
    if (!base) throw new Error('fixture');
    report.modules = Array.from({ length: 40 }, (_, index) => ({
      ...base,
      module: `mod/${index}`,
    }));
    const { section } = draw(report);
    const scale = section('scale');
    const moduleTables = Array.from(scale.querySelectorAll('table')).filter(
      (table) => table.querySelector('[data-module-row]'),
    );
    expect(moduleTables).toHaveLength(1);
    expect(moduleTables[0]?.querySelector('thead th')?.textContent).toBe(
      'モジュール',
    );
    expect(scale.querySelectorAll('[data-module-row]')).toHaveLength(40);
    expect(scale.querySelectorAll('[data-module-total]')).toHaveLength(1);
  });

  // AR03 review 2: one statement about the table names in section 4 and in
  // the appendix, from the report's own state: assumed / confirmed / none /
  // not analyzed.
  describe('table name statement (AR03 review 2)', () => {
    const state = (
      patch: (r: ReturnType<typeof customerReportFixture>) => void,
    ) => {
      const report = customerReportFixture();
      patch(report);
      const { section } = draw(report);
      return {
        note: section('database').querySelector('.ad-note')?.textContent ?? '',
        appendix: section('appendix').textContent ?? '',
      };
    };
    it('assumed: says the schema is assumed in both places', () => {
      const s = state((r) => {
        r.scale.tablesView = 'normalized';
        r.scale.tablesAssumed = true;
        r.scale.tables = 3;
      });
      expect(s.note).toContain('仮定');
      expect(s.appendix).toContain('仮定');
    });
    it('confirmed with tables: says confirmed, never assumed', () => {
      const s = state((r) => {
        r.scale.tablesView = 'normalized';
        r.scale.tablesAssumed = false;
        r.scale.tables = 3;
      });
      expect(s.note).toContain('確認済み');
      expect(s.note).not.toContain('仮定');
      expect(s.appendix).toContain('確認済み');
      expect(s.appendix).not.toContain('仮定');
    });
    it('no table found: claims neither assumed nor confirmed', () => {
      const s = state((r) => {
        r.scale.tablesView = 'normalized';
        r.scale.tablesAssumed = false;
        r.scale.tables = 0;
        r.database.tables = [];
      });
      expect(s.note).toContain('検出されませんでした');
      for (const text of [s.note, s.appendix]) {
        expect(text).not.toContain('確認済み');
        expect(text).not.toContain('仮定');
      }
    });
    it('not analyzed: says there is no data', () => {
      const s = state((r) => {
        r.scale.tablesView = null;
        r.scale.tables = 0;
        r.database.tables = [];
      });
      expect(s.note).toContain('解析データがない');
      for (const text of [s.note, s.appendix]) {
        expect(text).not.toContain('確認済み');
        expect(text).not.toContain('仮定');
      }
    });
    it('raw names: says so and nothing about a schema', () => {
      const s = state((r) => {
        r.scale.tablesView = 'raw';
        r.scale.tables = 3;
      });
      expect(s.note).toContain('ソース上の名称');
      expect(s.note).not.toContain('仮定');
    });
  });

  it('says the schema is assumed only when the report says so (AR03 review 1)', () => {
    const assumed = customerReportFixture();
    assumed.scale.tablesView = 'normalized';
    assumed.scale.tablesAssumed = true;
    expect(draw(assumed).section('database').textContent).toContain('仮定');
    const confirmed = customerReportFixture();
    confirmed.scale.tablesView = 'normalized';
    confirmed.scale.tablesAssumed = false;
    const text = draw(confirmed).section('database').textContent ?? '';
    expect(text).not.toContain('仮定');
    expect(text).not.toContain('確認が必要');
  });

  it('writes 未解析 for concatenated SQL when the inventory has no such data (AR02 review 3)', () => {
    const report = customerReportFixture();
    report.database.concatenatedSql = null;
    for (const row of report.database.sqlByModule) row.concatenatedSql = null;
    const { section } = draw(report);
    const database = section('database').textContent ?? '';
    expect(database).toContain('連結 未解析');
    expect(database).not.toContain('連結 0');
  });

  it('dependencies and database show the JSON rows', () => {
    const report = customerReportFixture();
    const { section } = draw(report);
    const dependencies = section('dependencies').textContent ?? '';
    expect(dependencies).toContain('cmn/COMMON.BAS');
    expect(dependencies).toContain('MSCOMCTL.OCX');
    expect(dependencies).toContain('GetTickCount');
    const database = section('database');
    expect(database.querySelectorAll('[data-table-row]')).toHaveLength(
      report.database.tables.length,
    );
    expect(database.textContent).toContain('ORDERS');
    expect(database.textContent).toContain(
      `動的 ${report.database.dynamicSql}`,
    );
  });

  it('risks: one row per risk, high first, with counts and confirmations', () => {
    const report = customerReportFixture();
    const { section } = draw(report);
    const rows = Array.from(section('risks').querySelectorAll('[data-risk]'));
    expect(rows.map((row) => row.getAttribute('data-risk'))).toEqual(
      report.risks.map((risk) => risk.code),
    );
    const missing = rows[0];
    expect(missing?.textContent).toContain('高');
    // The risk table states what is missing; it asks for nothing.
    expect(missing?.textContent).toContain('帳票定義ファイル（.rpt）');
    expect(missing?.textContent).not.toContain('ご提供');
    expect(rows[1]?.textContent).toContain('ORDER、REPORT');
  });

  it('section 6 is a summary: reports by how they are made and by level, the top templates, a pointer to the Excel', () => {
    const report = customerReportFixture();
    const { section } = draw(report);
    const items = section('items');
    // No line per screen, batch or report any more.
    expect(items.textContent).not.toContain('programs/ORDER/ORDERFORM.FRM');
    const kinds = Array.from(items.querySelectorAll('[data-kind-row]'));
    expect(kinds.map((row) => row.getAttribute('data-kind-row'))).toEqual([
      'crystal',
      'print',
      'export',
    ]);
    // Crystal / DataReport 3 (high, medium, unrated), code print 1, export 1.
    const cells = (key: string) =>
      Array.from(
        items
          .querySelector(`[data-kind-row="${key}"]`)
          ?.querySelectorAll('td') ?? [],
      ).map((cell) => cell.textContent);
    expect(cells('crystal')).toEqual([
      'Crystal Reports / DataReport',
      '0',
      '1',
      '1',
      '0',
      '1',
      '3',
    ]);
    expect(cells('print')?.at(-1)).toBe('1');
    expect(cells('export')?.at(-1)).toBe('1');
    // The templates by complexity: order.rpt (6) first, rptMonthly (unrated) last.
    const templates = Array.from(items.querySelectorAll('[data-item]'));
    expect(templates).toHaveLength(3);
    expect(templates[0]?.textContent).toContain('order.rpt');
    expect(templates[0]?.textContent).toContain('高 · 6');
    expect(templates[0]?.textContent).toContain('あり');
    expect(templates[1]?.textContent).toContain('なし');
    expect(templates[2]?.textContent).toContain('未評価');
    expect(items.textContent).toContain('6_画面・帳票一覧');
  });

  it('lists at most 15 templates and says how many are left', () => {
    const report = customerReportFixture();
    const template = report.items.find((i) => i.reportKind === 'crystal');
    if (!template) throw new Error('fixture');
    report.items = Array.from({ length: 40 }, (_, index) => ({
      ...template,
      name: `T${index}.rpt`,
    }));
    const { section } = draw(report);
    expect(section('items').querySelectorAll('[data-item]')).toHaveLength(15);
    expect(section('items').textContent).toContain('ほか 25 件は Excel を参照');
  });

  it('next steps and appendix carry the fixed text and the counting rules', () => {
    const report = customerReportFixture();
    const { root, section } = draw(report);
    // No "next steps" section any more.
    expect(root.querySelector('[data-doc="next"]')).toBeNull();
    expect(root.textContent).not.toContain('今後の進め方');
    const appendix = section('appendix').textContent ?? '';
    for (const rule of [
      '画面：',
      'バッチ：',
      'Crystal ／ DataReport：',
      'コード印刷、CSV・Excel出力：',
      '作成方法の重複：',
      'その他のファイル出力：',
      'ログ・一時ファイル：',
      '複雑度の範囲：',
    ])
      expect(appendix).toContain(rule);
    expect(appendix).toContain('換算単位');
    expect(appendix).toContain('業務上の帳票数ではありません');
    expect(appendix).toContain('帳票の複雑度');
    expect(appendix).not.toContain('report-complexity-v1');
    expect(appendix).not.toContain('customer-assessment-report');
    expect(appendix).not.toContain('解析モデルの版');
  });
});

describe('AssessmentDocument layout hooks (AR03-AC03)', () => {
  it('starts sections on their own page where asked and keeps blocks whole', () => {
    const { root } = draw();
    expect(root.querySelectorAll('[data-page-break]').length).toBeGreaterThan(
      0,
    );
    expect(root.querySelector('.qd-head')).not.toBeNull();
    // Every section is a block the renderer may end a page after.
    expect(root.querySelectorAll('.qd-block').length).toBeGreaterThanOrEqual(8);
  });

  it('keeps a long table as one block, shows the top 15 components by file name (no id) and the rest as a count', () => {
    const report = customerReportFixture();
    report.dependencies.components = Array.from({ length: 40 }, (_, index) => ({
      kind: index % 2 === 0 ? ('component' as const) : ('reference' as const),
      identifier: `{B16553C3-06DB-101B-85B2-${String(index).padStart(12, '0')}}`,
      fileName: `LIB${index}.OCX`,
      description: index % 2 === 0 ? '' : 'Library',
      programs: 40 - index,
    }));
    const { section } = draw(report);
    const dependencies = section('dependencies');
    const table = Array.from(dependencies.querySelectorAll('table')).find((t) =>
      t.textContent?.includes('LIB0.OCX'),
    );
    expect(table?.querySelectorAll('tbody tr')).toHaveLength(15);
    expect(
      Array.from(table?.querySelectorAll('thead th') ?? []).map(
        (th) => th.textContent,
      ),
    ).toEqual(['名称', '種別', '説明', 'プログラム数']);
    // The id is not printed; the kind is.
    expect(dependencies.textContent).not.toContain('B16553C3');
    expect(dependencies.textContent).toContain('コントロール（OCX）');
    expect(dependencies.textContent).toContain('参照設定（ライブラリ）');
    expect(dependencies.textContent).toContain('ほか 25 件は Excel を参照');
  });
});

describe('AR03 with an inventory without screen/report data', () => {
  it('says 未解析 for 画面 / 帳票 / バッチ, never 0', () => {
    const { section } = draw(legacyCustomerReportFixture());
    for (const key of ['screens', 'reports', 'batches']) {
      const card = section('summary').querySelector(`[data-kpi="${key}"]`);
      expect(card?.textContent).toContain('未解析（再解析が必要）');
      expect(card?.textContent).not.toMatch(/\b0\b/);
    }
    expect(section('items').textContent).toContain('未解析（再解析が必要）');
    expect(section('scale').querySelector('[data-kind]')).toBeNull();
  });
});

describe('AssessmentDocument in Vietnamese (report.language = vi)', () => {
  const vi = () => {
    const report = customerReportFixture();
    report.language = 'vi';
    return report;
  };

  it('writes the cover, sections and KPI in Vietnamese with the same numbers', () => {
    const report = vi();
    const { root, section, text } = draw(report);
    const cover =
      (section('cover').textContent ?? '') +
      (section('cover-detail').textContent ?? '');
    expect(cover).toContain('Báo cáo Assessment');
    expect(cover).toContain('6/11/2026');
    expect(cover).toContain('7/11/2026');
    expect(section('scale').textContent).toContain('1. Quy mô');
    const kpi = (name: string) =>
      text(`[data-kpi="${name}"]`, section('summary'));
    expect(kpi('reports')).toContain('Report theo quy ước Assessment');
    expect(kpi('reports')).toContain(
      String(report.scale.screenReport?.reports.counted),
    );
    expect(kpi('reports')).toContain(
      'Crystal 3 · In bằng code 1 · Xuất CSV/Excel 1',
    );
    // No Japanese is left in the fixed text of the document.
    const jp = /[\u3040-\u30ff\u4e00-\u9fff]/;
    // The fixed text (headings, table heads, notes, KPI cards, chart labels,
    // appendix) has no Japanese; only the data of the fixture may.
    const fixed = Array.from(
      root.querySelectorAll(
        'h1, h2, h3, th, .qd-note, .ad-demo, .ad-toc-line, [data-kpi], svg text, [data-doc="appendix"] li',
      ),
    )
      .map((element) => element.textContent ?? '')
      .join(' | ');
    expect(fixed).not.toMatch(jp);
  });

  it('has the counting basis in the appendix in Vietnamese and no internal id', () => {
    const { section } = draw(vi());
    const appendix = section('appendix').textContent ?? '';
    expect(appendix).toContain('đơn vị quy đổi');
    expect(appendix).toContain('không bảo đảm loại hết');
    expect(appendix).not.toMatch(/-v1|-draft|customer-assessment-report/);
  });

  it('has the summary of section 6 in Vietnamese', () => {
    const { section } = draw(vi());
    const items = section('items');
    expect(section('items').textContent).toContain('6. Tổng hợp report');
    expect(items.textContent).toContain('Cách tạo');
    expect(items.textContent).toContain('In bằng code');
    expect(items.textContent).toContain('Xuất CSV/Excel');
    expect(items.textContent).toContain('6_Màn hình-Report');
  });
});
