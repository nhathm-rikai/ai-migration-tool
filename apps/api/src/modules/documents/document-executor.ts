import { readFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import {
  packageFileNames,
  type DocumentRun,
  type DocumentRunErrorCode,
  type DocumentRunItem,
  type SourceInventoryDocument,
} from '@portal/contracts';
import type {
  AgentFailureCode,
  AgentRunner,
} from '../../ports/agent-runner.js';
import type { ArtifactStore } from '../../ports/artifact-store.js';
import type { SpecWorkspace } from '../../adapters/local/spec-workspace.js';
import type { NewLogEntry } from './document-run.repository.js';
import {
  createPackageTracker,
  templateSections,
  inputContext,
  parsePackage,
  programFilePaths,
  programP1,
  taskPrompt,
  WORKSPACE,
  FILE_END,
} from './spec-context.js';

const FILE_LINE = /^=== FILE: [a-z-]+\.md ===$/;

// Writes the package of each selected program, one read-only agent session
// per program in its own workspace (README "Flow nghiệp vụ trên Portal",
// runbook 2.2). Runs outside HTTP requests and DB transactions; the
// dispatcher owns state transitions, timeout and cancellation.

// TIMEOUT and STOP_UNCONFIRMED are decided by the dispatcher.
export type ExecutorErrorCode = Exclude<
  DocumentRunErrorCode,
  'TIMEOUT' | 'STOP_UNCONFIRMED'
>;

export type DocumentExecutionResult =
  | { status: 'succeeded' }
  | { status: 'failed'; errorCode: ExecutorErrorCode }
  | { status: 'stopped' };

export type DocumentExecutionRequest = {
  run: DocumentRun;
  signal: AbortSignal;
  report(progress: {
    items: DocumentRunItem[];
    inputTokens: number;
    outputTokens: number;
  }): void;
  log(entry: NewLogEntry): void;
  process(event: { kind: 'started'; pid: number } | { kind: 'exited' }): void;
};

export interface DocumentExecutor {
  execute(request: DocumentExecutionRequest): Promise<DocumentExecutionResult>;
}

// Decoded source of the analysis: null snapshot for demo projects.
export type RunSource =
  | { snapshotId: null }
  | { snapshotId: string; files: ReadonlyMap<string, string> };

const FAILURES: Record<AgentFailureCode, ExecutorErrorCode> = {
  RUNNER_FAILED: 'AGENT_FAILED',
  AGENT_UNAVAILABLE: 'AGENT_UNAVAILABLE',
  AGENT_AUTH_FAILED: 'AGENT_AUTH_FAILED',
  AGENT_QUOTA_EXCEEDED: 'AGENT_QUOTA_EXCEEDED',
  AGENT_OUTPUT_INVALID: 'AGENT_OUTPUT_INVALID',
};

// The agent itself is unusable: later programs would fail the same way.
const STOPS_RUN = new Set<ExecutorErrorCode>([
  'AGENT_UNAVAILABLE',
  'AGENT_AUTH_FAILED',
  'AGENT_QUOTA_EXCEEDED',
  'ARTIFACT_WRITE_FAILED',
  'INTERNAL_ERROR',
]);

export function createDocumentExecutor(deps: {
  runner: AgentRunner;
  // Package files, addressed by package ID and position in the package.
  store: ArtifactStore;
  workspace: SpecWorkspace;
  loadInventory(run: DocumentRun): Promise<SourceInventoryDocument | undefined>;
  loadSource(run: DocumentRun): Promise<RunSource | undefined>;
  nextId(): string;
  now(): Date;
}): DocumentExecutor {
  return {
    async execute(request) {
      const { run, signal } = request;
      const items: DocumentRunItem[] = run.items.map((item) => ({ ...item }));
      let inputTokens = 0;
      let outputTokens = 0;
      const report = () =>
        request.report({
          items: items.map((item) => ({ ...item })),
          inputTokens,
          outputTokens,
        });
      const iso = () => deps.now().toISOString();
      const system = (program: string | null, text: string) =>
        request.log({ stream: 'system', program, text });

      let inventory: SourceInventoryDocument | undefined;
      let source: RunSource | undefined;
      try {
        inventory = await deps.loadInventory(run);
        source = await deps.loadSource(run);
      } catch {
        inventory = undefined;
      }
      if (!inventory || !source) {
        system(null, 'Analysis inventory or source snapshot is not available.');
        return { status: 'failed', errorCode: 'INPUT_UNAVAILABLE' };
      }
      const files = packageFileNames(run.config.generated);
      let firstFailure: ExecutorErrorCode | null = null;

      try {
        for (const [index, item] of items.entries()) {
          if (signal.aborted) return { status: 'stopped' };
          if (firstFailure && STOPS_RUN.has(firstFailure)) {
            item.status = 'skipped';
            report();
            continue;
          }
          const label = item.name;
          item.status = 'running';
          item.startedAt = iso();
          report();
          system(label, `start ${item.program}`);
          const fail = (code: ExecutorErrorCode, text?: string) => {
            item.status = 'failed';
            item.errorCode = code;
            item.finishedAt = iso();
            firstFailure ??= code;
            report();
            if (text) system(label, text);
          };

          const program = inventory.programs.find(
            (entry) => entry.projectPath === item.program,
          );
          if (!program) {
            fail('INPUT_UNAVAILABLE', 'Program is not in the inventory.');
            continue;
          }
          const files_ = source.snapshotId === null ? null : source.files;
          const sourceFiles = files_
            ? programFilePaths(program).flatMap((path) => {
                const text = files_.get(path);
                return text === undefined
                  ? []
                  : [{ path: `${WORKSPACE.source}/${path}`, content: text }];
              })
            : [];
          let workspace;
          try {
            workspace = await deps.workspace.create(run.id, index, [
              {
                path: WORKSPACE.input,
                content: inputContext({
                  program,
                  snapshotId: source.snapshotId,
                  sourceFiles: sourceFiles.length,
                  selected: run.config.selected,
                  generated: run.config.generated,
                  inventoryRef: `artifact ${run.inventory.artifactId} v${run.inventory.version}`,
                }),
              },
              ...Object.entries(programP1(inventory, program)).map(
                ([name, value]) => ({
                  path: `${WORKSPACE.p1}/${name}`,
                  content: `${JSON.stringify(value, null, 1)}\n`,
                }),
              ),
              ...sourceFiles,
            ]);
          } catch {
            fail('INTERNAL_ERROR', 'Could not prepare the agent workspace.');
            continue;
          }

          // Live state of each document, from the FILE markers of the
          // streamed answer (shown on the run, never a publish decision).
          // Counts are known steps: template sections written, and files
          // the task names that the agent has opened (FE-02: no estimate).
          const sectionTotals = await Promise.all(
            files.map(async (name) => {
              try {
                return templateSections(
                  await readFile(
                    join(
                      workspace.directory,
                      WORKSPACE.pack,
                      'templates',
                      name,
                    ),
                    'utf8',
                  ),
                );
              } catch {
                return 1;
              }
            }),
          );
          item.documents = files.map((name, position) => ({
            name,
            status: 'pending',
            sections: { done: 0, total: sectionTotals[position] ?? 1 },
          }));
          const toRead = [
            WORKSPACE.input,
            `${WORKSPACE.pack}/README.md`,
            `${WORKSPACE.pack}/analysis-method.md`,
            `${WORKSPACE.pack}/rules/artifacts.md`,
            ...run.config.generated.map(
              (id) => `${WORKSPACE.pack}/templates/${id}.md`,
            ),
            ...Object.keys(programP1(inventory, program)).map(
              (name) => `${WORKSPACE.p1}/${name}`,
            ),
            ...sourceFiles.map((file) => file.path),
          ];
          const opened = new Set<string>();
          item.reading = { done: 0, total: toRead.length };
          report();
          const noteReads = (text: string) => {
            const normalized = text.replace(/\\+/g, '/');
            let changed = false;
            for (const path of toRead)
              if (!opened.has(path) && normalized.includes(path)) {
                opened.add(path);
                changed = true;
              }
            if (!changed) return;
            item.reading = { done: opened.size, total: toRead.length };
            report();
          };
          const tracker = createPackageTracker(
            files,
            (name, status) => {
              const document = item.documents?.find(
                (entry) => entry.name === name,
              );
              if (!document) return;
              document.status = status;
              if (status === 'written' && document.sections)
                document.sections = {
                  done: document.sections.total,
                  total: document.sections.total,
                };
              report();
            },
            (name) => {
              const document = item.documents?.find(
                (entry) => entry.name === name,
              );
              if (!document?.sections) return;
              // The last step is the END marker: stay below full until then.
              const done = Math.min(
                document.sections.done + 1,
                Math.max(document.sections.total - 1, 0),
              );
              if (done === document.sections.done) return;
              document.sections = { done, total: document.sections.total };
              report();
            },
          );
          // Log paths relative to the workspace: the agent's view.
          // Windows paths compare case-insensitively.
          const prefix = new RegExp(
            (workspace.directory + sep).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            process.platform === 'win32' ? 'gi' : 'g',
          );
          const relativeText = (text: string) => text.replace(prefix, '');
          let insideFile = false;
          const result = await deps.runner.run({
            runId: run.id,
            prompt: taskPrompt({
              generated: run.config.generated,
              language: run.config.outputLanguage,
            }),
            signal,
            model: run.config.model,
            ...(run.config.effort ? { effort: run.config.effort } : {}),
            workingDirectory: workspace.directory,
            maxOutputBytes: run.config.limits.maxOutputBytes,
            onEvent: (event) => {
              if (event.kind === 'delta') {
                tracker.push(event.text);
                return;
              }
              // Document content is not log material: it is read with
              // "Xem" once published, and would fill the log's line cap.
              if (event.kind === 'text') {
                const line = event.text.trim();
                if (FILE_LINE.test(line)) {
                  insideFile = true;
                  // Only the file name reaches the log (the "WRITE" line).
                  system(label, `write ${line.slice(10, -4)}`);
                  return;
                }
                if (line === FILE_END) {
                  insideFile = false;
                  return;
                }
                if (insideFile) return;
              }
              request.log({
                stream: event.kind === 'text' ? 'agent' : event.kind,
                program: label,
                text:
                  event.kind === 'system'
                    ? (() => {
                        const text = relativeText(event.text);
                        noteReads(text);
                        return text;
                      })()
                    : event.text,
              });
            },
            onProcess: (event) => request.process(event),
          });
          tracker.end();
          if (result.status !== 'cancelled' && result.usage) {
            inputTokens += result.usage.inputTokens;
            outputTokens += result.usage.outputTokens;
            item.outputTokens = result.usage.outputTokens;
          }
          if (result.status === 'cancelled') return { status: 'stopped' };
          // AI-03: a read-only session must leave its workspace untouched.
          if (
            (await deps.workspace.treeHash(workspace.directory)) !==
            workspace.hash
          ) {
            fail(
              'AGENT_FAILED',
              'The agent changed its workspace: lockdown broken.',
            );
            continue;
          }
          if (result.status === 'failed') {
            fail(FAILURES[result.code]);
            continue;
          }
          const parsed = parsePackage(result.rawOutput, files);
          if (parsed.status === 'invalid') {
            fail('AGENT_OUTPUT_INVALID', `Package rejected: ${parsed.reason}.`);
            continue;
          }
          if (parsed.status === 'incomplete') {
            fail('PACKAGE_INCOMPLETE', 'A document is not "hoàn tất".');
            continue;
          }
          const packageId = deps.nextId();
          const stored = [];
          try {
            for (const [position, file] of parsed.files.entries()) {
              const bytes = new TextEncoder().encode(file.content);
              const written = await deps.store.publish(
                packageId,
                position + 1,
                bytes,
              );
              stored.push({ name: file.name, ...written });
            }
          } catch {
            fail('ARTIFACT_WRITE_FAILED', 'Could not write the package files.');
            continue;
          }
          item.status = 'succeeded';
          item.documents = files.map((name, position) => ({
            name,
            status: 'written',
            sections: {
              done: sectionTotals[position] ?? 1,
              total: sectionTotals[position] ?? 1,
            },
          }));
          if (item.reading)
            item.reading = {
              done: item.reading.total,
              total: item.reading.total,
            };
          item.packageId = packageId;
          item.files = stored;
          item.finishedAt = iso();
          report();
          system(
            label,
            `done: ${stored.length} files, ${stored.reduce((sum, file) => sum + file.byteLength, 0)} bytes`,
          );
        }
      } finally {
        await deps.workspace.remove(run.id).catch(() => {});
      }
      return firstFailure
        ? { status: 'failed', errorCode: firstFailure }
        : { status: 'succeeded' };
    },
  };
}
