import { Type, type Static } from 'typebox';
import { ArtifactIdSchema, ArtifactVersionSchema } from './artifact.schema.js';
import { ProjectIdSchema } from './project.schema.js';
import { RunIdSchema, RunStatusSchema } from './run.schema.js';
import { Nullable, Strict, TimestampSchema } from './schema-helpers.js';

// Document runs of step 3, following docs/specification-design: the TL picks
// programs of the published inventory and the documents to write; the agent
// writes one package per program (selected documents + companions of
// SD-CT-07). Runs are separate from analyze runs;
// the same admission rules apply (JOB-01..06).

// Documents the TL can pick (SD-CT-04).
export const SPEC_DOCUMENT_IDS = [
  'business-rules',
  'basic-design',
  'detail-design',
  'db-design',
  'security-audit',
] as const;
export const SpecDocumentIdSchema = Type.Union([
  Type.Literal('business-rules'),
  Type.Literal('basic-design'),
  Type.Literal('detail-design'),
  Type.Literal('db-design'),
  Type.Literal('security-audit'),
]);
export type SpecDocumentId = Static<typeof SpecDocumentIdSchema>;

// SD-CT-07: documents a choice pulls in, and the generation order.
export const SPEC_DOCUMENT_COMPANIONS: Record<
  SpecDocumentId,
  readonly SpecDocumentId[]
> = {
  'business-rules': [],
  'db-design': [],
  'security-audit': [],
  'basic-design': ['business-rules'],
  'detail-design': ['business-rules', 'basic-design', 'db-design'],
};
export const SPEC_GENERATION_ORDER: readonly SpecDocumentId[] = [
  'business-rules',
  'db-design',
  'basic-design',
  'detail-design',
  'security-audit',
];
// Selected + companions, in generation order.
export function documentsToGenerate(
  selected: readonly SpecDocumentId[],
): SpecDocumentId[] {
  const all = new Set<SpecDocumentId>();
  for (const id of selected) {
    all.add(id);
    for (const companion of SPEC_DOCUMENT_COMPANIONS[id]) all.add(companion);
  }
  return SPEC_GENERATION_ORDER.filter((id) => all.has(id));
}

// File names of a package: one Markdown per generated document (pack 0.9.0
// has no coverage/open-questions files; each document carries its own
// generation state, read scope and open questions).
export function packageFileNames(
  generated: readonly SpecDocumentId[],
): string[] {
  return generated.map((id) => `${id}.md`);
}

// 'default' = the model configured in the agent CLI itself.
export const AGENT_MODELS = ['opus', 'sonnet', 'haiku', 'default'] as const;
export const AgentModelSchema = Type.Union([
  Type.Literal('opus'),
  Type.Literal('sonnet'),
  Type.Literal('haiku'),
  Type.Literal('default'),
]);

// Reasoning effort of the agent session. Not chosen in the UI: every run
// uses DEFAULT_AGENT_EFFORT, recorded in its config (AI-05).
export const AgentEffortSchema = Type.Union([
  Type.Literal('low'),
  Type.Literal('medium'),
  Type.Literal('high'),
  Type.Literal('xhigh'),
  Type.Literal('max'),
]);
export type AgentEffort = Static<typeof AgentEffortSchema>;
export const DEFAULT_AGENT_EFFORT: AgentEffort = 'medium';

export const DOCUMENT_LANGUAGES = ['vi', 'ja', 'en'] as const;
export const DocumentLanguageSchema = Type.Union([
  Type.Literal('vi'),
  Type.Literal('ja'),
  Type.Literal('en'),
]);

// fake = bundled runner without network (demo/tests); claude-cli = Claude
// Code limited to read tools (production); codex-cli = Codex CLI in its
// read-only sandbox (development/tests).
export const DocumentRunnerSchema = Type.Union([
  Type.Literal('fake'),
  Type.Literal('claude-cli'),
  Type.Literal('codex-cli'),
]);

// Models a run may ask for with each runner. Codex model names depend on the
// account, so only its configured default is offered.
export const RUNNER_MODELS = {
  fake: ['opus', 'sonnet', 'haiku', 'default'],
  'claude-cli': ['opus', 'sonnet', 'haiku', 'default'],
  'codex-cli': ['default'],
} as const satisfies Record<
  'fake' | 'claude-cli' | 'codex-cli',
  readonly (typeof AGENT_MODELS)[number][]
>;

// Why a document run ended `failed`.
export const DocumentRunErrorCodeSchema = Type.Union([
  Type.Literal('AGENT_UNAVAILABLE'),
  Type.Literal('AGENT_AUTH_FAILED'),
  Type.Literal('AGENT_QUOTA_EXCEEDED'),
  Type.Literal('AGENT_FAILED'),
  Type.Literal('AGENT_OUTPUT_INVALID'),
  // A document of the package is not `hoàn tất` (SD-CT-08).
  Type.Literal('PACKAGE_INCOMPLETE'),
  Type.Literal('INPUT_UNAVAILABLE'),
  Type.Literal('ARTIFACT_WRITE_FAILED'),
  Type.Literal('TIMEOUT'),
  Type.Literal('STOP_UNCONFIRMED'),
  Type.Literal('INTERNAL_ERROR'),
]);

