import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FILE_FEED_SIZE, newPaths, useFileFeed } from './use-file-feed';

describe('file feed of the scan card (PF08)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('finds the paths a report adds after the last one shown', () => {
    expect(newPaths([], ['a', 'b'])).toEqual(['a', 'b']);
    expect(newPaths(['a', 'b'], ['a', 'b', 'c', 'd'])).toEqual(['c', 'd']);
    expect(newPaths(['a', 'b'], ['c', 'd'])).toEqual(['c', 'd']);
    expect(newPaths(['a', 'b'], ['a', 'b'])).toEqual([]);
  });

  it('shows a report line by line, keeps keys of shown lines and at most six', async () => {
    vi.useFakeTimers();
    let paths = ['a', 'b', 'c'];
    const { result, rerender } = renderHook(() => useFileFeed('run-1', paths));
    // The first line at once, the others within the next interval.
    expect(result.current.map((line) => line.path)).toEqual(['a']);
    await act(() => vi.advanceTimersByTimeAsync(70));
    expect(result.current.map((line) => line.path)).toEqual(['a', 'b']);
    await act(() => vi.advanceTimersByTimeAsync(200));
    expect(result.current.map((line) => line.path)).toEqual(['a', 'b', 'c']);
    const keyOfA = result.current[0]?.key;
    paths = ['b', 'c', 'd', 'e', 'f', 'g'];
    rerender();
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(result.current.map((line) => line.path)).toEqual([
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
    ]);
    expect(result.current).toHaveLength(FILE_FEED_SIZE);
    expect(result.current.some((line) => line.key === keyOfA)).toBe(false);
    // Lines that stay keep their key: only new lines animate in.
    const keys = result.current.map((line) => line.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('starts over for another run', async () => {
    vi.useFakeTimers();
    let runId = 'run-1';
    const { result, rerender } = renderHook(() =>
      useFileFeed(runId, runId === 'run-1' ? ['a'] : ['z']),
    );
    await act(() => vi.advanceTimersByTimeAsync(300));
    runId = 'run-2';
    rerender();
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(result.current.map((line) => line.path)).toEqual(['z']);
  });
});
