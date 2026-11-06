import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  customerReportFixture,
  legacyCustomerReportFixture,
} from '../../testing/customer-report-fixture';
import { AssessmentDocument, MAX_LIST_ROWS } from './assessment-document';

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
    expect(cover).toContain('artifact-0001 v1');
    expect(cover).toContain('56c0b728afaa');
  });

  it('draws the KPI cards from the JSON, including 画面 / 帳票 / バッチ', () => {
    const report = customerReportFixture();
    const { section, text } = draw(report);
    const scale = section('scale');
    const kpi = (name: string) => text(`[data-kpi="${name}"]`, scale);
    const sr = report.scale.screenReport;
    expect(sr).not.toBeNull();
    expect(kpi('screens')).toContain(String(sr?.screens));
    expect(kpi('screens')).toContain(`共通 ${sr?.sharedScreens}`);
    expect(kpi('reports')).toContain(String(sr?.reports.counted));
    expect(kpi('reports')).toContain(`疑い ${sr?.reports.suspected} 件`);
    expect(kpi('batches')).toContain(String(sr?.batches));
    expect(kpi('programs')).toContain(String(report.scale.programs));
    expect(kpi('lines')).toContain('655');
    expect(kpi('procedures')).toContain(String(report.scale.procedures));
    expect(kpi('tables')).toContain(String(report.scale.tables));
    expect(scale.textContent).toContain('お客様提示数：未入力');
  });

  it('lists reports by kind and by level, each total equal to the rows', () => {
    const report = customerReportFixture();
    const { section } = draw(report);
    const scale = section('scale');
    const reports = report.scale.screenReport?.reports;
    if (!reports) throw new Error('fixture');
    for (const [kind, count] of Object.entries(reports.byKind))
      expect(
        scale.querySelector(`[data-kind="${kind}"] .num`)?.textContent,
      ).toBe(String(count));
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
      String(sr?.reports.suspected),
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
    expect(complexity.querySelectorAll('svg')).toHaveLength(2);
    for (const [level, count] of Object.entries(report.complexity.levels))
      expect(
        complexity
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
    expect(complexity.textContent).toContain('参考値');
    expect(complexity.textContent).toContain('report-complexity-v1-draft');
    expect(complexity.querySelectorAll('[data-top-row]')).toHaveLength(
      report.complexity.top.length,
    );
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
    expect(missing?.textContent).toContain('帳票定義ファイル(.rpt)のご提供');
    expect(rows[1]?.textContent).toContain('CUSTOMER、REPORT');
  });

  it('items: reports first with level, score and 未評価; says 全件は Excel 参照', () => {
    const report = customerReportFixture();
    const { section } = draw(report);
    const items = section('items');
    const rows = Array.from(items.querySelectorAll('[data-item]'));
    expect(rows).toHaveLength(report.items.length);
    expect(
      rows.map((row) => row.getAttribute('data-item')?.split(':')[0]),
    ).toEqual([
      '帳票',
      '帳票',
      '帳票',
      '帳票',
      '帳票',
      'バッチ',
      '画面',
      '画面',
      '画面',
    ]);
    const high = items.querySelector('[data-item="帳票:order.rpt"]');
    expect(high?.textContent).toContain('高 · 6');
    const unrated = items.querySelector('[data-item="帳票:Printer"]');
    expect(unrated?.textContent).toContain('未評価');
    expect(unrated?.textContent).not.toContain('低');
    expect(items.textContent).toContain('全件は Excel 参照');
    expect(items.textContent).toContain(`全${report.items.length}件`);
  });

  it('caps a long list and keeps the total in the sentence', () => {
    const report = customerReportFixture();
    const template = report.items.find((i) => i.type === '画面');
    if (!template) throw new Error('fixture');
    report.items = Array.from({ length: MAX_LIST_ROWS + 25 }, (_, index) => ({
      ...template,
      name: `F${index}`,
      file: `a/F${index}.FRM`,
    }));
    const { section } = draw(report);
    expect(section('items').querySelectorAll('[data-item]')).toHaveLength(
      MAX_LIST_ROWS,
    );
    expect(section('items').textContent).toContain(`全${MAX_LIST_ROWS + 25}件`);
  });

  it('next steps and appendix carry the fixed text and the counting rules', () => {
    const report = customerReportFixture();
    const { section } = draw(report);
    for (const line of report.recommendations)
      expect(section('next').textContent).toContain(line);
    const appendix = section('appendix').textContent ?? '';
    for (const rule of [
      '画面：',
      'バッチ：',
      '帳票（検出）：',
      '帳票（疑い）：',
    ])
      expect(appendix).toContain(rule);
    expect(appendix).toContain('帳票の複雑度（参考値）');
    expect(appendix).toContain('report-complexity-v1-draft');
  });
});

describe('AssessmentDocument layout hooks (AR03-AC03)', () => {
  it('starts sections on their own page where asked and keeps blocks whole', () => {
    const { root } = draw();
    expect(root.querySelectorAll('[data-page-break]').length).toBeGreaterThan(
      1,
    );
    expect(root.querySelector('.qd-head')).not.toBeNull();
    // Every section is a block the renderer may end a page after.
    expect(root.querySelectorAll('.qd-block').length).toBeGreaterThanOrEqual(8);
  });

  it('splits a long table into blocks that each repeat the header row', () => {
    const report = customerReportFixture();
    const template = report.items.find((i) => i.type === '画面');
    if (!template) throw new Error('fixture');
    report.items = Array.from({ length: 30 }, (_, index) => ({
      ...template,
      name: `F${index}`,
      file: `a/F${index}.FRM`,
    }));
    const { section } = draw(report);
    const tables = Array.from(section('items').querySelectorAll('table'));
    expect(tables.length).toBeGreaterThan(1);
    for (const table of tables)
      expect(table.querySelector('thead th')?.textContent).toBe('区分');
  });
});

describe('AR03 with an inventory without screen/report data', () => {
  it('says 未解析 for 画面 / 帳票 / バッチ, never 0', () => {
    const { section } = draw(legacyCustomerReportFixture());
    for (const key of ['screens', 'reports', 'batches']) {
      const card = section('scale').querySelector(`[data-kpi="${key}"]`);
      expect(card?.textContent).toContain('未解析（再解析が必要）');
      expect(card?.textContent).not.toMatch(/\b0\b/);
    }
    expect(section('items').textContent).toContain('未解析（再解析が必要）');
    expect(section('scale').querySelector('[data-kind]')).toBeNull();
  });
});