export const DocumentItemStatusSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('running'),
  Type.Literal('succeeded'),
  Type.Literal('failed'),
  Type.Literal('skipped'),
  // The run ended (cancelled, interrupted, timeout) while this was running.
  Type.Literal('stopped'),
]);

// Where the agent's answer is for one document of the package, seen live in
// its streamed output (FILE markers): not started, being written, complete.
// `written` is not `published`: the package is checked and stored at the end.
export const DocumentWriteStatusSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('writing'),
  Type.Literal('written'),
]);

const Count = Type.Integer({ minimum: 0 });
const Sha256 = Type.String({ pattern: '^[0-9a-f]{64}$' });
// A program of the inventory: its project path (unique in an inventory).
export const ProgramKeySchema = Type.String({ minLength: 1, maxLength: 1024 });
export const PackageFileNameSchema = Type.String({
  pattern: '^[a-z-]+\\.md$',
});
// Known steps done / known steps: counted, never estimated (FE-02).
export const StepCountSchema = Type.Object(
  { done: Type.Integer({ minimum: 0 }), total: Type.Integer({ minimum: 0 }) },
  Strict,
);
export const DocumentProgressSchema = Type.Object(
  {
    name: PackageFileNameSchema,
    status: DocumentWriteStatusSchema,
    // Template sections (headings + the "Trạng thái sinh" row) seen in the
    // streamed answer.
    sections: Type.Optional(StepCountSchema),
  },
  Strict,
);

export const PackageFileSchema = Type.Object(
  { name: PackageFileNameSchema, byteLength: Count, sha256: Sha256 },
  Strict,
);

// One program's package.
export const DocumentRunItemSchema = Type.Object(
  {
    program: ProgramKeySchema,
    // Display name from the inventory.
    name: Type.String(),
    status: DocumentItemStatusSchema,
    // Files of a succeeded package, in package order.
    files: Type.Array(PackageFileSchema),
    // Live progress of each document while the agent answers (absent on
    // runs started before it was tracked).
    documents: Type.Optional(Type.Array(DocumentProgressSchema)),
    // Files the task needs read (input, pack, P1, source) the agent has
    // opened so far.
    reading: Type.Optional(StepCountSchema),
    // Where the files are stored (one ID per package).
    packageId: Nullable(ArtifactIdSchema),
    errorCode: Nullable(DocumentRunErrorCodeSchema),
    outputTokens: Nullable(Count),
    startedAt: Nullable(TimestampSchema),
    finishedAt: Nullable(TimestampSchema),
  },
  Strict,
);

// One program per run in this phase: the TL picks it on the analysis
// screen. The array keeps the run shape open for batches later.
export const MAX_PROGRAMS_PER_RUN = 1;

// Locked at admission; enough to reproduce the run (AI-05).
export const DocumentRunConfigSchema = Type.Object(
  {
    programs: Type.Array(ProgramKeySchema, {
      minItems: 1,
      maxItems: MAX_PROGRAMS_PER_RUN,
      uniqueItems: true,
    }),
    selected: Type.Array(SpecDocumentIdSchema, {
      minItems: 1,
      maxItems: SPEC_DOCUMENT_IDS.length,
      uniqueItems: true,
    }),
    // selected + SD-CT-07 companions, in generation order.
    generated: Type.Array(SpecDocumentIdSchema, {
      minItems: 1,
      maxItems: SPEC_DOCUMENT_IDS.length,
    }),
    model: AgentModelSchema,
    // Absent on runs started before effort was passed (CLI default).
    effort: Type.Optional(AgentEffortSchema),
    outputLanguage: DocumentLanguageSchema,
    runner: DocumentRunnerSchema,
    // Rule/template pack versions read from the pack, and the task text.
    specPack: Type.String({ minLength: 1 }),
    promptVersion: Type.String({ minLength: 1 }),
    limits: Type.Object(
      {
        timeoutMs: Type.Integer({ minimum: 1 }),
        maxOutputBytes: Type.Integer({ minimum: 1 }),
      },
      Strict,
    ),
  },
  Strict,
);

export const DocumentRunSchema = Type.Object(
  {
    id: RunIdSchema,
    projectId: ProjectIdSchema,
    status: RunStatusSchema,
    stateVersion: Type.Integer({ minimum: 1 }),
    analysisRunId: RunIdSchema,
    inventory: Type.Object(
      { artifactId: ArtifactIdSchema, version: ArtifactVersionSchema },
      Strict,
    ),
    config: DocumentRunConfigSchema,
    items: Type.Array(DocumentRunItemSchema),
    inputTokens: Count,
    outputTokens: Count,
    errorCode: Nullable(DocumentRunErrorCodeSchema),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    startedAt: Nullable(TimestampSchema),
    finishedAt: Nullable(TimestampSchema),
  },
  Strict,
);

