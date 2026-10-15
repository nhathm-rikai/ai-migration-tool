const RUNTIME_ERRORS = {
  INVALID_CONFIG: 'Invalid portal configuration.',
  DATA_DIR_INVALID: 'Data directory must be an absolute, resolvable directory.',
  DATA_DIR_FORBIDDEN:
    'Data directory must be outside the application repository and its source directories.',
  UNSUPPORTED_PLATFORM:
    'This platform is not a supported configuration target.',
  MIGRATION_MODIFIED: 'An applied migration was modified.',
  SCHEMA_TOO_NEW: 'Database schema is newer than this application.',
} as const;

export type RuntimeErrorCode = keyof typeof RUNTIME_ERRORS;

export class RuntimeError extends Error {
  constructor(readonly code: RuntimeErrorCode) {
    super(RUNTIME_ERRORS[code]);
    this.name = 'RuntimeError';
  }
}
