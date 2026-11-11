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

  // The evidence of an Excel export is the line that writes (here line 2), not
  // the line that creates or opens Excel.
  it.each([
    ['    Set xl = CreateObject("Excel.Application")'],
    ['    Set xl = GetObject(, "Excel.Application")'],
    ['    Dim xl As New Excel.Application'],
  ])('positive excel at the write line: %s', (create) => {
    expect(scan(create, '    xl.ActiveSheet.Cells(1, 1).Value = "x"')).toEqual([
      { kind: 'excel', name: 'Excel', line: 2 },
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
      scan(
        '    Shell "C:\\Program Files\\Office\\EXCEL.EXE " & f, 1',
        '    Dim xl As Excel.Application',
        '    xl.ActiveSheet.Cells(1, 1).Value = "x"',
      ),
    ).toEqual([{ kind: 'excel', name: 'Excel', line: 3 }]);
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

// CSV written with Write # or comma separated Print #, and the other ways
// code produces an Excel file (10/11: found by reading a real corpus).
describe('CSV and Excel output signals', () => {
  it('an Open For Output followed by Write # is a CSV file', () => {
    const [signal] = scan(
      '    Open sOut For Output As #1',
      '    Write #1, a, b, c',
      '    Close #1',
    );
    expect(signal).toMatchObject({
      kind: 'file-output',
      subkind: 'csv',
      line: 1,
    });
  });
  it('Print # with a "," between the values is CSV too', () => {
    const [signal] = scan(
      '    Open sOut For Output As #1',
      '    Print #1, a & "," & b',
      '    Close #1',
    );
    expect(signal?.subkind).toBe('csv');
  });
  it('plain Print # text, or a write after Close, is not CSV', () => {
    expect(
      scan(
        '    Open sOut For Output As #1',
        '    Print #1, "header line"',
        '    Close #1',
      )[0]?.subkind,
    ).toBeUndefined();
    expect(
      scan(
        '    Open sOut For Output As #1',
        '    Close #1',
        '    Write #2, a, b',
      )[0]?.subkind,
    ).toBeUndefined();
    // A new procedure ends the file of the previous one.
    expect(
      scan(
        '    Open sOut For Output As #1',
        'End Sub',
        'Sub Other()',
        '    Write #1, a',
      )[0]?.subkind,
    ).toBeUndefined();
  });
  it('a log file written with commas stays excluded, not CSV', () => {
    const [signal] = scan(
      '    Open sLogFile For Append As #1',
      '    Write #1, Now, msg',
    );
    expect(signal?.excludeReason).toBe('log');
    expect(signal?.subkind).toBeUndefined();
  });
  it('detects an Excel workbook object, file and ADO source', () => {
    expect(scan('    Set wb = xl.Workbooks.Add')[0]).toMatchObject({
      kind: 'excel',
      name: 'Excel',
    });
    expect(
      scan(
        '    sFile = "report.xls"',
        '    Dim xl As Excel.Application',
        '    xl.ActiveSheet.Cells(1, 1).Value = "x"',
      )[0],
    ).toMatchObject({
      kind: 'excel',
      name: 'Excel',
    });
    expect(
      scan(
        '    cs = "Extended Properties=Excel 8.0;HDR=Yes"',
        '    Dim xl As Excel.Application',
        '    xl.ActiveSheet.Cells(1, 1).Value = "x"',
      )[0],
    ).toMatchObject({ kind: 'excel', name: 'Excel' });
    expect(
      scan(
        '    Shell "excel.exe " & f',
        '    Dim xl As Excel.Application',
        '    xl.ActiveSheet.Cells(1, 1).Value = "x"',
      )[0],
    ).toMatchObject({
      kind: 'excel',
    });
  });
  it('ignores Excel and CSV words in comments and unrelated strings', () => {
    expect(scan('    \' Open f For Output: Workbooks.Add "a.xls"')).toEqual([]);
    expect(scan('    msg = "export to excel is not available"')).toEqual([]);
  });
});

// Review 10/11 (independent review of ac79d57..10f56a7): reading Excel is not
// output, and a CSV write belongs to the file handle it names.
describe('Excel is output only when the code writes to it', () => {
  const kinds = (...lines: string[]) => scan(...lines).map((s) => s.kind);

  it('does not count reading a workbook, an Excel ADO source or a .xls name', () => {
    expect(
      kinds(
        'Sub ImportPrices()',
        '    Set xl = CreateObject("Excel.Application")',
        '    Set wb = xl.Workbooks.Open("in/prices.xls")',
        '    v = wb.Sheets(1).Cells(1, 1).Value',
        '    If wb.Sheets(1).Cells(2, 1).Value = "x" Then n = n + 1',
        '    wb.Close False',
        '    xl.Quit',
        'End Sub',
      ),
    ).toEqual([]);
    expect(
      kinds(
        'Sub Load()',
        '    cn.Open "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=in.xls;Extended Properties=""Excel 8.0"""',
        '    Set rs = cn.Execute("SELECT * FROM [Sheet1$]")',
        'End Sub',
      ),
    ).toEqual([]);
    expect(kinds('    Shell "EXCEL.EXE in.xls", 1')).toEqual([]);
  });

  it('counts Excel when the code adds a workbook, saves it or sets cells', () => {
    expect(
      kinds(
        '    Set xl = CreateObject("Excel.Application")',
        '    Set wb = xl.Workbooks.Add',
      ),
    ).toContain('excel');
    expect(
      kinds(
        '    Set xl = CreateObject("Excel.Application")',
        '    Set wb = xl.Workbooks.Open("t.xls")',
        '    wb.SaveAs "out.xls"',
      ),
    ).toContain('excel');
    expect(
      kinds(
        '    Set xl = CreateObject("Excel.Application")',
        '    Set wb = xl.Workbooks.Open("t.xls")',
        '    wb.Sheets(1).Cells(1, 1).Value = "Title"',
      ),
    ).toContain('excel');
    expect(
      kinds(
        '    Set xl = CreateObject("Excel.Application")',
        '    Set ws = xl.ActiveSheet',
        '    With ws',
        '        .Range("A1") = "Title"',
        '    End With',
      ),
    ).toContain('excel');
    expect(
      kinds(
        '    cn.Open "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=out.xls;Extended Properties=""Excel 8.0"""',
        '    cn.Execute "INSERT INTO [Sheet1$] VALUES (1, 2)"',
      ),
    ).toContain('excel');
  });
});

describe('a CSV write belongs to its own file handle', () => {
  const csv = (...lines: string[]) =>
    scan(...lines).map(
      (s) => `${s.name}:${s.subkind ?? '-'}:${s.excludeReason ?? '-'}`,
    );

  it('puts the write on the file it names, not the last one opened', () => {
    expect(
      csv(
        'Sub Export()',
        '    Open "C:/data/config.dat" For Output As #1',
        '    Open "C:/data/sales.dat" For Output As #2',
        '    Write #1, a, b',
        '    Close #1',
        '    Close #2',
        'End Sub',
      ),
    ).toEqual(['Open For Output:csv:-', 'Open For Output:-:-']);
  });

  it('keeps a log and a CSV apart, in either order', () => {
    expect(
      csv(
        'Sub A()',
        '    Open "out.dat" For Output As #1',
        '    Open "run.log" For Append As #2',
        '    Write #1, a, b',
        '    Print #2, "done"',
        'End Sub',
      ),
    ).toEqual(['Open For Output:csv:-', 'Open For Append:-:log']);
    expect(
      csv(
        'Sub B()',
        '    Open "run.log" For Append As #2',
        '    Open "out.dat" For Output As #1',
        '    Write #1, a, b',
        'End Sub',
      ),
    ).toEqual(['Open For Append:-:log', 'Open For Output:csv:-']);
  });

  it('follows a handle held in a variable (FreeFile)', () => {
    expect(
      csv(
        'Sub C()',
        '    fh1 = FreeFile',
        '    Open "a.dat" For Output As #fh1',
        '    fh2 = FreeFile',
        '    Open "b.dat" For Output As #fh2',
        '    Write #fh2, x, y',
        'End Sub',
      ),
    ).toEqual(['Open For Output:-:-', 'Open For Output:csv:-']);
  });

  it('forgets a handle once it is closed or reopened for input, and at the end of the procedure', () => {
    expect(
      csv(
        'Sub D()',
        '    Open "a.dat" For Output As #1',
        '    Close #1',
        '    Open "in.txt" For Input As #1',
        '    Write #1, x',
        'End Sub',
      ),
    ).toEqual(['Open For Output:-:-']);
    expect(
      csv(
        'Sub E()',
        '    Open "a.dat" For Output As #1',
        'End Sub',
        'Sub F()',
        '    Write #1, x',
        'End Sub',
      ),
    ).toEqual(['Open For Output:-:-']);
  });

  it('writes with a comma separated Print # to the handle it names', () => {
    expect(
      csv(
        'Sub G()',
        '    Open "x.dat" For Output As #1',
        '    Open "y.dat" For Output As #2',
        '    Print #2, a; ","; b',
        'End Sub',
      ),
    ).toEqual(['Open For Output:-:-', 'Open For Output:csv:-']);
  });
});

// Only a write on an object known to be Excel counts (review 10/11: rs.Save,
// Text1.Value and a grid's Cells are not Excel), and a write after a one-line
// If or Else is a write.
describe('a write counts only on an Excel object', () => {
  const kinds = (...lines: string[]) => scan(...lines).map((s) => s.kind);
  const open = [
    '    Set xl = CreateObject("Excel.Application")',
    '    Set wb = xl.Workbooks.Open("in.xls")',
  ];
  it.each([
    ['an ADO Recordset Save', '    rs.Save "a.xml", adPersistXML'],
    ['a control Value', '    Text1.Value = 1'],
    ['a check box Value', '    chkAll.Value = vbChecked'],
    ['a grid Cells', '    grid.Cells(1, 1) = x'],
    [
      'an UPDATE on an ordinary database',
      '    cn.Execute "UPDATE t SET a = 1"',
    ],
    [
      'an INSERT on an ordinary database',
      '    cn.Execute "INSERT INTO t VALUES (1)"',
    ],
    ['a Save of another object', '    doc.Save'],
  ])('does not count %s', (_name, line) => {
    expect(kinds(...open, line)).toEqual([]);
  });
  it('does not count a read of an Excel cell', () => {
    expect(kinds(...open, '    v = wb.Sheets(1).Cells(1, 1).Value')).toEqual(
      [],
    );
    expect(
      kinds(...open, '    If wb.Sheets(1).Cells(1, 1).Value = 1 Then n = 2'),
    ).toEqual([]);
  });
  it('does not count an INSERT when the file has no Excel ADO source', () => {
    expect(
      kinds(
        '    cn.Open "Provider=SQLOLEDB;Data Source=srv"',
        '    cn.Execute "INSERT INTO t VALUES (1)"',
        '    Set xl = CreateObject("Excel.Application")',
      ),
    ).toEqual([]);
  });
  it.each([
    [
      'a variable declared As Excel',
      ['    Dim ws As Excel.Worksheet', '    ws.Cells(1, 1).Value = "a"'],
    ],
    [
      'a Set from another Excel object',
      [...open, '    Set ws = wb.Worksheets(1)', '    ws.Range("A1") = "a"'],
    ],
    [
      'the block of a With on an Excel object',
      [
        ...open,
        '    With xl.ActiveSheet',
        '        .Cells(1, 1) = "a"',
        '    End With',
      ],
    ],
  ])('counts a write on %s', (_name, lines) => {
    expect(
      kinds('    Set xl = CreateObject("Excel.Application")', ...lines),
    ).toContain('excel');
  });
  it.each([
    ['If ... Then save', [...open, '    If ok Then wb.SaveAs path']],
    [
      'Then ... Else a cell',
      [
        ...open,
        '    If a Then n = 1 Else wb.Sheets(1).Cells(1, 1).Value = "x"',
      ],
    ],
    [
      'a cell after Then',
      [...open, '    If ok Then xl.ActiveSheet.Range("A1") = "x"'],
    ],
    ['a statement after a colon', [...open, '    n = 1: wb.SaveAs path']],
  ])('counts a write in a one-line statement: %s', (_name, lines) => {
    expect(kinds(...lines)).toContain('excel');
  });
  it('a CSV write after a one-line If belongs to its handle', () => {
    const [signal] = scan(
      '    Open sOut For Output As #1',
      '    If ok Then Write #1, a, b',
      '    Close #1',
    );
    expect(signal?.subkind).toBe('csv');
  });
});

// Variables are followed by procedure and by connection (review 10/11, third
// round): a name means what it was last declared or set to in its procedure,
// and a write counts on the Excel connection it runs on.
describe('Excel objects and connections are followed by scope', () => {
  const kinds = (...lines: string[]) => scan(...lines).map((s) => s.kind);

  it('a variable of another procedure with the same name is not Excel', () => {
    expect(
      kinds(
        'Sub Read()',
        '    Dim xl As Object, wb As Object',
        '    Set xl = CreateObject("Excel.Application")',
        '    Set wb = xl.Workbooks.Open("in.xls")',
        'End Sub',
        'Sub Dump()',
        '    Dim wb As ADODB.Recordset',
        '    Set wb = New ADODB.Recordset',
        '    wb.Save "data.xml"',
        'End Sub',
      ),
    ).toEqual([]);
  });
  it('a local variable hides a module variable of the same name', () => {
    expect(
      kinds(
        'Private wb As Excel.Workbook',
        'Sub A()',
        '    Set xl = CreateObject("Excel.Application")',
        '    Dim wb As ADODB.Recordset',
        '    wb.Save "data.xml"',
        'End Sub',
      ),
    ).toEqual([]);
  });
  it('a module variable set in one procedure is Excel in another', () => {
    expect(
      kinds(
        'Private xl As Object',
        'Sub Init()',
        '    Set xl = CreateObject("Excel.Application")',
        'End Sub',
        'Sub Save()',
        '    xl.ActiveWorkbook.SaveAs "out.xls"',
        'End Sub',
      ),
    ).toContain('excel');
  });
  it('a variable set again in the same procedure takes its new kind', () => {
    expect(
      kinds(
        'Sub A()',
        '    Set xl = CreateObject("Excel.Application")',
        '    Set wb = xl.Workbooks.Open("in.xls")',
        '    Set wb = New ADODB.Recordset',
        '    wb.Save "data.xml"',
        'End Sub',
      ),
    ).toEqual([]);
    expect(
      kinds(
        'Sub A()',
        '    Set xl = CreateObject("Excel.Application")',
        '    Set wb = Nothing',
        '    Set wb = xl.Workbooks.Open("in.xls")',
        '    wb.Save',
        'End Sub',
      ),
    ).toContain('excel');
  });
  it('a parameter As Excel.* is a known Excel object: its write is a signal at the write', () => {
    expect(
      kinds(
        'Sub Fill(wb As Excel.Workbook)',
        '    wb.Sheets(1).Cells(1, 1) = "a"',
        'End Sub',
      ),
    ).toEqual(['excel']);
    expect(
      kinds(
        'Sub Fill(wb As Excel.Workbook)',
        '    Set xl = CreateObject("Excel.Application")',
        '    wb.Sheets(1).Cells(1, 1) = "a"',
        'End Sub',
      ),
    ).toContain('excel');
  });

  const excelCn = [
    '    Set excelCn = New ADODB.Connection',
    '    excelCn.Open "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=a.xls;Extended Properties=""Excel 8.0"""',
  ];
  it('reading from an Excel connection and writing to another is not an Excel output', () => {
    expect(
      kinds(
        'Sub Move()',
        ...excelCn,
        '    Set rs = excelCn.Execute("SELECT * FROM [Sheet1$]")',
        '    Set dbCn = New ADODB.Connection',
        '    dbCn.Open "Provider=SQLOLEDB;Data Source=srv"',
        '    dbCn.Execute "UPDATE t SET a = 1"',
        'End Sub',
      ),
    ).toEqual([]);
  });
  it('INSERT / UPDATE on the Excel connection is an Excel output', () => {
    expect(
      kinds(
        'Sub Fill()',
        ...excelCn,
        '    excelCn.Execute "INSERT INTO [Sheet1$] VALUES (1)"',
        'End Sub',
      ),
    ).toContain('excel');
  });
  it('the SQL in a variable, run on the Excel connection', () => {
    expect(
      kinds(
        'Sub Fill()',
        ...excelCn,
        '    sql = "UPDATE [Sheet1$] SET a = 1"',
        '    excelCn.Execute sql',
        'End Sub',
      ),
    ).toContain('excel');
  });
  it('a connection string in a module constant', () => {
    expect(
      kinds(
        'Const CONN = "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=a.xls;Extended Properties=""Excel 8.0"""',
        'Sub Fill()',
        '    Set cn = New ADODB.Connection',
        '    cn.Open CONN',
        '    cn.Execute "INSERT INTO [Sheet1$] VALUES (1)"',
        'End Sub',
      ),
    ).toContain('excel');
  });
  it('a recordset opened on the Excel connection then changed', () => {
    expect(
      kinds(
        'Sub Fill()',
        ...excelCn,
        '    Set rs = New ADODB.Recordset',
        '    rs.Open "SELECT * FROM [Sheet1$]", excelCn, adOpenDynamic, adLockOptimistic',
        '    rs.AddNew',
        '    rs.Update',
        'End Sub',
      ),
    ).toContain('excel');
  });
  it('a recordset opened on another connection is not Excel', () => {
    expect(
      kinds(
        'Sub Fill()',
        ...excelCn,
        '    Set rs = New ADODB.Recordset',
        '    rs.Open "SELECT * FROM t", dbCn',
        '    rs.AddNew',
        '    rs.Update',
        'End Sub',
      ),
    ).toEqual([]);
  });
  it('a connection string that cannot be resolved counts for nothing', () => {
    expect(
      kinds(
        'Sub Fill()',
        '    Set cn = New ADODB.Connection',
        '    cn.Open GetSetting("app", "db", "conn")',
        '    cn.Execute "INSERT INTO [Sheet1$] VALUES (1)"',
        'End Sub',
      ),
    ).toEqual([]);
  });
});

describe('every signal comes from a split statement', () => {
  it('Open For Output after Then, then Write #, is a CSV', () => {
    const [signal] = scan(
      'Sub Out()',
      '    If ok Then Open "out.csv" For Output As #1',
      '    Write #1, a, b',
      '    Close #1',
      'End Sub',
    );
    expect(signal).toMatchObject({ kind: 'file-output', subkind: 'csv' });
    const [other] = scan(
      'Sub Out()',
      '    If ok Then Open sOut For Output As #1',
      '    Write #1, a, b',
      '    Close #1',
      'End Sub',
    );
    expect(other).toMatchObject({ kind: 'file-output', subkind: 'csv' });
  });
  it('a print or a report after Else', () => {
    const found = scan(
      '    If a Then n = 1 Else Printer.Print "x"',
      '    If b Then rpt.ReportFileName = "a.rpt"',
    ).map((s) => s.kind);
    expect(found).toEqual(['print', 'crystal']);
  });
});
