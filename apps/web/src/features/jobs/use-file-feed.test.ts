import { act, renderHook } from '@testing-library/react';
import { createElement, StrictMode, type PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FILE_FEED_SIZE, newPaths, useFileFeed } from './use-file-feed';

describe('file feed of the scan card (PF08)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('continues draining after StrictMode replays effects and receives later reports', async () => {
    vi.useFakeTimers();
    let paths = ['first.bas', 'second.bas', 'third.bas'];
    const view = renderHook(() => useFileFeed('run-1', paths), {
      wrapper: ({ children }: PropsWithChildren) =>
        createElement(StrictMode, null, children),
    });
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(view.result.current.map((line) => line.path)).toEqual(paths);
    paths = ['fourth.bas', 'fifth.bas', 'sixth.bas', 'seventh.bas'];
    view.rerender();
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(view.result.current.map((line) => line.path)).toEqual([
      'second.bas',
      'third.bas',
      ...paths,
    ]);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
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
    await act(() => vi.advanceTimersByTimeAsync(0));
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
