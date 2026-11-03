import { Type, type Static } from 'typebox';
import { RunIdSchema } from './run.schema.js';
import { PackageFileNameSchema, ProgramKeySchema } from './documents.schema.js';

// Review of generated documents (step 4). Every action is an append-only
// event tied to run + program + file + hash (DATA-07); statuses are derived
// from the events and the reviewer is set by the backend.

const Strict = { additionalProperties: false } as const;
const Sha256 = Type.String({ pattern: '^[a-f0-9]{64}$' });
const Text = Type.String({ minLength: 1, maxLength: 2000 });

export const ReviewCommentSchema = Type.Object(
  { reviewer: Type.String(), at: Type.String(), text: Type.String() },
  Strict,
);

export const ReviewDocumentSchema = Type.Object(
  {
    name: PackageFileNameSchema,
    sha256: Sha256,
    status: Type.Union([Type.Literal('pending'), Type.Literal('approved')]),
    comments: Type.Array(ReviewCommentSchema),
  },
  Strict,
);
export type ReviewDocument = Static<typeof ReviewDocumentSchema>;

// The latest published package of one program.
export const ReviewProgramSchema = Type.Object(
  {
    program: ProgramKeySchema,
    name: Type.String(),
    runId: RunIdSchema,
    item: Type.Integer({ minimum: 0 }),
    specPack: Type.String(),
    documents: Type.Array(ReviewDocumentSchema),
  },
  Strict,
);
export type ReviewProgram = Static<typeof ReviewProgramSchema>;

export const ReviewBoardSchema = Type.Object(
  { programs: Type.Array(ReviewProgramSchema) },
  Strict,
);
export type ReviewBoard = Static<typeof ReviewBoardSchema>;

const Target = {
  runId: RunIdSchema,
  item: Type.Integer({ minimum: 0 }),
  file: PackageFileNameSchema,
  sha256: Sha256,
};

export const AddReviewEventSchema = Type.Union([
  Type.Object({ ...Target, kind: Type.Literal('comment'), text: Text }, Strict),
  Type.Object({ ...Target, kind: Type.Literal('approve') }, Strict),
]);
export type AddReviewEvent = Static<typeof AddReviewEventSchema>;
