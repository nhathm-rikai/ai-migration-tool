const SAFE_REASONS = new Set([
  'INVALID_CONFIG',
  'DATA_DIR_INVALID',
  'DATA_DIR_FORBIDDEN',
  'DATA_DIR_LOCKED',
  'SNAPSHOT_STORAGE_INVALID',
  'INSTANCE_LOCK_INVALID',
  'UNSUPPORTED_PLATFORM',
  'MIGRATION_MODIFIED',
  'MIGRATION_FOREIGN_KEY_VIOLATION',
  'SCHEMA_TOO_NEW',
  'EADDRINUSE',
  'EACCES',
  'EPERM',
  'ENOSPC',
  'ENOENT',
  'ENOTDIR',
  'ELOOP',
  'SQLITE_BUSY',
  'SQLITE_LOCKED',
  'SQLITE_CANTOPEN',
  'SQLITE_READONLY',
  'SQLITE_FULL',
  'SQLITE_CORRUPT',
  'SQLITE_NOTADB',
  'SQLITE_IOERR',
]);

export function getErrorReason(error: unknown): string {
  if (!(error instanceof Error)) return 'UNEXPECTED_ERROR';
  // Read only a data property: arbitrary names, messages, codes and getters are not trusted.
  const code: unknown = Object.getOwnPropertyDescriptor(error, 'code')?.value;
  return typeof code === 'string' && SAFE_REASONS.has(code)
    ? code
    : 'UNEXPECTED_ERROR';
}

export function createStartupDiagnostic(error: unknown) {
  return {
    code: 'STARTUP_FAILED',
    reason: getErrorReason(error),
    message:
      'Check portal configuration, data directory permissions, migrations and port availability.',
  };
}
