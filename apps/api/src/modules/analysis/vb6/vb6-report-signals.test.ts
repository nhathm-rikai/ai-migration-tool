import { describe, expect, it } from 'vitest';
import {
  detectVb6ReportDesigner,
  findVb6ReportSignals,
} from './vb6-report-signals.js';

const scan = (...lines: string[]) =>
  findVb6ReportSignals(lines, { module: 'standard' });

describe('AR04-AC02 report signals in VB6 code', () => {
  it.each([
    [
      'crystal',
      ['    Rpt.ReportFileName = "C:\\rpt\\Invoice.rpt"'],
      'Invoice.rpt',
    ],
    ['crystal', ['    x = OpenReport("sales.RPT")'], 'sales.RPT'],
    [
      'crystal',
      ['    f = App.Path & "\\reports\\daily.rpt"'],
      'reports/daily.rpt',
    ],
    [
      'excel',
      ['    Set xl = CreateObject("Excel.Application")'],
      'Excel.Application',
    ],
    [
      'excel',
      ['    Set xl = GetObject(, "Excel.Application")'],
      'Excel.Application',
    ],
    ['excel', ['    Dim xl As New Excel.Application'], 'Excel.Application'],
    ['print', ['    Printer.Print "hello"'], 'Printer'],
    ['print', ['    Printer.EndDoc'], 'Printer'],
    ['print', ['    Me.PrintForm'], 'PrintForm'],
    ['file-output', ['    Open "out.csv" For Output As #1'], 'Open For Output'],
    ['file-output', ['    Open f For Append As #2'], 'Open For Append'],
  ])('positive %s: %j', (kind, lines, name) => {
    expect(scan(...lines)).toEqual([
      expect.objectContaining({ kind, name, line: 1 }),
    ]);
  });

  it.each([
    ['    \' old: Rpt.ReportFileName = "a.rpt"'],
    ['    s = "report.rpt.bak"'],
    ['    s = "rpt"'],
    ['    Dim myPrinter As Object: myPrinter.Print "x"'],
    ['    PrinterName = "Printer.Print"'],
    ['    Dim xl As Object \' CreateObject("Excel.Application")'],
    ['    s = "CreateObject(""Excel.Application"")"'],
    ['    Open "in.txt" For Input As #1'],
    ['    Open "in.dat" For Binary As #1'],
    ['Public Sub PrintForm()'],
    ['    Rem Printer.EndDoc'],
  ])('negative: %j', (line) => {
    expect(scan(line)).toEqual([]);
  });

  it('reports the physical line of the first piece of a continued statement', () => {
    expect(
      scan('    x = 1', '    Open "a.txt" For _', '        Output As #1'),
    ).toEqual([{ kind: 'file-output', name: 'Open For Output', line: 2 }]);
  });

  it('skips the form designer block', () => {
    const lines = [
      'VERSION 5.00',
      'Begin VB.Form frmA',
      '   Caption         =   "Printer.Print x.rpt"',
      'End',
      'Attribute VB_Name = "frmA"',
      'Private Sub Command1_Click()',
      '    Printer.EndDoc',
      'End Sub',
    ];
    expect(findVb6ReportSignals(lines, { module: 'form' })).toEqual([
      { kind: 'print', name: 'Printer', line: 7 },
    ]);
  });
});

describe('AR04 report designer header', () => {
  it('recognises a DataReport designer and its line', () => {
    expect(
      detectVb6ReportDesigner([
        'VERSION 6.00',
        'Begin {C0A63B80-4B21-11D3-BD95-D426EF2C7949} DataReport rptOrder ',
        '   Caption = "x"',
      ]),
    ).toEqual({ line: 2, name: 'rptOrder' });
  });
  it('recognises an ActiveReports designer', () => {
    expect(
      detectVb6ReportDesigner([
        'Begin {AA3A7E4D-0000-0000-0000-000000000000} ActiveReport arInvoice',
      ]),
    ).toEqual({ line: 1, name: 'arInvoice' });
  });
  it('does not treat a DataEnvironment designer as a report', () => {
    expect(
      detectVb6ReportDesigner([
        'VERSION 6.00',
        'Begin {C0A63B80-4B21-11D3-BD95-D426EF2C7949} DataEnvironment DE1',
      ]),
    ).toBeNull();
    expect(detectVb6ReportDesigner(['garbage'])).toBeNull();
  });
});

// Report template count (10/11): csv output, EXCEL.EXE through Shell, and the
// log / temp files that are not report outputs.
describe('output signals for the output-function list', () => {
  it('marks Open For Output to a .csv path as csv', () => {
    expect(scan('    Open "C:\\out\\sales.CSV" For Output As #1')).toEqual([
      {
        kind: 'file-output',
        name: 'Open For Output',
        subkind: 'csv',
        line: 1,
      },
    ]);
    expect(scan('    Open App.Path & "\\x.csv" For Append As #2')).toEqual([
      { kind: 'file-output', name: 'Open For Append', subkind: 'csv', line: 1 },
    ]);
  });
  it('excludes a log or temp file, by the words in the path expression', () => {
    for (const text of [
      '    Open App.Path & "\\app.log" For Append As #1',
      '    Open LogFile For Append As #1',
      '    Open strErrLog For Output As #1',
      '    Open "C:\\Temp\\work.dat" For Output As #1',
      '    Open tmpPath For Output As #1',
      '    Open "debug.txt" For Output As #1',
      '    Open "C:/syslog.txt" For Append As #1',
      '    Open "C:/work/batchtmp.dat" For Output As #1',
    ]) {
      const [signal] = scan(text);
      expect(signal?.kind).toBe('file-output');
      expect(signal?.excludeReason).toBeTruthy();
    }
  });
  it('does not exclude words that only contain log or temp', () => {
    for (const text of [
      '    Open "C:\\out\\catalog.txt" For Output As #1',
      '    Open "template.dat" For Output As #1',
      '    Open "C:/out/dialog.txt" For Output As #1',
    ]) {
      const [signal] = scan(text);
      expect(signal?.excludeReason).toBeUndefined();
    }
  });
  it('an excluded csv stays excluded (log wins)', () => {
    const [signal] = scan('    Open "run.log.csv" For Output As #1');
    expect(signal?.excludeReason).toBeTruthy();
  });
  it('detects Shell of EXCEL.EXE as an excel output', () => {
    expect(
      scan('    Shell "C:\\Program Files\\Office\\EXCEL.EXE " & f, 1'),
    ).toEqual([{ kind: 'excel', name: 'EXCEL.EXE', line: 1 }]);
    expect(scan('    Shell "notepad.exe " & f')).toEqual([]);
  });
});

describe('exclusion reason is a category, not the matched name', () => {
  it.each([
    ['    Open LogFile For Append As #1', 'log'],
    ['    Open "C:/syslog.txt" For Append As #1', 'log'],
    ['    Open tmpPath For Output As #1', 'temp'],
    ['    Open "debug.txt" For Output As #1', 'debug'],
    ['    Open strErr For Output As #1', 'error'],
  ])('%s', (text, reason) => {
    expect(scan(text)[0]?.excludeReason).toBe(reason);
  });
});
