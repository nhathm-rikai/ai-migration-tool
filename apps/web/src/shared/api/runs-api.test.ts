import { expect, it, vi } from 'vitest';
import {
  FIXTURE_IDS,
  queuedRunFixture,
  startRunFixture,
} from '@portal/contracts/fixtures';
import { createRunsApi } from './runs-api';
import { ApiError } from './api-error';
import { json, testCredentials, testToken } from '../../testing/fixtures';

const signal = () => new AbortController().signal;
const key = 'intent-0123456789abcdef';

it('sends the idempotency key and the credential as headers, never in the URL', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(json(queuedRunFixture, 202));
  const run = await createRunsApi(fetcher, testCredentials).start(
    FIXTURE_IDS.project,
    key,
    startRunFixture,
    signal(),
  );
  expect(run).toEqual(queuedRunFixture);
  const [url, init] = fetcher.mock.calls[0] ?? [];
  expect(url).toBe(`/api/v1/projects/${FIXTURE_IDS.project}/runs`);
  const headers = new Headers(init?.headers);
  expect(headers.get('Idempotency-Key')).toBe(key);
  expect(headers.get('Authorization')).toBe(`Bearer ${testToken}`);
  expect(url).not.toContain(testToken);
  expect(init?.body).toBe(JSON.stringify(startRunFixture));
});

it('marks a Start without a valid answer as an unknown outcome and does not retry it', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(json({ ...queuedRunFixture, status: 'done' }, 202));
  const failure: unknown = await createRunsApi(fetcher, testCredentials)
    .start(FIXTURE_IDS.project, key, startRunFixture, signal())
    .catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(ApiError);
  expect(failure).toMatchObject({
    kind: 'invalid-response',
    outcomeUnknown: true,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
