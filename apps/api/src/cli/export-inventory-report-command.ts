import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { SourceInventorySchema } from '@portal/contracts';
import { Type } from 'typebox';
import { Check, Errors } from 'typebox/value';
import {
  buildInventoryReport,
  ReportSelectionError,
  type ComplexityKnownMismatch,
} from '../modules/inventory-report/inventory-report.js';
import { inventoryReportSheets } from '../modules/inventory-report/inventory-report-workbook.js';
import { writeXlsx } from '../modules/inventory-report/xlsx-writer.js';
import {
  checkOutputs,
  fileIdentity,
  physicalPath,
  writeReplacing,
} from './output-guard.js';

// Command behind export-inventory-report.ts, separate so tests can run it
// without the process entry point.

const USAGE =
  'Usage: export-inventory-report --inventory <file.json> --source-root <dir> --programs <ID,ID,...> --out-json <report.json> --out-xlsx <report.xlsx> [--complexity-review <review.json>]';

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

// Why the outputs cannot be written, or null: they must stay outside the
// analyzed source (aliases and junctions resolved) and be distinct files.
async function refuseOutputs(
  sourceRoot: string,
  inputs: readonly string[],
  outputs: readonly string[],
): Promise<string | null> {
  const refused = await checkOutputs(sourceRoot, outputs);
  if (refused) return refused;
  return (await distinctFiles([...inputs, ...outputs]))
    ? null
    : 'Inputs and the two outputs must be different files';
}

// Reviewed misclassifications, e.g. from a complexity holdout comparison.
const ComplexityReviewSchema = Type.Object({
  knownMismatches: Type.Array(
    Type.Object(
      {
        program: Type.String({ minLength: 1 }),
        note: Type.String(),
      },
      { additionalProperties: false },
    ),
  ),
});

export async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      inventory: { type: 'string' },
      'source-root': { type: 'string' },
      programs: { type: 'string' },
      'out-json': { type: 'string' },
      'out-xlsx': { type: 'string' },
      'complexity-review': { type: 'string' },
    },
  });
  if (
    !values.inventory ||
    !values['source-root'] ||
    !values.programs ||
    !values['out-json'] ||
    !values['out-xlsx']
  ) {
    console.error(USAGE);
    return 2;
  }
  const inventoryPath = resolve(values.inventory);
  const sourceRoot = resolve(values['source-root']);
  const outputs = [resolve(values['out-json']), resolve(values['out-xlsx'])];
  const [outJson, outXlsx] = outputs;
  if (!outJson || !outXlsx) return 2;
  const reviewPath = values['complexity-review']
    ? resolve(values['complexity-review'])
    : null;
  const inputs = reviewPath ? [inventoryPath, reviewPath] : [inventoryPath];
  const refused = await refuseOutputs(sourceRoot, inputs, outputs);
  if (refused) {
    console.error(refused);
    return 2;
  }
  let knownMismatches: ComplexityKnownMismatch[] = [];
  if (reviewPath) {
    const review: unknown = JSON.parse(await readFile(reviewPath, 'utf8'));
    if (!Check(ComplexityReviewSchema, review)) {
      console.error(
        'Complexity review must be {"knownMismatches":[{"program":"ID","note":"..."}]}',
      );
      return 2;
    }
    knownMismatches = review.knownMismatches;
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
    report = buildInventoryReport(
      parsed,
      values.programs.split(','),
      knownMismatches,
    );
  } catch (error) {
    if (error instanceof ReportSelectionError) {
      console.error(error.message);
      return 2;
    }
    throw error;
  }
  const workbook = writeXlsx(inventoryReportSheets(report));
  // Checked again right before writing: links may change meanwhile.
  const changed = await refuseOutputs(sourceRoot, inputs, outputs);
  if (changed) {
    console.error(changed);
    return 2;
  }
  await writeReplacing(outJson, `${JSON.stringify(report, null, 2)}\n`);
  await writeReplacing(outXlsx, workbook);
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
