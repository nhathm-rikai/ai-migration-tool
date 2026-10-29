import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
// Every test starts at the root address; the app shell routes by URL.
beforeEach(() => {
  window.history.replaceState(null, '', '/');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
