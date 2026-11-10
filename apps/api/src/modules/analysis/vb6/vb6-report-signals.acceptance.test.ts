import { deriveReportSummary } from '@portal/contracts';
import { describe, expect, it } from 'vitest';
import { buildSourceInventory } from '../source-inventory.js';
import { findSourceProfile } from '../source-profiles.js';

// Fixed acceptance set of the report signals (review 10/11): common VB6
// patterns with the number of reports they must give, taken through the whole
// inventory -> report total. Fixtures are written for this test. A case
// outside this set is a limit to record, not a defect, unless it changes the
// pilot totals or is a common pattern: then it is added here.

const found = findSourceProfile('vb6-cp932-v1');
if (!found) throw new Error('profile missing');
const profile = found;

const encode = (...lines: string[]) =>
  new TextEncoder().encode(lines.join('\r\n') + '\r\n');

// One program with one module holding the given code.
function counts(...code: string[]) {
  const inventory = buildSourceInventory({
    profile,
    files: [
      {
        relativePath: 'a/A.vbp',
        bytes: encode('Type=Exe', 'Module=M; M.bas', 'Name="P"'),
      },
      {
        relativePath: 'a/M.bas',
        bytes: encode('Attribute VB_Name = "M"', ...code),
      },
    ],
  });
  const summary = deriveReportSummary(inventory);
  if (!summary) throw new Error('no summary');
  return summary.counts;
}
const sub = (...body: string[]) => ['Public Sub T()', ...body, 'End Sub'];
const EXCEL_CONN =
  '    cn.Open "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=a.xls;Extended Properties=""Excel 8.0"""';
const XL = [
  '    Set xl = CreateObject("Excel.Application")',
  '    Set wb = xl.Workbooks.Open("in.xls")',
];

