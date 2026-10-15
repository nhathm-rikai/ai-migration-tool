import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');
function files(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    },
  );
}
const documents = [
  'AGENTS.md',
  'CLAUDE.md',
  'README.md',
  'apps/api/README.md',
  'apps/web/README.md',
  ...files('docs/engineering'),
  ...files('.agents/skills'),
  ...files('.claude/skills'),
  ...files('.cursor/rules'),
].filter((path) => /\.(md|mdc)$/.test(path));
let links = 0;
for (const path of documents) {
  const content = read(path).replace(/```[\s\S]*?```/g, '');
  assert.ok(
    !content.includes('outputs/progress.md'),
    `Personal progress reference: ${path}`,
  );
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^[a-z]+:\/\//i.test(target)) continue;
    const absolute = resolve(root, dirname(path), target);
    const fromRoot = relative(root, absolute);
    assert.ok(
      !isAbsolute(fromRoot) &&
        fromRoot !== '..' &&
        !fromRoot.startsWith(`..${sep}`),
      `Link leaves repo: ${path} -> ${target}`,
    );
    assert.ok(existsSync(absolute), `Broken link: ${path} -> ${target}`);
    links++;
  }
}
// These wrappers deliberately use a flat YAML subset; reject unexpected syntax rather than guessing.
function wrapper(path) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(read(path));
  assert.ok(match, `Missing frontmatter: ${path}`);
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([a-zA-Z-]+): (.+)$/.exec(line);
    assert.ok(
      field && !Object.hasOwn(metadata, field[1]),
      `Invalid/duplicate field: ${path}`,
    );
    metadata[field[1]] = field[2];
  }
  return { metadata, body: match[2].replace(/\r\n/g, '\n') };
}
for (const name of ['portal-implement', 'portal-techlead-review']) {
  const codex = wrapper(`.agents/skills/${name}/SKILL.md`);
  const claude = wrapper(`.claude/skills/${name}/SKILL.md`);
  assert.deepEqual(Object.keys(codex.metadata).sort(), ['description', 'name']);
  assert.equal(codex.metadata.name, name);
  assert.ok(codex.metadata.description.length > 20);
  assert.deepEqual(claude.metadata, {
    ...codex.metadata,
    'disable-model-invocation': 'true',
  });
  const normalizeInvocation = (body) =>
    body.replaceAll(`Dùng ${name}. `, `/${name} `);
  assert.equal(
    normalizeInvocation(codex.body),
    normalizeInvocation(claude.body),
    `Wrapper behavior differs: ${name}`,
  );
  if (name.endsWith('review')) {
    assert.match(codex.body, /review-only/);
    assert.match(codex.body, /Không sửa source\/test\/config\/rule/);
  }
}
for (const path of files('.cursor/rules')) {
  const { metadata } = wrapper(path);
  assert.ok(
    metadata.description && ['true', 'false'].includes(metadata.alwaysApply),
  );
  if (metadata.alwaysApply === 'false') assert.ok(metadata.globs);
}
const manifest = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
assert.deepEqual(manifest.workspaces, lock.packages[''].workspaces);
for (const workspace of manifest.workspaces) {
  assert.ok(
    existsSync(join(root, workspace, 'package.json')),
    `Missing workspace ${workspace}`,
  );
  assert.ok(
    !existsSync(join(root, workspace, 'package-lock.json')),
    `Nested lockfile ${workspace}`,
  );
}
console.log(
  `Verified ${documents.length} documents, ${links} internal links, 4 skill frontmatters, 3 Cursor frontmatters and root workspace lockfile.`,
);
