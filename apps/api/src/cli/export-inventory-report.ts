// Developer/TL command: writes the JSON and XLSX report of selected programs
// from an inventory JSON made by analyze-source. It reads only that file
// (validated against source-inventory-v1); source files are never opened.
//
//   node apps/api/dist/cli/export-inventory-report.js --inventory <file.json>
//     --programs <ID,ID,...> --out-json <report.json> --out-xlsx <report.xlsx>
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { SourceInventorySchema } from '@portal/contracts';
import { Check, Errors } from 'typebox/value';
import {
  buildInventoryReport,
  ReportSelectionError,
} from '../modules/inventory-report/inventory-report.js';
import { inventoryReportSheets } from '../modules/inventory-report/inventory-report-workbook.js';
import { writeXlsx } from '../modules/inventory-report/xlsx-writer.js';
import { fileIdentity, physicalPath, writeReplacing } from './output-guard.js';

const USAGE =
  'Usage: export-inventory-report --inventory <file.json> --programs <ID,ID,...> --out-json <report.json> --out-xlsx <report.xlsx>';

// The inventory and both outputs must be three different files. Paths are
// compared without case on purpose: refusing two names that differ only in
// case is safe on every OS, writing over the inventory is not.
async function distinctFiles(paths: readonly string[]): Promise<boolean> {
  const seen = new Set<string>();
  for (const path of paths) {
    const keys = [
      (await physicalPath(path)).toLowerCase(),
      await fileIdentity(path),
    ];
    for (const key of keys) {
      if (key === null) continue;
      if (seen.has(key)) return false;
      seen.add(key);
    }
  }
  return true;
}

export async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      inventory: { type: 'string' },
      programs: { type: 'string' },
      'out-json': { type: 'string' },
      'out-xlsx': { type: 'string' },
    },
  });
  if (
    !values.inventory ||
    !values.programs ||
    !values['out-json'] ||
    !values['out-xlsx']
  ) {
    console.error(USAGE);
    return 2;
  }
  const inventoryPath = resolve(values.inventory);
  const outJson = resolve(values['out-json']);
  const outXlsx = resolve(values['out-xlsx']);
  if (!(await distinctFiles([inventoryPath, outJson, outXlsx]))) {
    console.error('The inventory and the two outputs must be different files');
    return 2;
  }
  const parsed: unknown = JSON.parse(await readFile(inventoryPath, 'utf8'));
  if (!Check(SourceInventorySchema, parsed)) {
    const [first] = [...Errors(SourceInventorySchema, parsed)];
    console.error(
      `Not a source-inventory-v1 document: ${first?.instancePath ?? ''} ${first?.message ?? ''}`,
    );
    return 2;
  }
  let report;
  try {
    report = buildInventoryReport(parsed, values.programs.split(','));
  } catch (error) {
    if (error instanceof ReportSelectionError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }
  await writeReplacing(outJson, `${JSON.stringify(report, null, 2)}\n`);
  await writeReplacing(outXlsx, writeXlsx(inventoryReportSheets(report)));
  const { unique, perProgramSum } = report.totals;
  console.log(
    [
      `programs=${report.totals.programs} files=${unique.files} shared=${unique.sharedFiles} procedures=${unique.procedures}`,
      `uniqueCodeLines=${unique.codeLines} perProgramCodeLines=${perProgramSum.codeLines} executable=${unique.executableLines} sql=${unique.sqlLines}`,
      `calls=${report.calls.length} crud=${report.crud.length} dynamicSql=${report.dynamicSql.length} warnings=${report.warnings.length}`,
    ].join('\n'),
  );
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
