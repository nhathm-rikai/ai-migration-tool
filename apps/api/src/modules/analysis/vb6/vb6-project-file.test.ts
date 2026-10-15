import { expect, it } from 'vitest';
import { parseVb6ProjectFile } from './vb6-project-file.js';
import { vb6Analyzer } from './vb6.analyzer.js';

it('reads members, references and the name until the first section', () => {
  expect(
    parseVb6ProjectFile([
      'Type=Exe',
      'Reference=*\\G{00020430-0000-0000-C000-000000000046}#2.0#0#C:\\Windows\\stdole2.tlb#OLE Automation',
      'Object={831FDD16-0C5C-11D2-A9FC-0000F8754DA1}#2.0#0; MSCOMCTL.OCX',
      'Form=frmMain.frm',
      'Module=Shared; ..\\cmn\\GLOBAL.BAS',
      'Class=Legacy; Legacy.cls',
      'UserControl=ctl\\Spin.ctl',
      'Name="Order Entry"',
      '[Add-in]',
      'Form=ignored.frm',
    ]),
  ).toEqual({
    status: 'parsed',
    name: 'Order Entry',
    members: [
      { kind: 'form', name: null, declaredPath: 'frmMain.frm' },
      { kind: 'module', name: 'Shared', declaredPath: '..\\cmn\\GLOBAL.BAS' },
      { kind: 'class', name: 'Legacy', declaredPath: 'Legacy.cls' },
      { kind: 'user-control', name: null, declaredPath: 'ctl\\Spin.ctl' },
    ],
    externalReferences: [
      {
        kind: 'reference',
        identifier: '{00020430-0000-0000-C000-000000000046}',
        fileName: 'stdole2.tlb',
        description: 'OLE Automation',
      },
      {
        kind: 'component',
        identifier: '{831FDD16-0C5C-11D2-A9FC-0000F8754DA1}',
        fileName: 'MSCOMCTL.OCX',
        description: null,
      },
    ],
  });
});

it.each([
  [['"This is not a VBP project"'], 'PROJECT_LINE_UNRECOGNIZED', 1],
  [['Name="NoType"', 'Form=a.frm'], 'PROJECT_TYPE_MISSING', null],
  [['Type=Unknown'], 'PROJECT_TYPE_MISSING', null],
  [[], 'PROJECT_TYPE_MISSING', null],
])(
  'reports %j as unsupported, not as an empty project',
  (lines, reason, line) => {
    expect(parseVb6ProjectFile(lines)).toEqual({
      status: 'unsupported',
      reason,
      line,
    });
  },
);

it('turns declared Windows paths into relative POSIX paths, or null if absolute', () => {
  expect(vb6Analyzer.toRelativeMemberPath('..\\cmn\\GLOBAL.BAS')).toBe(
    '../cmn/GLOBAL.BAS',
  );
  expect(vb6Analyzer.toRelativeMemberPath('C:\\src\\A.BAS')).toBeNull();
  expect(vb6Analyzer.toRelativeMemberPath('\\\\server\\A.BAS')).toBeNull();
});

it.each([
  ['A/B.BAS', 'code'],
  ['A/b.frm', 'code'],
  ['P.VBP', 'project'],
  ['F.FRX', 'resource'],
  ['C.CLS', 'unsupported'],
  ['BUILD.LOG', 'excluded'],
  ['ORACONST.TXT', 'excluded'],
  ['NOEXT', 'excluded'],
] as const)('assigns role of %s', (path, role) => {
  expect(vb6Analyzer.fileRole(path)).toBe(role);
});
