import Fastify from 'fastify';
import { ApiErrorCodeSchema, type ErrorResponse } from '@portal/contracts';
import { Check } from 'typebox/value';
import { expect, it } from 'vitest';
import { registerErrorHandler } from './error-handler.js';
import { AppError, type AppErrorCode } from '../shared/app-error.js';

it.each([
  ['PROJECT_NOT_FOUND', 404],
  ['INVALID_INPUT', 400],
  ['ROUTE_NOT_FOUND', 404],
] satisfies [AppErrorCode, number][])(
  'preserves explicit public error %s',
  async (code, status) => {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    app.get('/explicit', () => {
      throw new AppError(code);
    });
    try {
      const response = await app.inject('/explicit');
      const body = response.json<ErrorResponse>();
      expect(response.statusCode).toBe(status);
      expect(body.error.code).toBe(code);
      expect(Check(ApiErrorCodeSchema, body.error.code)).toBe(true);
      expect(body.error.requestId).toBeTruthy();
    } finally {
      await app.close();
    }
  },
);

it('does not relabel an unknown dependency error as invalid user input just because it has a 4xx status', async () => {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  app.get('/dependency', () => {
    throw Object.assign(new Error('private path secret'), { statusCode: 409 });
  });
  try {
    const response = await app.inject('/dependency');
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: { code: 'INTERNAL_ERROR' },
    });
    expect(response.body).not.toMatch(/private|secret/);
  } finally {
    await app.close();
  }
});

it('hides internal error paths, credentials and stack traces', async () => {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  app.get('/failure', () => {
    throw new Error('Cannot open C:/private/source token=secret');
  });
  try {
    const response = await app.inject('/failure');
    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
    });
    expect(
      response.json<ErrorResponse>().error.requestId.length,
    ).toBeGreaterThan(0);
    expect(response.body).not.toMatch(/private|secret|stack/);
  } finally {
    await app.close();
  }
});
