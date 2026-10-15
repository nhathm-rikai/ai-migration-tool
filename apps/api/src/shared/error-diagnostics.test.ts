import { describe, expect, it } from 'vitest';
import {
  getErrorReason,
  createStartupDiagnostic,
} from './error-diagnostics.js';
import { RuntimeError } from './runtime-error.js';

describe('bounded diagnostics', () => {
  it.each(['EADDRINUSE', 'EACCES', 'SQLITE_CANTOPEN', 'SQLITE_BUSY'])(
    'keeps known reason %s without raw message/name',
    (code) => {
      const error = Object.assign(new Error('private path and secret'), {
        code,
        name: 'private-name',
      });
      expect(getErrorReason(error)).toBe(code);
      expect(JSON.stringify(createStartupDiagnostic(error))).not.toMatch(
        /private|secret/,
      );
    },
  );
  it('does not forward arbitrary code, stack, name or code getters', () => {
    expect(
      getErrorReason(
        Object.assign(new Error('secret'), {
          code: 'C:/private/secret',
          name: 'secret',
        }),
      ),
    ).toBe('UNEXPECTED_ERROR');
    const withGetter = new Error('secret');
    Object.defineProperty(withGetter, 'code', {
      get() {
        throw new Error('Must not invoke arbitrary getter');
      },
    });
    expect(getErrorReason(withGetter)).toBe('UNEXPECTED_ERROR');
    expect(getErrorReason({ code: 'SQLITE_BUSY' })).toBe('UNEXPECTED_ERROR');
  });
  it.each(['MIGRATION_MODIFIED', 'SCHEMA_TOO_NEW'] as const)(
    'identifies migration reason %s',
    (code) => {
      expect(createStartupDiagnostic(new RuntimeError(code))).toMatchObject({
        code: 'STARTUP_FAILED',
        reason: code,
      });
    },
  );
});
