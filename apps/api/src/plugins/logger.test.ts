import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { expect, it } from 'vitest';
import { createLoggerOptions } from './logger.js';
import { registerErrorHandler } from './error-handler.js';

it('logs a route pattern and bounded reason without request data or raw errors', async () => {
  let output = '';
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });
  const app = Fastify({ logger: { ...createLoggerOptions('info'), stream } });
  registerErrorHandler(app);
  app.get('/items/:id', () => {
    throw Object.assign(new Error('C:/private/source secret-message'), {
      code: 'SQLITE_BUSY',
      name: 'secret-name',
    });
  });
  try {
    const response = await app.inject({
      url: '/items/private-id?token=secret-query',
      headers: { authorization: 'secret-header', cookie: 'secret-cookie' },
    });
    expect(response.statusCode).toBe(500);
    expect(output).toContain('"route":"/items/:id"');
    expect(output).toContain('"reason":"SQLITE_BUSY"');
    expect(output).toContain('"requestId":');
    expect(output).not.toMatch(/private-id|secret-|C:\/private/);
    expect(response.body).not.toContain('SQLITE_BUSY');
  } finally {
    await app.close();
  }
});
