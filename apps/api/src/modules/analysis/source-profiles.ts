import type { LanguageAnalyzer } from './language-analyzer.js';
import type { ProfileEncoding } from './source-decoder.js';
import { vb6Analyzer } from './vb6/vb6.analyzer.js';

// A profile pins the analyzer and default encoding for one source corpus.
// Analyzers are compiled in and chosen by profile ID; nothing is loaded from
// the analyzed source or at runtime.
export type SourceProfile = {
  id: string;
  analyzer: LanguageAnalyzer;
  defaultEncoding: ProfileEncoding | null;
};

const SOURCE_PROFILES: readonly SourceProfile[] = [
  { id: 'vb6-cp932-v1', analyzer: vb6Analyzer, defaultEncoding: 'cp932' },
];

export function findSourceProfile(id: string): SourceProfile | undefined {
  return SOURCE_PROFILES.find((profile) => profile.id === id);
}
