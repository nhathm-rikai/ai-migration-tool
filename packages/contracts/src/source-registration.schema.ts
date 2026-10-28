import { Type, type Static } from 'typebox';
import { PROJECT_FIXTURE_ID } from './project-policy.js';
import { Nullable, Strict, TimestampSchema } from './schema-helpers.js';

// Source registration contract (C01). Spec: docs/engineering/specs/
// analyze-run-contract.md §2. The absolute root is request-only: responses,
// logs and URLs carry the opaque sourceId and a display name.

export const SOURCE_ROOT_PATH_MAX_LENGTH = 4096;
export const SOURCE_DISPLAY_NAME_MAX_LENGTH = 255;
// Profiles compiled into the analyzer. Adding one is an additive change.
export const SOURCE_PROFILE_IDS = ['vb6-cp932-v1'] as const;
export type SourceProfileId = (typeof SOURCE_PROFILE_IDS)[number];
// The bundled demo source never changes, so its revision is fixed.
export const FIXTURE_SOURCE_REVISION = 1;

export const SourceIdSchema = Type.String({ format: 'uuid' });
export const SourceRevisionSchema = Type.Integer({ minimum: 1 });
// Any well-formed ID is accepted here; the service answers
// SOURCE_PROFILE_UNSUPPORTED for IDs not in SOURCE_PROFILE_IDS.
export const SourceProfileIdSchema = Type.String({
  pattern: '^[a-z0-9][a-z0-9-]{0,63}$',
});

// Unquoted database identifier used as the default schema of the mapping.
const DatabaseSchemaNameSchema = Type.String({
  pattern: '^[A-Za-z_][A-Za-z0-9_$#]{0,127}$',
});

// `table-name-v1` mapping config (source-inventory spec §4.1). A schema is
// required exactly when the mapping is configured.
export const TableNameMappingSchema = Type.Union([
  Type.Object(
    { defaultSchema: Type.Null(), status: Type.Literal('unconfigured') },
    Strict,
  ),
  Type.Object(
    {
      defaultSchema: DatabaseSchemaNameSchema,
      status: Type.Union([Type.Literal('assumed'), Type.Literal('confirmed')]),
    },
    Strict,
  ),
]);

export const PutProjectSourceSchema = Type.Object(
  {
    rootPath: Type.String({
      minLength: 1,
      maxLength: SOURCE_ROOT_PATH_MAX_LENGTH,
      pattern: '\\S',
    }),
    profileId: SourceProfileIdSchema,
    tableNameMapping: TableNameMappingSchema,
    // null = register for the first time; a number = update that revision.
    expectedSourceRevision: Nullable(SourceRevisionSchema),
  },
  Strict,
);

// Last path segment only, never a path.
const SourceDisplayNameSchema = Type.String({
  minLength: 1,
  maxLength: SOURCE_DISPLAY_NAME_MAX_LENGTH,
  pattern: '^[^/\\\\]+$',
});

export const FixtureProjectSourceSchema = Type.Object(
  {
    kind: Type.Literal('fixture'),
    fixtureId: Type.Literal(PROJECT_FIXTURE_ID),
    displayName: SourceDisplayNameSchema,
    profileId: SourceProfileIdSchema,
    revision: Type.Literal(FIXTURE_SOURCE_REVISION),
    tableNameMapping: TableNameMappingSchema,
    status: Type.Literal('ready'),
  },
  Strict,
);

export const LocalProjectSourceSchema = Type.Object(
  {
    kind: Type.Literal('local'),
    sourceId: SourceIdSchema,
    displayName: SourceDisplayNameSchema,
    profileId: SourceProfileIdSchema,
    revision: SourceRevisionSchema,
    tableNameMapping: TableNameMappingSchema,
    // Result of the last cheap root check (no source walk).
    status: Type.Union([Type.Literal('ready'), Type.Literal('unreadable')]),
    registeredAt: TimestampSchema,
    updatedAt: TimestampSchema,
    checkedAt: TimestampSchema,
  },
  Strict,
);

export const ProjectSourceSchema = Type.Union([
  FixtureProjectSourceSchema,
  LocalProjectSourceSchema,
]);

// GET answers `{ source: null }` for a project without a registered source.
export const ProjectSourceResponseSchema = Type.Object(
  { source: Nullable(ProjectSourceSchema) },
  Strict,
);

export type TableNameMapping = Static<typeof TableNameMappingSchema>;
export type PutProjectSourceInput = Static<typeof PutProjectSourceSchema>;
export type ProjectSource = Static<typeof ProjectSourceSchema>;
export type ProjectSourceResponse = Static<typeof ProjectSourceResponseSchema>;
