import { useMemo, useState } from 'react';
import type { ArtifactEnvelope } from '@portal/contracts';
import type { ArtifactsApi } from '../../shared/api/artifacts-api';
import { ApiError } from '../../shared/api/api-error';
import { useLocale } from '../../shared/i18n/locale-context';
import type { Messages } from '../../shared/i18n/vi';
import { projectErrorMessage } from '../projects/project-messages';
import {
  filterPrograms,
  summarizeInventory,
  type AssessmentSummary,
  type ProgramFilter,
  type ProgramRow,
} from './assessment-summary';
import { useRunAssessment } from './use-run-assessment';

// Assessment overview of one succeeded run (F03): header of the exact
// artifact version, unique corpus totals apart from per-program totals,
// coverage/warnings and the program list. Parent keys it by run.

function assessmentErrorMessage(error: unknown, messages: Messages): string {
  if (
    error instanceof ApiError &&
    error.kind === 'http' &&
    error.code === 'ARTIFACT_NOT_FOUND'
  )
    return messages.assessment.errors.ARTIFACT_NOT_FOUND;
  if (error instanceof ApiError)
    return projectErrorMessage(error, 'runs', messages.errors);
  return messages.assessment.errors.mismatch;
}

export function AssessmentOverview({
  api,
  projectId,
  runId,
}: {
  api: ArtifactsApi;
  projectId: string;
  runId: string;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment;
  const { state, retry } = useRunAssessment(api, projectId, runId);
  return (
    <section className="assessment" aria-labelledby="assessment-title">
      <h3 id="assessment-title">{copy.title}</h3>
      {state.status === 'loading' && <p role="status">{copy.loading}</p>}
      {state.status === 'error' && (
        <div>
          <p role="alert" className="error">
            {assessmentErrorMessage(state.error, messages)}
          </p>
          <button className="button small" onClick={retry}>
            {copy.retry}
          </button>
        </div>
      )}
      {state.status === 'empty' && <p className="empty-state">{copy.empty}</p>}
      {state.status === 'ready' && <ArtifactView artifact={state.artifact} />}
    </section>
  );
}

function ArtifactView({ artifact }: { artifact: ArtifactEnvelope }) {
  const { messages, formatDateTime } = useLocale();
  const copy = messages.assessment;
  const summary = useMemo(
    () => summarizeInventory(artifact.payload),
    [artifact.payload],
  );
  const mapping = summary.tableMapping;
  return (
    <>
      <dl className="project-metadata assessment-header">
        <div>
          <dt>{copy.fields.mode}</dt>
          <dd>
            <span className="badge">
              {artifact.mode === 'demo'
                ? messages.projects.demoBadge
                : messages.projects.localBadge}
            </span>{' '}
            {artifact.mode === 'demo' ? copy.demoData : copy.localData}
          </dd>
        </div>
        <div>
          <dt>{copy.fields.artifact}</dt>
          <dd className="mono">
            {artifact.id.slice(0, 8)} · v{artifact.version}
          </dd>
        </div>
        <div>
          <dt>{copy.fields.snapshot}</dt>
          <dd className="mono" title={artifact.sourceSnapshotHash}>
            {artifact.sourceSnapshotId.slice(0, 8)} ·{' '}
            {artifact.sourceSnapshotHash.slice(0, 12)}
          </dd>
        </div>
        <div>
          <dt>{copy.fields.createdAt}</dt>
          <dd>{formatDateTime(artifact.createdAt)}</dd>
        </div>
        <div>
          <dt>{copy.fields.versions}</dt>
          <dd className="mono">
            {artifact.schemaVersion} · {artifact.payload.metricVersion}
          </dd>
        </div>
        <div>
          <dt>{copy.fields.tableMapping}</dt>
          <dd>
            {mapping ? copy.mapping[mapping.status] : copy.mapping.absent}
            {mapping?.defaultSchema && (
              <span className="mono"> ({mapping.defaultSchema})</span>
            )}
          </dd>
        </div>
      </dl>
      <p className="muted">{copy.draftNotice}</p>
      {summary.partial && (
        <p className="notice" role="note">
          <strong>{copy.partialTitle}</strong> {copy.partialHelp}
        </p>
      )}
      <Totals summary={summary} />
      {summary.warnings.length > 0 && (
        <>
          <h4>{copy.warningsTitle}</h4>
          <ul className="assessment-warnings">
            {summary.warnings.map((code) => (
              <li key={code}>
                {copy.warnings[code]} <span className="mono">{code}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <ProgramList rows={summary.programs} />
    </>
  );
}

function useNumber() {
  const { locale } = useLocale();
  return useMemo(() => {
    const format = new Intl.NumberFormat(locale);
    return (value: number) => format.format(value);
  }, [locale]);
}

function Totals({ summary }: { summary: AssessmentSummary }) {
  const { messages } = useLocale();
  const copy = messages.assessment.totals;
  const { unique } = summary;
  const number = useNumber();
  return (
    <div className="assessment-totals">
      <section aria-labelledby="unique-totals">
        <h4 id="unique-totals">{copy.uniqueTitle}</h4>
        <p className="muted">{copy.uniqueHelp}</p>
        <dl className="stat-grid">
          <div>
            <dt>{copy.codeLines}</dt>
            <dd data-testid="unique-code-lines">{number(unique.codeLines)}</dd>
          </div>
          <div>
            <dt>{copy.physicalLines}</dt>
            <dd>{number(unique.physicalLines)}</dd>
          </div>
          <div>
            <dt>{copy.coverage}</dt>
            <dd data-testid="coverage">
              {copy.coverageValue(
                number(unique.analyzedCodeFiles),
                number(unique.codeFiles),
              )}
            </dd>
          </div>
          <div>
            <dt>{copy.files}</dt>
            <dd>{number(unique.files)}</dd>
          </div>
          <div>
            <dt>{copy.sharedFiles}</dt>
            <dd>{number(unique.sharedFiles)}</dd>
          </div>
          <div>
            <dt>{copy.problemFiles}</dt>
            <dd>
              {copy.problemValue(
                number(unique.errorFiles),
                number(unique.unsupportedFiles),
                unique.skippedFiles === null
                  ? copy.unknown
                  : number(unique.skippedFiles),
              )}
            </dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="program-totals">
        <h4 id="program-totals">{copy.perProgramTitle}</h4>
        <p className="muted">{copy.perProgramHelp}</p>
        <dl className="stat-grid">
          <div>
            <dt>{copy.programs}</dt>
            <dd>{number(summary.programs.length)}</dd>
          </div>
          <div>
            <dt>{copy.perProgramCodeLines}</dt>
            <dd data-testid="per-program-code-lines">
              {number(summary.perProgramCodeLines)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

const EMPTY_FILTER: ProgramFilter = { query: '', state: 'all', level: 'all' };

function ProgramList({ rows }: { rows: ProgramRow[] }) {
  const { messages } = useLocale();
  const copy = messages.assessment.programs;
  const [filter, setFilter] = useState<ProgramFilter>(EMPTY_FILTER);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const visible = filterPrograms(rows, filter);
  const selected = rows.find((row) => row.key === selectedKey) ?? null;
  const number = useNumber();
  const metric = (value: number | null) =>
    value === null ? copy.notAnalyzed : number(value);
  return (
    <section aria-labelledby="program-list-title">
      <h4 id="program-list-title">{copy.title}</h4>
      <div className="program-filters">
        <label>
          <span>{copy.search}</span>
          <input
            type="search"
            value={filter.query}
            onChange={(event) =>
              setFilter({ ...filter, query: event.currentTarget.value })
            }
          />
        </label>
        <label>
          <span>{copy.stateFilter}</span>
          <select
            value={filter.state}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (
                value === 'all' ||
                value === 'complete' ||
                value === 'partial' ||
                value === 'unsupported'
              )
                setFilter({ ...filter, state: value });
            }}
          >
            <option value="all">{copy.all}</option>
            <option value="complete">{copy.state.complete}</option>
            <option value="partial">{copy.state.partial}</option>
            <option value="unsupported">{copy.state.unsupported}</option>
          </select>
        </label>
        <label>
          <span>{copy.levelFilter}</span>
          <select
            value={filter.level}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (
                value === 'all' ||
                value === 'low' ||
                value === 'medium' ||
                value === 'high'
              )
                setFilter({ ...filter, level: value });
            }}
          >
            <option value="all">{copy.all}</option>
            <option value="low">{copy.level.low}</option>
            <option value="medium">{copy.level.medium}</option>
            <option value="high">{copy.level.high}</option>
          </select>
        </label>
      </div>
      <p className="muted" role="status">
        {copy.count(visible.length, rows.length)}
      </p>
      {visible.length === 0 ? (
        <p className="empty-state">{rows.length ? copy.noMatch : copy.none}</p>
      ) : (
        <div className="table-scroll">
          <table className="program-table">
            <thead>
              <tr>
                <th scope="col">{copy.columns.program}</th>
                <th scope="col">{copy.columns.state}</th>
                <th scope="col">{copy.columns.ownCodeLines}</th>
                <th scope="col">{copy.columns.codeLines}</th>
                <th scope="col">{copy.columns.procedures}</th>
                <th scope="col">{copy.columns.tables}</th>
                <th scope="col">{copy.columns.complexity}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.key}
                  className={row.key === selectedKey ? 'selected' : undefined}
                >
                  <th scope="row">
                    <button
                      className="link-button"
                      aria-pressed={row.key === selectedKey}
                      onClick={() =>
                        setSelectedKey(row.key === selectedKey ? null : row.key)
                      }
                    >
                      {row.name ?? row.projectPath}
                    </button>
                    <span className="mono muted">{row.projectPath}</span>
                  </th>
                  <td>
                    <span className={`run-status program-${row.state}`}>
                      {copy.state[row.state]}
                    </span>
                  </td>
                  <td>{metric(row.ownCodeLines)}</td>
                  <td>{metric(row.codeLines)}</td>
                  <td>{metric(row.procedures)}</td>
                  <td>
                    {metric(row.tables)}
                    {row.mappedTables !== null && (
                      <span className="muted">
                        {' '}
                        {copy.mappedTables(number(row.mappedTables))}
                      </span>
                    )}
                  </td>
                  <td>
                    {row.complexity ? (
                      <>
                        {copy.level[row.complexity.level]} (
                        {row.complexity.score})
                        {row.complexity.draft && (
                          <span className="badge">{copy.draft}</span>
                        )}
                        {row.complexity.needsReview && (
                          <span className="badge">{copy.needsReview}</span>
                        )}
                      </>
                    ) : (
                      copy.notAnalyzed
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && <ProgramMembers row={selected} />}
    </section>
  );
}

function ProgramMembers({ row }: { row: ProgramRow }) {
  const { messages } = useLocale();
  const copy = messages.assessment.members;
  return (
    <div
      className="program-members"
      aria-label={copy.title(row.name ?? row.projectPath)}
    >
      <h5>{copy.title(row.name ?? row.projectPath)}</h5>
      {row.issue && (
        <p className="error">
          {copy.issue} <span className="mono">{row.issue}</span>
        </p>
      )}
      {row.members.length === 0 ? (
        <p className="empty-state">{copy.none}</p>
      ) : (
        <ul>
          {row.members.map((member) => (
            <li key={member.declaredPath}>
              <span className="mono">
                {member.relativePath ?? member.declaredPath}
              </span>{' '}
              {member.resolution !== 'resolved' && (
                <span className="badge">
                  {copy.resolution[member.resolution]}
                </span>
              )}
              {member.shared && <span className="badge">{copy.shared}</span>}
              {member.fileStatus && member.fileStatus !== 'analyzed' && (
                <span className="badge">
                  {copy.fileStatus[member.fileStatus]}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
