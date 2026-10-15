import { Type, type Static } from 'typebox';
import {
  PROJECT_NAME_MIN_LENGTH,
  PROJECT_NAME_MAX_LENGTH,
  PROJECT_PAGE_SIZE_DEFAULT,
  PROJECT_FIXTURE_ID,
  PROJECT_DEMO_MODE,
} from './project-policy.js';

const ProjectNameSchema = Type.String({
  minLength: PROJECT_NAME_MIN_LENGTH,
  maxLength: PROJECT_NAME_MAX_LENGTH,
  pattern: '\\S',
});
export const ProjectIdSchema = Type.String({ format: 'uuid' });
// Init only: an explicit demo marker, not a filesystem path or an analysis result.
export const FixtureIdSchema = Type.Literal(PROJECT_FIXTURE_ID);
export const CreateProjectSchema = Type.Object(
  { name: ProjectNameSchema, fixtureId: FixtureIdSchema },
  { additionalProperties: false },
);
export const ProjectSchema = Type.Object(
  {
    id: ProjectIdSchema,
    name: ProjectNameSchema,
    fixtureId: FixtureIdSchema,
    mode: Type.Literal(PROJECT_DEMO_MODE),
    createdAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);
export const ProjectParamsSchema = Type.Object(
  { projectId: ProjectIdSchema },
  { additionalProperties: false },
);
// UUID keyset cursor is opaque to callers; ordering is by ID, not creation time.
export const ListProjectsQuerySchema = Type.Object(
  {
    limit: Type.Optional(
      Type.String({
        pattern: '^(?:[1-9]|[1-9][0-9]|100)$',
        default: String(PROJECT_PAGE_SIZE_DEFAULT),
      }),
    ),
    cursor: Type.Optional(ProjectIdSchema),
  },
  { additionalProperties: false },
);
export const ProjectListSchema = Type.Object(
  {
    items: Type.Array(ProjectSchema),
    nextCursor: Type.Union([ProjectIdSchema, Type.Null()]),
  },
  { additionalProperties: false },
);
export type CreateProjectInput = Static<typeof CreateProjectSchema>;
export type Project = Static<typeof ProjectSchema>;
export type ListProjectsQuery = Static<typeof ListProjectsQuerySchema>;
export type ProjectList = Static<typeof ProjectListSchema>;