export const StartDocumentRunSchema = Type.Object(
  {
    analysisRunId: RunIdSchema,
    programs: DocumentRunConfigSchema.properties.programs,
    documents: DocumentRunConfigSchema.properties.selected,
    model: AgentModelSchema,
    outputLanguage: DocumentLanguageSchema,
  },
  Strict,
);

export const DocumentRunParamsSchema = Type.Object(
  { projectId: ProjectIdSchema, runId: RunIdSchema },
  Strict,
);

export const PackageFileParamsSchema = Type.Object(
  {
    projectId: ProjectIdSchema,
    runId: RunIdSchema,
    // Position of the program in the run (path segment).
    item: Type.String({ pattern: '^(0|[1-9][0-9]{0,2})$' }),
    file: PackageFileNameSchema,
  },
  Strict,
);

export const DocumentRuntimeStatusSchema = Type.Union([
  Type.Object(
    { status: Type.Literal('ready'), reasonCode: Type.Null() },
    Strict,
  ),
  Type.Object(
    {
      status: Type.Literal('recovery_required'),
      reasonCode: Type.Literal('PROCESS_CLEANUP_UNCONFIRMED'),
    },
    Strict,
  ),
]);

// The active run of the project, else its newest run, plus what a new run
// would use.
export const CurrentDocumentRunResponseSchema = Type.Object(
  {
    run: Nullable(DocumentRunSchema),
    runner: DocumentRunnerSchema,
    runtime: DocumentRuntimeStatusSchema,
    specPack: Type.String(),
  },
  Strict,
);

export const CancelDocumentRunSchema = Type.Object(
  { expectedStateVersion: Type.Integer({ minimum: 1 }) },
  Strict,
);

export const DocumentLogStreamSchema = Type.Union([
  Type.Literal('system'),
  Type.Literal('agent'),
  Type.Literal('stderr'),
]);

// Agent output shown in the log panel. Untrusted text: render escaped.
export const DocumentLogEntrySchema = Type.Object(
  {
    sequence: Type.Integer({ minimum: 1 }),
    at: TimestampSchema,
    stream: DocumentLogStreamSchema,
    // Program the line belongs to, when any.
    program: Nullable(Type.String()),
    text: Type.String({ maxLength: 2000 }),
  },
  Strict,
);

export const DOCUMENT_LOG_PAGE_SIZE = 200;
export const DocumentLogQuerySchema = Type.Object(
  {
    after: Type.Optional(Type.String({ pattern: '^(0|[1-9][0-9]{0,8})$' })),
  },
  Strict,
);
export const DocumentLogPageSchema = Type.Object(
  { items: Type.Array(DocumentLogEntrySchema), last: Count },
  Strict,
);

// One file of a package. Draft AI output: not reviewed, may be wrong.
export const PackageFileContentSchema = Type.Object(
  {
    runId: RunIdSchema,
    program: ProgramKeySchema,
    name: PackageFileNameSchema,
    sha256: Sha256,
    byteLength: Count,
    content: Type.String(),
  },
  Strict,
);

export type AgentModel = Static<typeof AgentModelSchema>;
export type DocumentLanguage = Static<typeof DocumentLanguageSchema>;
export type DocumentRunner = Static<typeof DocumentRunnerSchema>;
export type DocumentRunErrorCode = Static<typeof DocumentRunErrorCodeSchema>;
export type DocumentItemStatus = Static<typeof DocumentItemStatusSchema>;
export type PackageFile = Static<typeof PackageFileSchema>;
export type DocumentWriteStatus = Static<typeof DocumentWriteStatusSchema>;
export type DocumentProgress = Static<typeof DocumentProgressSchema>;
export type StepCount = Static<typeof StepCountSchema>;
export type DocumentRunItem = Static<typeof DocumentRunItemSchema>;
export type DocumentRunConfig = Static<typeof DocumentRunConfigSchema>;
export type DocumentRun = Static<typeof DocumentRunSchema>;
export type StartDocumentRunInput = Static<typeof StartDocumentRunSchema>;
export type DocumentRuntimeStatus = Static<typeof DocumentRuntimeStatusSchema>;
export type CurrentDocumentRunResponse = Static<
  typeof CurrentDocumentRunResponseSchema
>;
export type CancelDocumentRunInput = Static<typeof CancelDocumentRunSchema>;
export type DocumentLogStream = Static<typeof DocumentLogStreamSchema>;
export type DocumentLogEntry = Static<typeof DocumentLogEntrySchema>;
export type DocumentLogPage = Static<typeof DocumentLogPageSchema>;
export type PackageFileContent = Static<typeof PackageFileContentSchema>;
