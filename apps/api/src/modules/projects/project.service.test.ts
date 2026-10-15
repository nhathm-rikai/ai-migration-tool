import { expect, it, vi } from 'vitest';
import { createProjectService } from './project.service.js';
import type { ProjectRepository } from './project.repository.js';
import { PROJECT_NAME_MAX_LENGTH, PROJECT_FIXTURE_ID } from '@portal/contracts';

it('applies the shared name policy to direct service calls before persistence, including Unicode', () => {
  const create = vi.fn<ProjectRepository['create']>((project) => project);
  const service = createProjectService({
    repository: { create, findById: () => undefined, listAfter: () => [] },
    nextId: () => 'id',
    now: () => new Date(0),
  });
  const name = '😀'.repeat(PROJECT_NAME_MAX_LENGTH);
  expect(service.create({ name, fixtureId: PROJECT_FIXTURE_ID }).name).toBe(
    name,
  );
  expect(() =>
    service.create({ name: name + 'x', fixtureId: PROJECT_FIXTURE_ID }),
  ).toThrow('Invalid request input.');
  expect(create).toHaveBeenCalledTimes(1);
});

it('rejects invalid page parameters from a direct service caller before persistence', () => {
  const listAfter = vi.fn<ProjectRepository['listAfter']>();
  const service = createProjectService({
    repository: {
      create: (project) => project,
      findById: () => undefined,
      listAfter,
    },
    nextId: () => 'id',
    now: () => new Date(0),
  });
  expect(() => service.list({ limit: '101' })).toThrow(
    'Invalid request input.',
  );
  expect(listAfter).not.toHaveBeenCalled();
});

it('does not report success if persistence fails', () => {
  const repository: ProjectRepository = {
    create: () => {
      throw new Error('Disk unavailable');
    },
    findById: () => undefined,
    listAfter: () => [],
  };
  const service = createProjectService({
    repository,
    nextId: () => 'id',
    now: () => new Date(0),
  });
  expect(() =>
    service.create({ name: 'Sample', fixtureId: 'sample-vb6' }),
  ).toThrow('Disk unavailable');
});

it('rejects a blank normalized name before touching persistence', () => {
  const create = vi.fn<ProjectRepository['create']>();
  const repository: ProjectRepository = {
    create,
    findById: () => undefined,
    listAfter: () => [],
  };
  const service = createProjectService({
    repository,
    nextId: () => 'id',
    now: () => new Date(0),
  });
  expect(() =>
    service.create({ name: '\t ', fixtureId: 'sample-vb6' }),
  ).toThrow('Invalid request input.');
  expect(create).not.toHaveBeenCalled();
});
