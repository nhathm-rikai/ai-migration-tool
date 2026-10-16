// Developer/TL command: builds a source inventory for a local folder and
// writes it as JSON. Read-only on the source; never follows symlinks while
// reading and refuses outputs whose physical path is inside the analyzed
// folder or that collide with each other (see output-guard.ts).
//
//   node apps/api/dist/cli/analyze-source.js --root <dir> --out <file.json>
//     [--profile vb6-cp932-v1] [--summary <programs.csv>]
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { programSummaryCsv } from '../modules/analysis/program-summary.js';
import { buildSourceInventory } from '../modules/analysis/source-inventory.js';
import { findSourceProfile } from '../modules/analysis/source-profiles.js';
import { checkOutputs } from './output-guard.js';

const MAX_FILE_BYTES = 16 * 1024 * 1024;

type Skipped = { relativePath: string; reason: 'symlink' | 'too-large' };

async function collectFiles(root: string) {
  const files: { relativePath: string; bytes: Uint8Array }[] = [];
  const skipped: Skipped[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const absolute = join(dir, entry.name);
      const relativePath = relative(root, absolute).split(sep).join('/');
      if (entry.isSymbolicLink()) {
        skipped.push({ relativePath, reason: 'symlink' });
      } else if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        const { size } = await lstat(absolute);
        if (size > MAX_FILE_BYTES)
          skipped.push({ relativePath, reason: 'too-large' });
        else files.push({ relativePath, bytes: await readFile(absolute) });
      }
    }
  }
  await walk(root);
  return { files, skipped };
}

export async function main(argv: string[]): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: {
      root: { type: 'string' },
      out: { type: 'string' },
      summary: { type: 'string' },
      profile: { type: 'string', default: 'vb6-cp932-v1' },
    },
  });
  const profile = findSourceProfile(values.profile);
  if (!values.root || !values.out || !profile) {
    console.error(
      'Usage: analyze-source --root <dir> --out <file.json> [--profile vb6-cp932-v1] [--summary <programs.csv>]',
    );
    return 2;
  }
  const root = resolve(values.root);
  const out = resolve(values.out);
  const summary = values.summary ? resolve(values.summary) : null;
  const outputs = summary ? [out, summary] : [out];
  const refused = await checkOutputs(root, outputs);
  if (refused) {
    console.error(refused);
    return 2;
  }
  const { files, skipped } = await collectFiles(root);
  const inventory = buildSourceInventory({ profile, files });
  // Checked again right before writing: links may change while reading.
  const changed = await checkOutputs(root, outputs);
  if (changed) {
    console.error(changed);
    return 2;
  }
  await writeFile(out, JSON.stringify({ ...inventory, skipped }, null, 2));
  if (summary) await writeFile(summary, programSummaryCsv(inventory));
  const { totals } = inventory;
  console.log(
    [
      `files=${totals.files} code=${totals.codeFiles} analyzed=${totals.analyzedCodeFiles}`,
      `unsupported=${totals.unsupportedFiles} errors=${totals.errorFiles} skipped=${skipped.length}`,
      `programs=${inventory.programs.length} complete=${inventory.programs.filter((p) => p.complete).length}`,
      `uniqueCodeLines=${totals.uniqueCounters.codeLines} unclassified=${totals.uniqueCounters.unclassifiedLines}`,
    ].join('\n'),
  );
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
