import { describe, expect, it } from 'vitest';
import { demoInventory } from '../../adapters/fake/demo-inventory.js';
import { unzip } from '../../testing/zip-reader.js';
import { buildCustomerReport } from './customer-report.js';
import { customerReportSheets, wrapText } from './customer-report-workbook.js';
import { columnWidth, writeXlsx } from './xlsx-writer.js';

// Layout of the customer workbook (review of 10/11): every table is a block of
// its own and only as wide as it is, section titles have no fill, nothing asks
// the customer for anything, no GUID, no confidence column, the counting basis
// is a sheet of its own.

const origin = {
  mode: 'local' as const,
  projectId: 'p1',
  projectName: 'Demo',
  runId: 'r1',
  artifactId: 'a1',
  artifactVersion: 3,
  createdAt: '2026-11-10T01:53:26.814Z',
};

for (const lang of ['ja', 'vi'] as const) {
  describe(`customer workbook layout (${lang})`, () => {
    const report = buildCustomerReport(demoInventory, origin, lang);
    const sheets = customerReportSheets(report);
    const xml = (index: number) => {
      const parts = unzip(writeXlsx(sheets));
      return parts.get(`xl/worksheets/sheet${index + 1}.xml`) ?? '';
    };
    const rowXml = (sheetXml: string, r: number) =>
      new RegExp(`<row r="${r}"[^>]*?(?:/>|>.*?</row>)`).exec(sheetXml)?.[0] ??
      '';
    const cellCount = (row: string) => (row.match(/<c r=/g) ?? []).length;

    it('has no header row, pane or filter on the sheets of several tables', () => {
      for (const index of [0, 1, 2, 3]) {
        const sheet = sheets[index];
        expect(sheet?.noHeader).toBe(true);
        const text = xml(index);
        expect(text).not.toContain('<pane');
        expect(text).not.toContain('<autoFilter');
      }
    });

    it('writes each table only as wide as it is (no fill or border past its columns)', () => {
      for (const index of [0, 1, 2, 3]) {
        const sheet = sheets[index];
        if (!sheet?.rowSpans) throw new Error('spans');
        expect(sheet.rowSpans).toHaveLength(sheet.rows.length);
        const text = xml(index);
        // The first data row follows the title, the notes and one blank row.
        const first = 2 + (sheet.notes?.length ?? 0) + 1;
        sheet.rows.forEach((row, i) => {
          const span = sheet.rowSpans?.[i] ?? 0;
          if (span > 0) expect(cellCount(rowXml(text, first + i))).toBe(span);
          else expect(cellCount(rowXml(text, first + i))).toBe(0);
          // What is past the span is empty.
          expect(row.slice(Math.max(span, 0)).every((c) => c === null)).toBe(
            true,
          );
        });
      }
    });

    it('titles every block in plain bold (no fill) and gives it its own header row', () => {
      for (const index of [0, 1, 2, 3]) {
        const sheet = sheets[index];
        expect(sheet?.headingRows ?? []).toEqual([]);
        for (const row of sheet?.sectionRows ?? [])
          expect(sheet?.rowSpans?.[row]).toBe(1);
        // Every table title is followed by a thin gap, then a header row.
        for (const row of sheet?.sectionRows ?? []) {
          expect(sheet?.rowSpans?.[row + 1]).toBe(-1);
          expect(sheet?.subHeaderRows).toContain(row + 2);
        }
      }
    });

    it('shows the analysis time readably, not as an ISO string', () => {
      const text = JSON.stringify(sheets[0]?.rows);
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
      expect(text).toContain(
        lang === 'vi' ? '10/11/2026 01:53 (UTC)' : '2026年11月10日 01:53',
      );
    });

    it('asks for nothing: no next steps, no customer count, no please-provide column', () => {
      const text = JSON.stringify(
        sheets.flatMap((s) => [s.notes ?? [], s.columns, s.rows]),
      );
      for (const word of [
        '今後の進め方',
        'Bước tiếp theo',
        'お客様提示',
        'お客様への確認事項',
        'Đề nghị khách hàng',
        'số của khách hàng',
        'chưa nhập',
      ])
        expect(text).not.toContain(word);
      expect(report.recommendations).toEqual([]);
    });

    it('sheet 3 names a component by its file, with no GUID', () => {
      const text = JSON.stringify(sheets[2]?.rows);
      expect(text).not.toMatch(/\{[0-9A-Fa-f]{8}-/);
      expect(text).not.toContain('[Component]');
      expect(text).not.toContain('【コンポーネント】');
    });

    it('sheet 6: no confidence column, the number of uses and the design file in columns of their own', () => {
      const sheet = sheets[5];
      const headers = sheet?.columns.map((c) => c.header) ?? [];
      expect(headers).toHaveLength(10);
      // The level only: no score and no factor column.
      for (const word of ['点数', 'Điểm', '評価要因', 'Yếu tố đánh giá'])
        expect(headers).not.toContain(word);
      for (const word of ['信頼度', 'Độ tin cậy', 'Nhóm', '区分'])
        expect(headers).not.toContain(word);
      const usage = headers.findIndex(
        (h) => h === '使用箇所数' || h === 'Số nơi dùng',
      );
      const design = headers.findIndex(
        (h) => h === '設計ファイル' || h === 'File thiết kế',
      );
      expect(usage).toBeGreaterThan(0);
      expect(design).toBeGreaterThan(0);
      const rows = (sheet?.rows ?? []).slice(0, sheet?.filterRows ?? 0);
      const order = rows.find((r) => r[1] === 'order.rpt');
      expect(order?.[usage]).toBe(2);
      expect(order?.[design]).toBe(lang === 'vi' ? 'Có' : 'あり');
      const summary = rows.find((r) => r[1] === 'summary.rpt');
      expect(summary?.[design]).toBe(lang === 'vi' ? 'Thiếu file' : 'なし');
      // Only Crystal / DataReport have a design file.
      const screen = rows.find((r) => String(r[0]).match(/画面|Màn hình/));
      expect(screen?.[design]).toBeNull();
      // Long text wraps and is top-aligned.
      for (const name of lang === 'vi'
        ? ['File', 'Ghi chú']
        : ['ファイル', '備考'])
        expect(sheet?.columns.find((c) => c.header === name)?.wrap).toBe(true);
    });

    it('sheet 6: the file output that is not a report is a table of its own under the list', () => {
      const sheet = sheets[5];
      if (!sheet) throw new Error('sheet 6');
      const after = sheet.rows.slice(sheet.filterRows ?? 0);
      expect(after.length).toBeGreaterThan(2);
      expect(sheet.sectionRows).toHaveLength(1);
      // The filter covers the list only.
      const text = xml(5);
      expect(text).toMatch(
        new RegExp(
          `<autoFilter ref="A\\d+:J${3 + (sheet.notes?.length ?? 0) + (sheet.filterRows ?? 0)}"`,
        ),
      );
      expect(JSON.stringify(after)).toContain('WriteDump');
    });

    it('wraps notes to the width of the table', () => {
      for (const sheet of sheets) {
        const width = sheet.columns.reduce((n, c) => n + (c.width ?? 14), 0);
        for (const note of sheet.notes ?? [])
          expect(
            Array.from(note).reduce((n, ch) => {
              const code = ch.codePointAt(0) ?? 0;
              return (
                n +
                ((code >= 0x3000 && code <= 0x9fff) ||
                (code >= 0xff00 && code <= 0xffef)
                  ? 2
                  : 1)
              );
            }, 0),
          ).toBeLessThanOrEqual(Math.floor(width * 0.85) + 1);
      }
    });
  });
}

describe('wrapText', () => {
  it('breaks after a space and joins back to the text', () => {
    const text = 'một hai ba bốn năm sáu bảy tám chín mười';
    const lines = wrapText(text, 12);
    expect(lines.join('')).toBe(text);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(13);
  });
  it('counts a Japanese character as two units', () => {
    expect(wrapText('あいうえおかきくけこ', 10)).toEqual([
      'あいうえお',
      'かきくけこ',
    ]);
  });
});

describe('an inventory counted by an older report counting', () => {
  const old = JSON.parse(JSON.stringify(demoInventory)) as typeof demoInventory;
  old.screenReportVersion = 'screen-report-v2';

  it('says so in the risks of both languages (it needs an analysis again)', () => {
    for (const lang of ['ja', 'vi'] as const) {
      const risks = buildCustomerReport(old, origin, lang).risks;
      expect(risks.some((r) => r.code === 'SCREEN_REPORT_OUTDATED')).toBe(true);
    }
    expect(
      buildCustomerReport(demoInventory, origin, 'vi').risks.some(
        (r) => r.code === 'SCREEN_REPORT_OUTDATED',
      ),
    ).toBe(false);
  });
});

describe('AR06-AC01 an inventory scored by an older complexity model', () => {
  // Only the complexity model is old; the counting version is current.
  const old = JSON.parse(JSON.stringify(demoInventory)) as typeof demoInventory;
  old.reportComplexityVersion = 'report-complexity-v1-draft';

  it('says it needs an analysis again in the risks of both languages (Excel and PDF)', () => {
    expect(old.screenReportVersion).toBe(demoInventory.screenReportVersion);
    for (const lang of ['ja', 'vi'] as const) {
      const risks = buildCustomerReport(old, origin, lang).risks;
      expect(risks.some((r) => r.code === 'SCREEN_REPORT_OUTDATED')).toBe(true);
    }
  });

  it('keeps showing the stored level of each report, never a recomputed one', () => {
    const before = buildCustomerReport(demoInventory, origin, 'vi').items;
    const after = buildCustomerReport(old, origin, 'vi').items;
    expect(after.map((item) => item.level)).toEqual(
      before.map((item) => item.level),
    );
  });
});

describe('components of sheet 3: one row per file name, whatever its case', () => {
  const inventory = JSON.parse(
    JSON.stringify(demoInventory),
  ) as typeof demoInventory;
  const [first, second] = inventory.programs;
  if (!first || !second) throw new Error('fixture');
  const component = (fileName: string) => ({
    kind: 'component' as const,
    identifier: '{F9043C88-F6F2-101A-A3C9-08002B2F49FB}',
    fileName,
    description: null,
  });
  first.externalReferences = [
    component('COMDLG32.OCX'),
    component('comdlg32.ocx'),
  ];
  second.externalReferences = [component('ComDlg32.ocx')];
  for (const lang of ['ja', 'vi'] as const) {
    it(`counts distinct programs once (${lang})`, () => {
      const report = buildCustomerReport(inventory, origin, lang);
      const rows = report.dependencies.components.filter(
        (c) => c.fileName?.toLowerCase() === 'comdlg32.ocx',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.programs).toBe(2);
    });
  }
});

describe('column widths follow the content', () => {
  const widthOf = (text: string) =>
    Array.from(text).reduce((n, ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return (
        n +
        ((code >= 0x3000 && code <= 0x9fff) ||
        (code >= 0xff00 && code <= 0xffef)
          ? 2
          : 1)
      );
    }, 0);
  for (const lang of ['ja', 'vi'] as const) {
    it(`no text is wider than its column unless the column wraps (${lang})`, () => {
      const report = buildCustomerReport(demoInventory, origin, lang);
      for (const sheet of customerReportSheets(report)) {
        sheet.rows.forEach((row, index) => {
          const span = sheet.rowSpans?.[index] ?? sheet.columns.length;
          // A one-cell row (a title, 該当なし) runs on over its empty neighbours.
          if (span <= 1) return;
          row.slice(0, span).forEach((cell, c) => {
            const column = sheet.columns[c];
            if (typeof cell !== 'string' || column === undefined) return;
            if (column.wrap) return;
            expect(
              widthOf(cell),
              `${sheet.name} row ${index} column ${c}: ${cell}`,
            ).toBeLessThanOrEqual(columnWidth(column));
          });
        });
      }
    });
  }
  it('makes the label column of sheet 1 wide enough for the longest label', () => {
    for (const lang of ['ja', 'vi'] as const) {
      const sheet = customerReportSheets(
        buildCustomerReport(demoInventory, origin, lang),
      )[0];
      expect(columnWidth(sheet?.columns[0] ?? { header: '' })).toBeGreaterThan(
        lang === 'ja' ? 34 : 38,
      );
    }
  });
});
