import type {
  AddReviewEvent,
  DocumentRun,
  ReviewBoard,
  ReviewDocument,
  ReviewProgram,
} from '@portal/contracts';
import { AppError } from '../../shared/app-error.js';
import type {
  ReviewEvent,
  ReviewEventRepository,
} from './review-event.repository.js';

// Step 4: the latest published package of each program, and its review
// events. A new run of a program gives new documents, so an approval never
// carries over to a different version (DATA-07).
export function createDocumentReviewService(deps: {
  events: ReviewEventRepository;
  listEndedRuns(projectId: string): DocumentRun[];
  checkProject(projectId: string): void;
  reviewer: string;
  nextId(): string;
  now(): Date;
}) {
  // Newest first: the first published package seen of a program is its latest.
  function latestPackages(projectId: string) {
    const seen = new Map<
      string,
      { run: DocumentRun; item: DocumentRun['items'][number]; index: number }
    >();
    for (const run of deps.listEndedRuns(projectId))
      run.items.forEach((item, index) => {
        if (item.status === 'succeeded' && !seen.has(item.program))
          seen.set(item.program, { run, item, index });
      });
    return [...seen.values()];
  }

  function document(
    runId: string,
    index: number,
    file: { name: string; sha256: string },
    events: ReviewEvent[],
  ): ReviewDocument {
    const mine = events.filter(
      (event) =>
        event.runId === runId &&
        event.item === index &&
        event.file === file.name &&
        event.sha256 === file.sha256,
    );
    return {
      name: file.name,
      sha256: file.sha256,
      status: mine.some((event) => event.kind === 'approve')
        ? 'approved'
        : 'pending',
      comments: mine
        .filter((event) => event.kind === 'comment')
        .map((event) => ({
          reviewer: event.reviewer,
          at: event.at,
          text: event.text ?? '',
        })),
    };
  }

  function board(projectId: string): ReviewBoard {
    deps.checkProject(projectId);
    const events = deps.events.list(projectId);
    const programs: ReviewProgram[] = latestPackages(projectId).map(
      ({ run, item, index }) => ({
        program: item.program,
        name: item.name,
        runId: run.id,
        item: index,
        specPack: run.config.specPack,
        documents: item.files.map((file) =>
          document(run.id, index, file, events),
        ),
      }),
    );
    return { programs };
  }

  return {
    board,
    add(projectId: string, input: AddReviewEvent): ReviewBoard {
      const current = board(projectId);
      const program = current.programs.find(
        (entry) => entry.runId === input.runId && entry.item === input.item,
      );
      const target = program?.documents.find(
        (entry) => entry.name === input.file,
      );
      // Not the latest package, or another version of the file (409).
      if (!target || target.sha256 !== input.sha256)
        throw new AppError('REVIEW_STALE');
      if (input.kind === 'approve' && target.status === 'approved')
        return current;
      deps.events.append({
        id: deps.nextId(),
        projectId,
        runId: input.runId,
        item: input.item,
        file: input.file,
        sha256: input.sha256,
        kind: input.kind,
        text: input.kind === 'approve' ? null : input.text,
        reviewer: deps.reviewer,
        at: deps.now().toISOString(),
      });
      return board(projectId);
    },
  };
}

export type DocumentReviewService = ReturnType<
  typeof createDocumentReviewService
>;
