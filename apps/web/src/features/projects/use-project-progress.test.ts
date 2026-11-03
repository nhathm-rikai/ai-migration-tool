import { describe, expect, it } from 'vitest';
import { isReviewDone } from './use-project-progress';

const marks = [
  { program: 'latest', approved: false },
  { program: 'older', approved: true },
];

describe('isReviewDone', () => {
  it('follows the selected program', () => {
    expect(isReviewDone(marks, 'older')).toBe(true);
    expect(isReviewDone(marks, 'latest')).toBe(false);
  });

  it('falls back to the latest program, and is not done without one', () => {
    expect(isReviewDone(marks, null)).toBe(false);
    expect(isReviewDone([...marks].reverse(), null)).toBe(true);
    expect(isReviewDone(marks, 'unknown')).toBe(false);
    expect(isReviewDone([], null)).toBe(false);
  });
});
