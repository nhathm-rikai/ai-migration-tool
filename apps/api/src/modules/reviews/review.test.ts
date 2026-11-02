import type { DocumentRun } from '@portal/contracts';
import { describe, expect, it } from 'vitest';
import type { AppError } from '../../shared/app-error.js';
import { createDocumentReviewService } from './document-review.service.js';
import type { ReviewEvent } from './review-event.repository.js';

const SHA = 'a'.repeat(64);

describe('document review', () => {
  const run = {
    id: 'run-1',
    config: { specPack: 'pack' },
    items: [
      {
        program: 'p.vbp',
        name: 'P',
        status: 'succeeded',
        files: [{ name: 'business-rules.md', sha256: SHA }],
      },
    ],
  } as unknown as DocumentRun;

  function service() {
    const events: ReviewEvent[] = [];
    let id = 0;
    return {
      events,
      reviews: createDocumentReviewService({
        events: {
          append: (event) => void events.push(event),
          list: () => events,
        },
        listEndedRuns: () => [run],
        checkProject: () => {},
        reviewer: 'tester',
        nextId: () => String(++id),
        now: () => new Date('2026-11-02T00:00:00Z'),
      }),
    };
  }
  const target = {
    runId: 'run-1',
    item: 0,
    file: 'business-rules.md',
    sha256: SHA,
  };

  it('approves once: repeating it adds no event', () => {
    const { reviews, events } = service();
    reviews.add('p', { ...target, kind: 'approve' });
    const after = reviews.add('p', { ...target, kind: 'approve' });
    expect(after.programs[0]?.documents[0]?.status).toBe('approved');
    expect(events).toHaveLength(1);
  });

  it('refuses a stale version', () => {
    const { reviews } = service();
    let code: unknown;
    try {
      reviews.add('p', {
        ...target,
        sha256: 'b'.repeat(64),
        kind: 'comment',
        text: 'x',
      });
    } catch (error) {
      code = (error as AppError).code;
    }
    expect(code).toBe('REVIEW_STALE');
  });

  it('records comments with the backend reviewer', () => {
    const after = service().reviews.add('p', {
      ...target,
      kind: 'comment',
      text: 'Nhận xét',
    });
    expect(after.programs[0]?.documents[0]?.comments).toEqual([
      {
        reviewer: 'tester',
        at: '2026-11-02T00:00:00.000Z',
        text: 'Nhận xét',
      },
    ]);
  });
});