type Expected = Partial<{
  crystal: number;
  print: number;
  export: number;
  dataFiles: number;
  excluded: number;
}>;
const cases: [string, string[], Expected][] = [
  // --- Excel automation: a write on an Excel object is an export.
  [
    'CreateObject + Workbooks.Add',
    sub(
      '    Set xl = CreateObject("Excel.Application")',
      '    Set wb = xl.Workbooks.Add',
    ),
    { export: 1 },
  ],
  ['Open then SaveAs', sub(...XL, '    wb.SaveAs "out.xls"'), { export: 1 }],
  [
    'GetObject then a cell value',
    sub(
      '    Set xl = GetObject(, "Excel.Application")',
      '    xl.ActiveSheet.Cells(1, 1).Value = "a"',
    ),
    { export: 1 },
  ],
  [
    'Dim As New Excel.Application, With block range',
    sub(
      '    Dim xl As New Excel.Application',
      '    With xl.ActiveSheet',
      '        .Range("A1") = "a"',
      '    End With',
    ),
    { export: 1 },
  ],
  [
    'a Worksheet set from a workbook, range assigned',
    sub(...XL, '    Set ws = wb.Worksheets(1)', '    ws.Range("A1") = 1'),
    { export: 1 },
  ],
  [
    'a parameter As Excel.Workbook written with no CreateObject in the file',
    [
      'Public Sub Fill(wb As Excel.Workbook)',
      '    wb.Sheets(1).Cells(1, 1) = "a"',
      '    wb.Save',
      'End Sub',
    ],
    { export: 1 },
  ],
  [
    'a module variable set in one procedure, saved in another',
    [
      'Private xl As Object',
      ...sub('    Set xl = CreateObject("Excel.Application")').map((l) =>
        l.replace('Sub T', 'Sub Init'),
      ),
      'Public Sub Save()',
      '    xl.ActiveWorkbook.SaveAs "out.xls"',
      'End Sub',
    ],
    { export: 1 },
  ],
  [
    'SaveAs after If ... Then on one line',
    sub(...XL, '    If ok Then wb.SaveAs path'),
    { export: 1 },
  ],
  // --- Excel automation: a read, or another object, is not.
  [
    'Workbooks.Open for reading',
    sub(...XL, '    v = wb.Sheets(1).Cells(1, 1).Value'),
    { export: 0 },
  ],
  [
    'comparing a cell is not a write',
    sub(...XL, '    If wb.Sheets(1).Cells(1, 1).Value = 1 Then n = 2'),
    { export: 0 },
  ],
  [
    'Shell EXCEL.EXE to open a file',
    sub('    Shell "EXCEL.EXE in.xls", 1'),
    { export: 0 },
  ],
  [
    'Recordset.Save next to a read of Excel',
    sub(...XL, '    rs.Save "a.xml"'),
    { export: 0 },
  ],
  [
    'Text1.Value next to a read of Excel',
    sub(...XL, '    Text1.Value = 1'),
    { export: 0 },
  ],
  [
    'a check box Value',
    sub(...XL, '    chkAll.Value = vbChecked'),
    { export: 0 },
  ],
  [
    'grid.Cells next to a read of Excel',
    sub(...XL, '    grid.Cells(1, 1) = x'),
    { export: 0 },
  ],
  [
    'a wb that is an Excel workbook in one procedure and a Recordset in another',
    [
      'Public Sub Read()',
      '    Dim xl As Object, wb As Object',
      '    Set xl = CreateObject("Excel.Application")',
      '    Set wb = xl.Workbooks.Open("in.xls")',
      'End Sub',
      'Public Sub Dump()',
      '    Dim wb As ADODB.Recordset',
      '    Set wb = New ADODB.Recordset',
      '    wb.Save "data.xml"',
      'End Sub',
    ],
    { export: 0 },
  ],
  [
    'a module Excel variable hidden by an untyped parameter',
    [
      'Private wb As Excel.Workbook',
      'Public Sub Read()',
      '    Set xl = CreateObject("Excel.Application")',
      'End Sub',
      'Public Sub Dump(wb)',
      '    wb.Save "data.xml"',
      'End Sub',
    ],
    { export: 0 },
  ],
  [
    'a module Excel variable hidden by a parameter As Object',
    [
      'Private wb As Excel.Workbook',
      'Public Sub Read()',
      '    Set xl = CreateObject("Excel.Application")',
      'End Sub',
      'Public Sub Dump(ByVal wb As Object)',
      '    wb.Save "data.xml"',
      'End Sub',
    ],
    { export: 0 },
  ],
  [
    'a module Excel variable hidden by an untyped Dim',
    [
      'Private wb As Excel.Workbook',
      'Public Sub Read()',
      '    Set xl = CreateObject("Excel.Application")',
      'End Sub',
      'Public Sub Dump()',
      '    Dim wb',
      '    wb.Save "data.xml"',
      'End Sub',
    ],
    { export: 0 },
  ],
  [
    'a variable set again to a Recordset',
    sub(...XL, '    Set wb = New ADODB.Recordset', '    wb.Save "data.xml"'),
    { export: 0 },
  ],
  // --- ADO Excel.
  [
    'INSERT on the Excel connection',
    sub(
      '    Set cn = New ADODB.Connection',
      EXCEL_CONN,
      '    cn.Execute "INSERT INTO [Sheet1$] VALUES (1)"',
    ),
    { export: 1 },
  ],
  [
    'an UPDATE kept in a variable, run on the Excel connection',
    sub(
      '    Set cn = New ADODB.Connection',
      EXCEL_CONN,
      '    sql = "UPDATE [Sheet1$] SET a = 1"',
      '    cn.Execute sql',
    ),
    { export: 1 },
  ],
  [
    'a connection string in a module constant',
    [
      'Const CONN = "Provider=Microsoft.Jet.OLEDB.4.0;Data Source=a.xls;Extended Properties=""Excel 8.0"""',
      ...sub(
        '    Set cn = New ADODB.Connection',
        '    cn.Open CONN',
        '    cn.Execute "INSERT INTO [Sheet1$] VALUES (1)"',
      ),
    ],
    { export: 1 },
  ],
  [
    'a recordset opened on the Excel connection, AddNew and Update',
    sub(
      '    Set cn = New ADODB.Connection',
      EXCEL_CONN,
      '    Set rs = New ADODB.Recordset',
      '    rs.Open "SELECT * FROM [Sheet1$]", cn, adOpenDynamic, adLockOptimistic',
      '    rs.AddNew',
      '    rs.Update',
    ),
    { export: 1 },
  ],
  [
    'a command tied to the Excel connection, its CommandText an UPDATE',
    sub(
      '    Set cn = New ADODB.Connection',
      EXCEL_CONN,
      '    Set cmd = New ADODB.Command',
      '    cmd.ActiveConnection = cn',
      '    cmd.CommandText = "UPDATE [Sheet1$] SET a = 1"',
      '    cmd.Execute',
    ),
    { export: 1 },
  ],
  [
    'a SELECT from Excel only',
    sub(
      '    Set cn = New ADODB.Connection',
      EXCEL_CONN,
      '    Set rs = cn.Execute("SELECT * FROM [Sheet1$]")',
    ),
    { export: 0 },
  ],
  [
    'read Excel, UPDATE another database',
    sub(
      '    Set cn = New ADODB.Connection',
      EXCEL_CONN,
      '    Set rs = cn.Execute("SELECT * FROM [Sheet1$]")',
      '    Set db = New ADODB.Connection',
      '    db.Open "Provider=SQLOLEDB;Data Source=srv"',
      '    db.Execute "UPDATE t SET a = 1"',
    ),
    { export: 0 },
  ],
  [
    'one connection opened on Excel, then on SQL Server, then UPDATE',
    sub(
      '    Set cn = New ADODB.Connection',
      EXCEL_CONN,
      '    Set rs = cn.Execute("SELECT * FROM [Sheet1$]")',
      '    cn.Close',
      '    cn.Open "Provider=SQLOLEDB;Data Source=srv"',
      '    cn.Execute "UPDATE t SET a = 1"',
    ),
    { export: 0 },
  ],
  [
    'a connection given another ConnectionString',
    sub(
      '    Set cn = New ADODB.Connection',
      EXCEL_CONN,
      '    cn.Close',
      '    cn.ConnectionString = "Provider=SQLOLEDB;Data Source=srv"',
      '    cn.Open',
      '    cn.Execute "UPDATE t SET a = 1"',
    ),
    { export: 0 },
  ],
  [
    'a recordset moved to another connection',
    sub(
      '    Set cn = New ADODB.Connection',
      EXCEL_CONN,
      '    Set db = New ADODB.Connection',
      '    db.Open "Provider=SQLOLEDB;Data Source=srv"',
      '    Set rs = New ADODB.Recordset',
      '    rs.Open "SELECT * FROM [Sheet1$]", cn',
      '    Set rs.ActiveConnection = db',
      '    rs.AddNew',
      '    rs.Update',
    ),
    { export: 0 },
  ],
  [
    'a recordset opened on another connection',
    sub(
      '    Set cn = New ADODB.Connection',
      EXCEL_CONN,
      '    Set db = New ADODB.Connection',
      '    db.Open "Provider=SQLOLEDB;Data Source=srv"',
      '    Set rs = New ADODB.Recordset',
      '    rs.Open "SELECT * FROM t", db',
      '    rs.AddNew',
      '    rs.Update',
    ),
    { export: 0 },
  ],
  [
    'a command on another connection with an UPDATE',
    sub(
      '    Set cn = New ADODB.Connection',
      EXCEL_CONN,
      '    Set db = New ADODB.Connection',
      '    db.Open "Provider=SQLOLEDB;Data Source=srv"',
      '    Set cmd = New ADODB.Command',
      '    cmd.ActiveConnection = db',
      '    cmd.CommandText = "UPDATE t SET a = 1"',
      '    cmd.Execute',
    ),
    { export: 0 },
  ],
  [
    'printing a SQL text and the connection state is not a call',
    sub(
      '    Set cn = New ADODB.Connection',
      EXCEL_CONN,
      '    sql = "UPDATE [Sheet1$] SET a = 1"',
      '    Debug.Print cn.State, sql',
    ),
    { export: 0 },
  ],
  [
    'a connection string that cannot be resolved',
    sub(
      '    Set cn = New ADODB.Connection',
      '    cn.Open GetSetting("app", "db", "conn")',
      '    cn.Execute "INSERT INTO [Sheet1$] VALUES (1)"',
    ),
    { export: 0 },
  ],
  [
    'an UPDATE on an ordinary database next to a read of Excel',
    sub(...XL, '    cn.Execute "UPDATE t SET a = 1"'),
    { export: 0 },
  ],
  // --- CSV.
  [
    'Open a .csv For Output, Write #',
    sub(
      '    Open "out.csv" For Output As #1',
      '    Write #1, a, b',
      '    Close #1',
    ),
    { export: 1 },
  ],
  [
    'Open a path variable, Write #',
    sub('    Open sOut For Output As #1', '    Write #1, a, b', '    Close #1'),
    { export: 1 },
  ],
  [
    'Print # with a comma between the values',
    sub(
      '    Open sOut For Output As #1',
      '    Print #1, a & "," & b',
      '    Close #1',
    ),
    { export: 1 },
  ],
  [
    'Open For Append, Write #',
    sub('    Open sOut For Append As #1', '    Write #1, a, b', '    Close #1'),
    { export: 1 },
  ],
  [
    'a file handle from FreeFile',
    sub(
      '    f = FreeFile',
      '    Open sOut For Output As #f',
      '    Write #f, a, b',
      '    Close #f',
    ),
    { export: 1 },
  ],
  [
    'Open after Then on one line, then Write #',
    sub(
      '    If ok Then Open sOut For Output As #1',
      '    Write #1, a, b',
      '    Close #1',
    ),
    { export: 1 },
  ],
  [
    'Write # after Then on one line',
    sub(
      '    Open sOut For Output As #1',
      '    If ok Then Write #1, a, b',
      '    Close #1',
    ),
    { export: 1 },
  ],
  [
    'statements joined by a colon',
    sub('    Open sOut For Output As #1: Write #1, a, b: Close #1'),
    { export: 1 },
  ],
  [
    'two files: the write belongs to the first handle only',
    sub(
      '    Open "C:/data/a.dat" For Output As #1',
      '    Open "C:/data/b.dat" For Output As #2',
      '    Write #1, a, b',
      '    Print #2, "plain"',
      '    Close #1',
      '    Close #2',
    ),
    { export: 1, dataFiles: 1 },
  ],
  [
    'a log and a CSV together',
    sub(
      '    Open sLogFile For Append As #1',
      '    Open sOut For Output As #2',
      '    Write #1, Now, msg',
      '    Write #2, a, b',
      '    Close #1',
      '    Close #2',
    ),
    { export: 1, excluded: 1 },
  ],
  [
    'plain Print # is a data file, not a CSV',
    sub(
      '    Open sOut For Output As #1',
      '    Print #1, "header"',
      '    Close #1',
    ),
    { export: 0, dataFiles: 1 },
  ],
  [
    'Write # after Close belongs to no file',
    sub('    Open sOut For Output As #1', '    Close #1', '    Write #1, a, b'),
    { export: 0, dataFiles: 1 },
  ],
  [
    'Open For Input is not an output',
    sub('    Open sIn For Input As #1', '    Close #1'),
    { export: 0, dataFiles: 0 },
  ],
  [
    'a temp file written with commas is excluded',
    sub(
      '    Open tmpPath For Output As #1',
      '    Write #1, a, b',
      '    Close #1',
    ),
    { export: 0, excluded: 1 },
  ],
  // --- Print and Crystal.
  [
    'Printer.Print',
    sub('    Printer.Print "a"', '    Printer.EndDoc'),
    { print: 1 },
  ],
  ['PrintForm', sub('    Me.PrintForm'), { print: 1 }],
  [
    'Printer.Print after Else on one line',
    sub('    If a Then n = 1 Else Printer.Print "x"'),
    { print: 1 },
  ],
  ['Debug.Print is not a report', sub('    Debug.Print "a"'), { print: 0 }],
  [
    'Picture1.Print is not a report',
    sub('    Picture1.Print "a"'),
    { print: 0 },
  ],
  [
    'a Crystal template',
    sub('    rpt.ReportFileName = "a.rpt"'),
    { crystal: 1 },
  ],
  [
    'two Crystal templates',
    sub('    rpt.ReportFileName = "a.rpt"', '    rpt.ReportFileName = "b.rpt"'),
    { crystal: 2 },
  ],
  [
    'a .rpt after Then on one line',
    sub('    If b Then rpt.ReportFileName = "a.rpt"'),
    { crystal: 1 },
  ],
  [
    'a .rpt in a comment',
    sub('    \' rpt.ReportFileName = "a.rpt"'),
    { crystal: 0 },
  ],
  // --- Excel export through a template: a workbook opened from a .xlt and
  // filled, with no SaveAs; formatting alone is not a write.
  [
    'a template opened, a range filled from a recordset',
    sub(
      '    Set xl = CreateObject("Excel.Application")',
      '    Set wb = xl.Workbooks.Open("t.xlt")',
      '    Set ws = wb.Sheets(1)',
      '    ws.Range("A2").CopyFromRecordset rs',
    ),
    { export: 1 },
  ],
  [
    'a template opened, a Paste',
    sub(...XL, '    wb.Sheets(1).Paste'),
    { export: 1 },
  ],
  [
    'a template opened, a PasteSpecial',
    sub(...XL, '    wb.Sheets(1).Range("A1").PasteSpecial xlPasteValues'),
    { export: 1 },
  ],
  [
    'a template opened, a Formula assigned',
    sub(...XL, '    wb.Sheets(1).Range("A1").Formula = "=SUM(B1:B9)"'),
    { export: 1 },
  ],
  [
    'a template opened, only formatting (colour, font, width)',
    sub(
      ...XL,
      '    wb.Sheets(1).Range("A1").Interior.Color = vbRed',
      '    wb.Sheets(1).Range("A1").Font.Bold = True',
      '    wb.Sheets(1).Columns(1).ColumnWidth = 10',
    ),
    { export: 0 },
  ],
];

describe('report signals: the acceptance set, through the report total', () => {
  it('has the cases it says', () => {
    expect(cases.length).toBeGreaterThanOrEqual(55);
  });
  it.each(cases)('%s', (_name, code, expected) => {
    expect(counts(...code)).toMatchObject(expected);
  });
});
