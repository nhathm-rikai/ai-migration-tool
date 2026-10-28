import {
  SOURCE_INVENTORY_SCHEMA_VERSION,
  type AnalyzeRunConfig,
  type Run,
  type TableNameMapping,
} from '@portal/contracts';
import {
  CALL_GRAPH_VERSION,
  COMPLEXITY_VERSION,
} from '../analysis/program-analysis.js';
import { SOURCE_DECODER_VERSION } from '../analysis/source-decoder.js';
import { findSourceProfile } from '../analysis/source-profiles.js';
import { SOURCE_NORMALIZATION_VERSION } from '../analysis/source-text.js';
import { SQL_ACCESS_VERSION } from '../analysis/sql-access.js';
import { TABLE_NAME_VERSION } from '../analysis/table-names.js';

// What a run locks at admission: the source it reads (from the project's
// source registration) and the analyzer config of the running build.

export type RunLimits = AnalyzeRunConfig['limits'];

export type ProjectRunSource = {
  source: Run['source'];
  revision: number;
  profileId: string;
  tableNameMapping: TableNameMapping;
};

// undefined when the profile is not compiled into this build.
export function analyzeRunConfig(
  profileId: string,
  tableNameMapping: TableNameMapping,
  limits: RunLimits,
): AnalyzeRunConfig | undefined {
  const profile = findSourceProfile(profileId);
  if (!profile) return undefined;
  return {
    profileId,
    tableNameMapping,
    analyzer: {
      inventorySchemaVersion: SOURCE_INVENTORY_SCHEMA_VERSION,
      metricVersion: profile.analyzer.metricVersion,
      decoderVersion: SOURCE_DECODER_VERSION,
      normalizationVersion: SOURCE_NORMALIZATION_VERSION,
      sqlAccessVersion: SQL_ACCESS_VERSION,
      callGraphVersion: CALL_GRAPH_VERSION,
      complexityVersion: COMPLEXITY_VERSION,
      tableNameVersion: TABLE_NAME_VERSION,
    },
    limits,
  };
}
