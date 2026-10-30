import { Check } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import {
  SPEC_DOCUMENT_IDS,
  StartDocumentRunSchema,
} from './documents.schema.js';

describe('StartDocumentRunSchema', () => {
  const start = {
    analysisRunId: '1f21454e-a4c9-465b-b281-d1229b57fc83',
    programs: ['src/ORDER.VBP'],
    model: 'default',
    outputLanguage: 'vi',
  };

  it('accepts every document of the pack in one run', () => {
    expect(
      Check(StartDocumentRunSchema, {
        ...start,
        documents: [...SPEC_DOCUMENT_IDS],
      }),
    ).toBe(true);
  });

  it('refuses a repeated document', () => {
    expect(
      Check(StartDocumentRunSchema, {
        ...start,
        documents: ['security-audit', 'security-audit'],
      }),
    ).toBe(false);
  });
});
