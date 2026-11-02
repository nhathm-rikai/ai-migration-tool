// Checks that the web build to hand over carries the third-party notices
// (UI03, elkjs EPL-2.0 decision): dist/licenses/ must hold the notice file
// and every license text, byte for byte as shipped in the packages, and the
// notice must name the versions and the elkjs package integrity actually
// installed. Run after `vite build`; part of `npm run build`.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const dist = join(repository, 'apps', 'web', 'dist');
const licenses = join(dist, 'licenses');
const modules = join(repository, 'node_modules');

// Shipped license file → the license file of the installed package.
const TEXTS = {
  'EPL-2.0.md': ['elkjs', 'LICENSE.md'],
  'xyflow-react-MIT.txt': ['@xyflow/react', 'LICENSE'],
  'xyflow-system-MIT.txt': ['@xyflow/system', 'LICENSE'],
  'zustand-MIT.txt': ['zustand', 'LICENSE'],
  'classcat-MIT.md': ['classcat', 'LICENSE.md'],
};

const problems = [];
const read = (path) => readFileSync(path);
const version = (name) =>
  JSON.parse(readFileSync(join(modules, name, 'package.json'), 'utf8')).version;

if (!existsSync(join(dist, 'index.html')))
  problems.push('apps/web/dist has no build; run `npm run build` first.');

const noticePath = join(licenses, 'THIRD-PARTY-NOTICES.txt');
const notice = existsSync(noticePath) ? readFileSync(noticePath, 'utf8') : '';
if (!notice) problems.push('dist/licenses/THIRD-PARTY-NOTICES.txt is missing.');

for (const [file, [name, source]] of Object.entries(TEXTS)) {
  const shipped = join(licenses, file);
  if (!existsSync(shipped)) {
    problems.push(`dist/licenses/${file} is missing.`);
    continue;
  }
  if (!read(shipped).equals(read(join(modules, name, source))))
    problems.push(`dist/licenses/${file} differs from ${name}/${source}.`);
  if (!notice.includes(`${name} ${version(name)}`))
    problems.push(`The notice does not name ${name} ${version(name)}.`);
}

const lock = JSON.parse(
  readFileSync(join(repository, 'package-lock.json'), 'utf8'),
);
const elk = lock.packages['node_modules/elkjs'];
if (!elk || !notice.includes(elk.integrity) || !notice.includes(elk.resolved))
  problems.push('The notice does not give the locked elkjs tarball and hash.');
if (!notice.includes(`tree/${version('elkjs')}`))
  problems.push('The notice does not link the elkjs source tag.');

const assets = existsSync(join(dist, 'assets'))
  ? readdirSync(join(dist, 'assets'))
  : [];
if (!assets.some((file) => /^elk-worker\.min-.*\.js$/.test(file)))
  problems.push('The ELK worker named in the notice is not in the build.');
// The elkjs API sits in its own chunk (vite.config.ts) and only there.
const apiChunks = assets.filter((file) => /^elk-api-.*\.js$/.test(file));
if (apiChunks.length !== 1)
  problems.push('The elk-api chunk named in the notice is not in the build.');
if (notice && !notice.includes('assets/elk-api-*.js'))
  problems.push('The notice does not name the elk-api chunk.');
for (const file of assets.filter(
  (name) => name.endsWith('.js') && !/^elk-(api|worker\.min)-/.test(name),
))
  if (
    readFileSync(join(dist, 'assets', file), 'utf8').includes(
      'Missing mandatory parameter',
    )
  )
    problems.push(`elkjs API code is in ${file}, not in the elk-api chunk.`);

if (problems.length > 0) {
  for (const problem of problems) console.error(`[notices] ${problem}`);
  process.exit(1);
}
console.log(
  `[notices] dist/licenses OK: ${Object.keys(TEXTS).length} license texts + notice (elkjs ${version('elkjs')}).`,
);
