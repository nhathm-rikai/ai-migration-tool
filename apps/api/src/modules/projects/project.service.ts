import {
  CreateProjectSchema,
  ListProjectsQuerySchema,
  PROJECT_PAGE_SIZE_DEFAULT,
  PROJECT_DEMO_MODE,
  PROJECT_LOCAL_MODE,
  type CreateProjectInput,
  type ListProjectsQuery,
  type Project,
  type ProjectList,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { AppError } from '../../shared/app-error.js';
import type { ProjectRepository } from './project.repository.js';

export function createProjectService(deps: {
  repository: ProjectRepository;
  nextId(): string;
  now(): Date;
}) {
  return {
    create(input: CreateProjectInput): Project {
      const name = input.name.trim();
      if (!Check(CreateProjectSchema, { ...input, name }))
        throw new AppError('INVALID_INPUT');
      const common = {
        id: deps.nextId(),
        name,
        createdAt: deps.now().toISOString(),
      };
      return deps.repository.create(
        'fixtureId' in input
          ? { ...common, fixtureId: input.fixtureId, mode: PROJECT_DEMO_MODE }
          : { ...common, mode: PROJECT_LOCAL_MODE },
      );
    },
    get(id: string): Project {
      const project = deps.repository.findById(id);
      if (!project) throw new AppError('PROJECT_NOT_FOUND');
      return project;
    },
    list(query: ListProjectsQuery): ProjectList {
      if (!Check(ListProjectsQuerySchema, query))
        throw new AppError('INVALID_INPUT');
      const limit = Number(query.limit ?? PROJECT_PAGE_SIZE_DEFAULT);
      const rows = deps.repository.listAfter(query.cursor, limit + 1);
      const items = rows.slice(0, limit);
      return {
        items,
        nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null,
      };
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
