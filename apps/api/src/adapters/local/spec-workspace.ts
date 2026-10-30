import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { isRelativeSourcePath } from '../../modules/analysis/source-manifest.js';

// Working directory of one agent session of a specification-design run:
//   <root>/<runId>/<item>/context/docs/specification-design/**  pack copy
//   <root>/<runId>/<item>/context/docs/engineering/**          linked specs
//   <root>/<runId>/<item>/context/{input-context.md,p1/*.json}
//   <root>/<runId>/<item>/source/<relative path>                decoded text
// Everything is a copy owned by the app, so the agent never sees the repo or
// the snapshot itself. The tree hash taken before and after the session
// proves the agent changed nothing (AI-02/03).

// Pack and the engineering documents its links point to.
const PACK_DIRECTORIES = [
  'docs/specification-design',
  'docs/engineering/rules',
  'docs/engineering/specs',
  'docs/engineering/contracts',
] as const;
const PACK_FILES = ['docs/engineering/delivery-gates.md'] as const;

export type WorkspaceFile = { path: string; content: string };

export function createSpecWorkspace(options: {
  // Root holding docs/ (the application root).
  packRoot: string;
  // App-owned directory under the data directory.
  root: string;
}) {
  async function treeHash(directory: string): Promise<string> {
    const hash = createHash('sha256');
    const entries = await readdir(directory, {
      recursive: true,
      withFileTypes: true,
    });
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))
      .sort();
    for (const file of files) {
      hash.update(relative(directory, file).split(sep).join('/')).update('\0');
      hash.update(await readFile(file)).update('\0');
    }
    return hash.digest('hex');
  }

  return {
    // "spec-design-rules-x + spec-design-templates-y" from the pack README.
    packVersion(): string {
      const readme = readFileSync(
        join(options.packRoot, 'docs/specification-design/README.md'),
        'utf8',
      );
      const rules = /pack `([^`]+)`/.exec(readme)?.[1];
      const templates = /template set `([^`]+)`/.exec(readme)?.[1];
      if (!rules || !templates) throw new Error('Pack README has no version.');
      return `${rules} + ${templates}`;
    },

    async create(
      runId: string,
      item: number,
      files: WorkspaceFile[],
    ): Promise<{ directory: string; hash: string }> {
      const directory = join(options.root, runId, String(item));
      await rm(directory, { recursive: true, force: true });
      for (const path of PACK_DIRECTORIES)
        await cp(
          join(options.packRoot, path),
          join(directory, 'context', path),
          {
            recursive: true,
            dereference: false,
            errorOnExist: true,
          },
        );
      for (const path of PACK_FILES)
        await cp(
          join(options.packRoot, path),
          join(directory, 'context', path),
        );
      for (const file of files) {
        // Paths come from the inventory: never outside the workspace.
        if (!isRelativeSourcePath(file.path))
          throw new Error('Unsafe workspace path.');
        const target = join(directory, file.path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, file.content, { flag: 'wx' });
      }
      return { directory, hash: await treeHash(directory) };
    },

    treeHash,

    async remove(runId: string): Promise<void> {
      await rm(join(options.root, runId), { recursive: true, force: true });
    },

    async removeAll(): Promise<void> {
      await rm(options.root, { recursive: true, force: true });
    },
  };
}

export type SpecWorkspace = ReturnType<typeof createSpecWorkspace>;
