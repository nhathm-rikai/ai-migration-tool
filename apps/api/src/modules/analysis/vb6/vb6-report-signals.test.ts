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
    ['crystal', ['    f = App.Path & "\\reports\\daily.rpt"'], 'daily.rpt'],
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
    expect(scan(...lines)).toEqual([{ kind, name, line: 1 }]);
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
