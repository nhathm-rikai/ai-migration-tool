import {
  FIXTURE_SOURCE_REVISION,
  PROJECT_DEMO_MODE,
  PROJECT_FIXTURE_ID,
  type Project,
  type ProjectSource,
  type ProjectSourceResponse,
  type PutProjectSourceInput,
} from '@portal/contracts';
import type { SourceRootPolicy } from '../../ports/source-root.js';
import { findSourceProfile } from '../analysis/source-profiles.js';
import { AppError } from '../../shared/app-error.js';
import type { ProjectRunSource } from '../jobs/analyze-run-config.js';
import type {
  SourceRegistrationRepository,
  SourceRevision,
} from './source-registration.repository.js';

// Source registration of a project (B03). PUT checks the root cheaply
// (canonical path, policy, readability) and records a new immutable
// revision; it never walks the source or copies it. The snapshot is taken by
// the run that locks the revision (B06).

const FIXTURE_PROFILE_ID = 'vb6-cp932-v1';

const FIXTURE_SOURCE: ProjectSource = {
  kind: 'fixture',
  fixtureId: PROJECT_FIXTURE_ID,
  displayName: PROJECT_FIXTURE_ID,
  profileId: FIXTURE_PROFILE_ID,
  revision: FIXTURE_SOURCE_REVISION,
  tableNameMapping: { defaultSchema: null, status: 'unconfigured' },
  status: 'ready',
};

export function createSourceRegistrationService(deps: {
  repository: SourceRegistrationRepository;
  roots: SourceRootPolicy;
  projects: { get(projectId: string): Project };
  nextId(): string;
  now(): Date;
}) {
  const { repository } = deps;

  function toLocalSource(
    registration: { registeredAt: string; updatedAt: string },
    current: SourceRevision,
    status: 'ready' | 'unreadable',
    checkedAt: string,
  ): ProjectSource {
    return {
      kind: 'local',
      sourceId: current.sourceId,
      displayName: current.displayName,
      profileId: current.profileId,
      revision: current.revision,
      tableNameMapping: current.tableNameMapping,
      status,
      registeredAt: registration.registeredAt,
      updatedAt: registration.updatedAt,
      checkedAt,
    };
  }

  return {
    // Reads the registration and re-checks its root; writes nothing.
    get(projectId: string): ProjectSourceResponse {
      const project = deps.projects.get(projectId);
      if (project.mode === PROJECT_DEMO_MODE) return { source: FIXTURE_SOURCE };
      const registration = repository.findCurrent(project.id);
      if (!registration) return { source: null };
      const checkedAt = deps.now().toISOString();
      return {
        source: toLocalSource(
          registration,
          registration.current,
          deps.roots.check(registration.current.rootPath),
          checkedAt,
        ),
      };
    },

    // First registration (expectedSourceRevision null) or an update of the
    // revision the caller saw. Every rejection happens before the write.
    put(
      projectId: string,
      input: PutProjectSourceInput,
    ): ProjectSourceResponse {
      const project = deps.projects.get(projectId);
      if (project.mode === PROJECT_DEMO_MODE)
        throw new AppError('PROJECT_MODE_CONFLICT');
      if (!findSourceProfile(input.profileId))
        throw new AppError('SOURCE_PROFILE_UNSUPPORTED');
      const resolved = deps.roots.resolve(input.rootPath);
      if (!resolved.ok) throw new AppError(resolved.code);
      const now = deps.now().toISOString();
      return repository.transaction(() => {
        const existing = repository.findCurrent(project.id);
        const expected = input.expectedSourceRevision;
        if ((existing?.current.revision ?? null) !== expected)
          throw new AppError('SOURCE_REVISION_CONFLICT');
        const revision: SourceRevision = {
          sourceId: existing?.current.sourceId ?? deps.nextId(),
          revision: existing ? existing.current.revision + 1 : 1,
          rootPath: resolved.root,
          displayName: resolved.displayName,
          profileId: input.profileId,
          tableNameMapping: input.tableNameMapping,
          createdAt: now,
        };
        if (!existing) repository.insert(project.id, revision);
        else if (
          expected === null ||
          !repository.advance(project.id, expected, revision)
        )
          throw new AppError('SOURCE_REVISION_CONFLICT');
        return {
          source: toLocalSource(
            { registeredAt: existing?.registeredAt ?? now, updatedAt: now },
            revision,
            'ready',
            now,
          ),
        };
      });
    },

    // What a new run locks: the fixture for a demo project, else the current
    // revision. Called inside the run admission transaction.
    runSource(project: Project): ProjectRunSource {
      if (project.mode === PROJECT_DEMO_MODE)
        return {
          source: {
            kind: 'fixture',
            fixtureId: project.fixtureId,
            revision: FIXTURE_SOURCE_REVISION,
          },
          revision: FIXTURE_SOURCE_REVISION,
          profileId: FIXTURE_SOURCE.profileId,
          tableNameMapping: FIXTURE_SOURCE.tableNameMapping,
        };
      const registration = repository.findCurrent(project.id);
      if (!registration) throw new AppError('SOURCE_NOT_REGISTERED');
      const { current } = registration;
      return {
        source: {
          kind: 'local',
          sourceId: current.sourceId,
          revision: current.revision,
        },
        revision: current.revision,
        profileId: current.profileId,
        tableNameMapping: current.tableNameMapping,
      };
    },

    // The revision a run locked; the snapshot provider reads its root.
    lockedRevision(sourceId: string, revision: number) {
      return repository.findRevision(sourceId, revision);
    },
  };
}

export type SourceRegistrationService = ReturnType<
  typeof createSourceRegistrationService
>;
