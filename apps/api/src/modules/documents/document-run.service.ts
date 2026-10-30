import { createHash } from 'node:crypto';
import {
  DOCUMENT_LOG_PAGE_SIZE,
  RUNNER_MODELS,
  DEFAULT_AGENT_EFFORT,
  SPEC_GENERATION_ORDER,
  documentsToGenerate,
  type CancelDocumentRunInput,
  type CurrentDocumentRunResponse,
  type DocumentLogPage,
  type DocumentRun,
  type DocumentRunConfig,
  type DocumentRunner,
  type PackageFileContent,
  type Project,
  type SourceInventoryDocument,
  type Run,
  type ArtifactList,
  type StartDocumentRunInput,
} from '@portal/contracts';
import type { ArtifactStore } from '../../ports/artifact-store.js';
import { AppError } from '../../shared/app-error.js';
import { requestFingerprint as fingerprint } from '../jobs/job.service.js';
import type { DocumentJobControl } from './document-dispatcher.js';
import { programName, SPEC_TASK_VERSION } from './spec-context.js';
import type { DocumentRunRepository } from './document-run.repository.js';

export type DocumentRunLimits = DocumentRunConfig['limits'];

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'interrupted']);

export function createDocumentRunService(deps: {
  repository: DocumentRunRepository;
  projects: { get(projectId: string): Project };
  analyzeRuns: { get(projectId: string, runId: string): Run };
  artifacts: { listForRun(projectId: string, runId: string): ArtifactList };
  store: ArtifactStore;
  control: DocumentJobControl;
  runner: DocumentRunner;
  limits: DocumentRunLimits;
  // Versions of the specification-design pack the agent will read.
  specPack: string;
  loadInventory(
    projectId: string,
    inventory: { artifactId: string; version: number },
  ): Promise<SourceInventoryDocument>;
  nextId(): string;
  now(): Date;
}) {
  const { repository } = deps;

  function findRun(projectId: string, runId: string): DocumentRun {
    deps.projects.get(projectId);
    const run = repository.findById(projectId, runId);
    if (!run) throw new AppError('RUN_NOT_FOUND');
    return run;
  }

  // The inventory a new run reads: the published one of a succeeded analyze
  // run of this project.
  function inventoryOf(projectId: string, analysisRunId: string) {
    let analysis: Run;
    try {
      analysis = deps.analyzeRuns.get(projectId, analysisRunId);
    } catch (error) {
      if (error instanceof AppError && error.code === 'RUN_NOT_FOUND')
        throw new AppError('ANALYSIS_REQUIRED');
      throw error;
    }
    if (analysis.status !== 'succeeded')
      throw new AppError('ANALYSIS_REQUIRED');
    const inventory = deps.artifacts
      .listForRun(projectId, analysisRunId)
      .items.find((item) => item.kind === 'source-inventory');
    if (!inventory) throw new AppError('ANALYSIS_REQUIRED');
    return { artifactId: inventory.id, version: inventory.version };
  }

  return {
    // Persists a queued run and returns at once; the dispatcher executes it.
    // Reading the inventory (to name and check the programs) happens before
    // the admission transaction.
    async start(
      projectId: string,
      idempotencyKey: string,
      input: StartDocumentRunInput,
    ) {
      const project = deps.projects.get(projectId);
      if (
        !(RUNNER_MODELS[deps.runner] as readonly string[]).includes(input.model)
      )
        throw new AppError('INVALID_INPUT');
      // Generation order, so the same selection always runs the same way.
      const selected = SPEC_GENERATION_ORDER.filter((id) =>
        input.documents.includes(id),
      );
      const requestFingerprint = fingerprint({ ...input, documents: selected });
      const replay = repository.findByIdempotencyKey(
        project.id,
        idempotencyKey,
      );
      if (replay) {
        if (replay.requestFingerprint !== requestFingerprint)
          throw new AppError('IDEMPOTENCY_KEY_CONFLICT');
        return replay.run;
      }
      const inventory = inventoryOf(project.id, input.analysisRunId);
      const payload = await deps.loadInventory(project.id, inventory);
      const programs = input.programs.map((key) =>
        payload.programs.find((program) => program.projectPath === key),
      );
      if (programs.some((program) => program === undefined))
        throw new AppError('INVALID_INPUT');
      // A demo project has no source files; the pack requires reading
      // source, so a real agent could only answer "đang sinh". Only the fake
      // runner (demo output) runs on demo projects.
      if (project.mode === 'demo' && deps.runner !== 'fake')
        throw new AppError('PROJECT_MODE_CONFLICT');
      const result = repository.transaction(() => {
        const existing = repository.findByIdempotencyKey(
          project.id,
          idempotencyKey,
        );
        if (existing) {
          if (existing.requestFingerprint !== requestFingerprint)
            throw new AppError('IDEMPOTENCY_KEY_CONFLICT');
          return { run: existing.run, created: false };
        }
        if (deps.control.runtimeStatus().status !== 'ready')
          throw new AppError('RUNTIME_RECOVERY_REQUIRED');
        if (repository.findActive(project.id))
          throw new AppError('RUN_ACTIVE_CONFLICT');
        const now = deps.now().toISOString();
        const run: DocumentRun = {
          id: deps.nextId(),
          projectId: project.id,
          status: 'queued',
          stateVersion: 1,
          analysisRunId: input.analysisRunId,
          inventory,
          config: {
            programs: input.programs,
            selected,
            generated: documentsToGenerate(selected),
            model: input.model,
            effort: DEFAULT_AGENT_EFFORT,
            outputLanguage: input.outputLanguage,
            runner: deps.runner,
            specPack: deps.specPack,
            promptVersion: SPEC_TASK_VERSION,
            limits: deps.limits,
          },
          items: programs.map((program) => ({
            program: program?.projectPath ?? '',
            name: program ? programName(program) : '',
            status: 'pending',
            files: [],
            packageId: null,
            errorCode: null,
            outputTokens: null,
            startedAt: null,
            finishedAt: null,
          })),
          inputTokens: 0,
          outputTokens: 0,
          errorCode: null,
          createdAt: now,
          updatedAt: now,
          startedAt: null,
          finishedAt: null,
        };
        repository.insert({ run, idempotencyKey, requestFingerprint });
        return { run, created: true };
      });
      if (result.created) deps.control.wake();
      return result.run;
    },

    get: findRun,

    current(projectId: string): CurrentDocumentRunResponse {
      deps.projects.get(projectId);
      return {
        run:
          repository.findActive(projectId) ??
          repository.findLatest(projectId) ??
          null,
        runner: deps.runner,
        runtime: deps.control.runtimeStatus(),
        specPack: deps.specPack,
      };
    },

    // queued -> cancelled, running -> cancelling (the dispatcher stops the
    // agent and commits cancelled once the process is confirmed gone).
    cancel(
      projectId: string,
      runId: string,
      input: CancelDocumentRunInput,
    ): DocumentRun {
      const run = findRun(projectId, runId);
      if (run.status === 'cancelled') return run;
      if (run.status === 'cancelling') {
        deps.control.requestStop(run.id);
        return repository.findById(projectId, runId) ?? run;
      }
      if (
        TERMINAL.has(run.status) ||
        run.stateVersion !== input.expectedStateVersion
      )
        throw new AppError('RUN_STATE_CONFLICT');
      const now = deps.now().toISOString();
      const updated = repository.transition(
        run.id,
        { status: run.status, stateVersion: run.stateVersion },
        run.status === 'queued'
          ? {
              status: 'cancelled',
              errorCode: null,
              startedAt: null,
              finishedAt: now,
            }
          : {
              status: 'cancelling',
              errorCode: null,
              startedAt: run.startedAt,
              finishedAt: null,
            },
        now,
      );
      if (!updated) throw new AppError('RUN_STATE_CONFLICT');
      if (updated.status === 'cancelling') deps.control.requestStop(updated.id);
      return updated;
    },

    log(
      projectId: string,
      runId: string,
      after: string | undefined,
    ): DocumentLogPage {
      findRun(projectId, runId);
      const from = after === undefined ? 0 : Number(after);
      const items = repository.listLog(runId, from, DOCUMENT_LOG_PAGE_SIZE);
      return { items, last: items.at(-1)?.sequence ?? from };
    },

    // A program's package is readable once the run ended and that package
    // was published complete (coverage `hoàn tất`); a package of an active,
    // cancelled or interrupted run is never shown as a result (DATA-05).
    async packageFile(
      projectId: string,
      runId: string,
      itemIndex: string,
      name: string,
    ): Promise<PackageFileContent> {
      const run = findRun(projectId, runId);
      const item = run.items[Number(itemIndex)];
      const position = item
        ? item.files.findIndex((file) => file.name === name)
        : -1;
      const file = item?.files[position];
      if (
        (run.status !== 'succeeded' && run.status !== 'failed') ||
        !item ||
        item.status !== 'succeeded' ||
        !item.packageId ||
        !file
      )
        throw new AppError('DOCUMENT_NOT_FOUND');
      const bytes = await deps.store.read(item.packageId, position + 1);
      if (
        !bytes ||
        bytes.byteLength !== file.byteLength ||
        createHash('sha256').update(bytes).digest('hex') !== file.sha256
      )
        throw new Error(
          'Stored package file does not match its recorded hash.',
        );
      return {
        runId: run.id,
        program: item.program,
        name: file.name,
        sha256: file.sha256,
        byteLength: file.byteLength,
        content: bytes.toString('utf8'),
      };
    },
  };
}

export type DocumentRunService = ReturnType<typeof createDocumentRunService>;
