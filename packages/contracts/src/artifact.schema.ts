import { Type, type Static } from 'typebox';
import { ProjectIdSchema } from './project.schema.js';
import { RunIdSchema, SnapshotIdSchema } from './run.schema.js';
import { Strict, TimestampSchema } from './schema-helpers.js';
import {
  SOURCE_INVENTORY_SCHEMA_VERSION,
  SourceInventorySchema,
} from './source-inventory.schema.js';

// Artifact read contract (C01). Spec: docs/engineering/specs/
// analyze-run-contract.md §6. Only published (complete) versions are listed;
// clients address an exact version, never "latest".

export const ArtifactIdSchema = Type.String({ format: 'uuid' });
export const ArtifactVersionSchema = Type.Integer({ minimum: 1 });
export const ArtifactKindSchema = Type.Literal('source-inventory');
// demo = bundled fixture source; local = a registered source root.
export const ArtifactModeSchema = Type.Union([
  Type.Literal('demo'),
  Type.Literal('local'),
]);

const Sha256 = Type.String({ pattern: '^[0-9a-f]{64}$' });

const ArtifactRefFields = {
  id: ArtifactIdSchema,
  version: ArtifactVersionSchema,
  kind: ArtifactKindSchema,
  schemaVersion: Type.Literal(SOURCE_INVENTORY_SCHEMA_VERSION),
  projectId: ProjectIdSchema,
  runId: RunIdSchema,
  sourceSnapshotId: SnapshotIdSchema,
  // Hash of the source snapshot the payload was derived from.
  sourceSnapshotHash: Sha256,
  mode: ArtifactModeSchema,
  // Hash and size of the stored payload bytes.
  sha256: Sha256,
  byteLength: Type.Integer({ minimum: 0 }),
  createdAt: TimestampSchema,
};

export const ArtifactRefSchema = Type.Object(ArtifactRefFields, Strict);

export const ArtifactListSchema = Type.Object(
  { items: Type.Array(ArtifactRefSchema) },
  Strict,
);

// Static inventory carries no AI prompt/model version.
export const SourceInventoryArtifactSchema = Type.Object(
  { ...ArtifactRefFields, payload: SourceInventorySchema },
  Strict,
);
// Union point for the kinds C02 adds (understanding, ...).
export const ArtifactEnvelopeSchema = SourceInventoryArtifactSchema;

export const ArtifactVersionParamsSchema = Type.Object(
  {
    projectId: ProjectIdSchema,
    artifactId: ArtifactIdSchema,
    // Path segment; coercion is off at the API.
    version: Type.String({ pattern: '^[1-9][0-9]{0,8}$' }),
  },
  Strict,
);

export type ArtifactRef = Static<typeof ArtifactRefSchema>;
export type ArtifactList = Static<typeof ArtifactListSchema>;
export type SourceInventoryArtifact = Static<
  typeof SourceInventoryArtifactSchema
>;
export type ArtifactEnvelope = Static<typeof ArtifactEnvelopeSchema>;
