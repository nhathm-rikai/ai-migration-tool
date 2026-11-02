import { useEffect, useRef, useState } from 'react';

// "File đang đọc" as a feed (PF08): the backend sends the latest paths at
// most 5 times a second; each report's new paths are shown one after the
// other within the next interval, so the list moves line by line like the
// demo instead of jumping. Only real reported paths are shown, never made
// up ones; every line keeps its key, so only the new line animates.

export const FILE_FEED_SIZE = 6;
// Spread of one report's new lines (the backend's progress interval).
const FEED_SPREAD_MS = 200;
const FEED_MIN_STEP_MS = 30;

export type FeedLine = { key: number; path: string };

// Paths of `next` after the last path of `previous` (both newest last).
export function newPaths(
  previous: readonly string[],
  next: readonly string[],
): string[] {
  const last = previous.at(-1);
  if (last === undefined) return [...next];
  const index = next.lastIndexOf(last);
  if (index < 0) return [...next];
  return next.slice(index + 1);
}

export function useFileFeed(
  // Changes reset the feed (another run).
  runId: string | null,
  paths: readonly string[],
): FeedLine[] {
  const [lines, setLines] = useState<FeedLine[]>([]);
  const received = useRef<{ runId: string | null; paths: readonly string[] }>({
    runId: null,
    paths: [],
  });
  const queue = useRef<string[]>([]);
  const counter = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const previous = received.current;
    const sameRun = previous.runId === runId;
    if (sameRun && previous.paths === paths) return;
    const fresh = sameRun ? newPaths(previous.paths, paths) : [...paths];
    received.current = { runId, paths };
    if (!sameRun) {
      queue.current = [];
      clearTimeout(timer.current);
      timer.current = undefined;
      setLines([]);
    }
    if (fresh.length === 0) return;
    // A backlog longer than the list is never shown: keep the latest.
    queue.current = [...queue.current, ...fresh].slice(-FILE_FEED_SIZE);
    const step = Math.max(
      FEED_MIN_STEP_MS,
      Math.floor(FEED_SPREAD_MS / queue.current.length),
    );
    const drain = () => {
      const path = queue.current.shift();
      if (path === undefined) {
        timer.current = undefined;
        return;
      }
      counter.current += 1;
      const line = { key: counter.current, path };
      setLines((shown) => [...shown, line].slice(-FILE_FEED_SIZE));
      timer.current = setTimeout(drain, step);
    };
    if (!timer.current) drain();
  }, [runId, paths]);

  useEffect(() => () => clearTimeout(timer.current), []);
  return lines;
}
