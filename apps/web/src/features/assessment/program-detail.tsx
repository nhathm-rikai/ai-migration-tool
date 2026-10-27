import { useId, useMemo, useState } from 'react';
import type { SourceInventoryDocument } from '@portal/contracts';
import { useLocale } from '../../shared/i18n/locale-context';
import {
  crudRows,
  programDetail,
  type CallRow,
  type CrudView,
  type MemberRow,
  type ProgramDetail as Detail,
} from './program-detail-model';

// Program detail (F04): member files, procedures with LoC, CRUD as written
// or after table name mapping, calls and external dependencies of the
// program selected in the overview. Lists and tables only; every value is
// rendered as text (React escapes it), never as HTML or a link guessed from
// a name.

function useNumber() {
  const { locale } = useLocale();
  return useMemo(() => {
    const format = new Intl.NumberFormat(locale);
    return (value: number) => format.format(value);
  }, [locale]);
}

export function ProgramDetail({
  inventory,
  projectPath,
}: {
  inventory: SourceInventoryDocument;
  projectPath: string;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail;
  const detail = useMemo(
    () => programDetail(inventory, projectPath),
    [inventory, projectPath],
  );
  const titleId = useId();
  if (!detail) return null;
  const label = detail.name ?? detail.projectPath;
  return (
    <section className="program-detail" aria-labelledby={titleId}>
      <h5 id={titleId}>{copy.title(label)}</h5>
      <p className="mono muted">{detail.projectPath}</p>
      {detail.issue && (
        <p className="error">
          {copy.issue} <span className="mono">{detail.issue.reason}</span>
          {detail.issue.line !== null && (
            <span className="mono"> (L{detail.issue.line})</span>
          )}
        </p>
      )}
      {!detail.complete && <p className="notice">{copy.incomplete}</p>}
      {detail.analysis ? (
        <Summary analysis={detail.analysis} />
      ) : (
        <p className="empty-state">{copy.unavailable}</p>
      )}
      <Members rows={detail.members} label={label} />
      {detail.analysis && (
        <>
          <Procedures analysis={detail.analysis} />
          <Crud detail={detail} analysis={detail.analysis} />
          <Calls rows={detail.analysis.calls} />
        </>
      )}
      <External detail={detail} />
    </section>
  );
}

type Analysis = NonNullable<Detail['analysis']>;

function Summary({ analysis }: { analysis: Analysis }) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail;
  const levels = messages.assessment.programs.level;
  const number = useNumber();
  return (
    <dl className="stat-grid">
      <div>
        <dt>{copy.ownCodeLines}</dt>
        <dd data-testid="detail-own-code-lines">
          {number(analysis.ownCodeLines)}
        </dd>
      </div>
      <div>
        <dt>{copy.codeLines}</dt>
        <dd>{number(analysis.codeLines)}</dd>
      </div>
      <div>
        <dt>{copy.ownProcedures}</dt>
        <dd>{number(analysis.ownProcedures)}</dd>
      </div>
      <div>
        <dt>{copy.rawComplexity}</dt>
        <dd data-testid="detail-raw-complexity">
          {levels[analysis.complexity.level]} ({analysis.complexity.score}){' '}
          <span className="mono muted">{analysis.complexity.version}</span>
        </dd>
      </div>
      {analysis.mappedComplexity && (
        <div>
          <dt>{copy.mappedComplexity}</dt>
          <dd>
            {levels[analysis.mappedComplexity.level]} (
            {analysis.mappedComplexity.score})
          </dd>
        </div>
      )}
    </dl>
  );
}

function Members({ rows, label }: { rows: MemberRow[]; label: string }) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail;
  const members = messages.assessment.members;
  const number = useNumber();
  const id = useId();
  const metric = (value: number | null) =>
    value === null ? copy.notAnalyzed : number(value);
  return (
    <section aria-labelledby={id}>
      <h6 id={id}>{members.title(label)}</h6>
      {rows.length === 0 ? (
        <p className="empty-state">{members.none}</p>
      ) : (
        <div className="table-scroll">
          <table className="detail-table">
            <thead>
              <tr>
                <th scope="col">{copy.columns.file}</th>
                <th scope="col">{copy.columns.kind}</th>
                <th scope="col">{copy.columns.codeLines}</th>
                <th scope="col">{copy.columns.procedures}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">
                    <span className="mono">
                      {row.relativePath ?? row.declaredPath}
                    </span>{' '}
                    {row.resolution !== 'resolved' && (
                      <span className="badge">
                        {members.resolution[row.resolution]}
                      </span>
                    )}
                    {row.shared && (
                      <span className="badge">{members.shared}</span>
                    )}
                    {row.fileStatus && row.fileStatus !== 'analyzed' && (
                      <span className="badge">
                        {members.fileStatus[row.fileStatus]}
                      </span>
                    )}
                    {row.unsupportedReason && (
                      <span className="mono muted">
                        {' '}
                        {row.unsupportedReason}
                      </span>
                    )}
                  </th>
                  <td>{row.kind}</td>
                  <td>{metric(row.codeLines)}</td>
                  <td>{metric(row.procedures)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Procedures({ analysis }: { analysis: Analysis }) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail;
  const number = useNumber();
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h6 id={id}>{copy.proceduresTitle}</h6>
      <p className="muted">{copy.proceduresHelp}</p>
      {analysis.procedures.length === 0 ? (
        <p className="empty-state">{copy.noProcedures}</p>
      ) : (
        <div className="table-scroll">
          <table className="detail-table">
            <thead>
              <tr>
                <th scope="col">{copy.columns.procedure}</th>
                <th scope="col">{copy.columns.file}</th>
                <th scope="col">{copy.columns.lines}</th>
                <th scope="col">{copy.columns.codeLines}</th>
                <th scope="col">{copy.columns.decisions}</th>
              </tr>
            </thead>
            <tbody>
              {analysis.procedures.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <span className="mono">{row.name}</span>{' '}
                    <span className="muted">
                      {row.kind} · {row.visibility}
                    </span>
                  </th>
                  <td>
                    <span className="mono">{row.relativePath}</span>{' '}
                    {row.shared && (
                      <span className="badge">
                        {messages.assessment.members.shared}
                      </span>
                    )}
                  </td>
                  <td className="mono">
                    {row.startLine}–{row.endLine}
                  </td>
                  <td>{number(row.codeLines)}</td>
                  <td>{number(row.decisionPoints)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Crud({ detail, analysis }: { detail: Detail; analysis: Analysis }) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail;
  const [view, setView] = useState<CrudView>('raw');
  const id = useId();
  const { rows, shown, fallback } = crudRows(analysis, view);
  const mapping = detail.tableNames;
  return (
    <section aria-labelledby={id}>
      <h6 id={id}>{copy.crudTitle}</h6>
      <fieldset className="crud-view">
        <legend>{copy.crudView}</legend>
        {(['raw', 'mapped'] as const).map((option) => (
          <label key={option}>
            <input
              type="radio"
              name={`${id}-view`}
              value={option}
              checked={view === option}
              onChange={() => setView(option)}
            />{' '}
            {copy.crudViews[option]}
          </label>
        ))}
      </fieldset>
      <p className="muted" role="note">
        {shown === 'raw' ? copy.crudRawHelp : copy.crudMappedHelp}{' '}
        {copy.mappingStatus}{' '}
        {mapping
          ? messages.assessment.mapping[mapping.status]
          : messages.assessment.mapping.absent}
        {mapping?.defaultSchema && (
          <span className="mono"> ({mapping.defaultSchema})</span>
        )}
      </p>
      {fallback && (
        <p className="notice" role="status">
          {copy.mappedAbsent}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="empty-state">{copy.noCrud}</p>
      ) : (
        <div className="table-scroll">
          <table className="detail-table" data-testid={`crud-${shown}`}>
            <thead>
              <tr>
                <th scope="col">{copy.columns.table}</th>
                {shown === 'mapped' && (
                  <th scope="col">{copy.columns.sourceNames}</th>
                )}
                <th scope="col">{copy.columns.operations}</th>
                <th scope="col">{copy.columns.evidence}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.table}>
                  <th scope="row">
                    <span className="mono">{row.table}</span>{' '}
                    {row.viaSharedOnly && (
                      <span className="badge">{copy.viaShared}</span>
                    )}
                  </th>
                  {shown === 'mapped' && (
                    <td className="mono">{(row.names ?? []).join(', ')}</td>
                  )}
                  <td className="mono">{row.operations.join(' ')}</td>
                  <td className="mono">
                    {row.evidence.relativePath}:{row.evidence.line}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CallTargets({ row }: { row: CallRow }) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail;
  if (row.resolution === 'ambiguous')
    return (
      <>
        <strong>{copy.ambiguousTarget}</strong>{' '}
        <span className="muted">
          {copy.candidates}{' '}
          <span className="mono">{row.targets.join(', ')}</span>
        </span>
      </>
    );
  return <span className="mono">{row.targets.join(', ')}</span>;
}

function Calls({ rows }: { rows: CallRow[] }) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail;
  const number = useNumber();
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h6 id={id}>{copy.callsTitle}</h6>
      <p className="muted">{copy.callsHelp}</p>
      {rows.length === 0 ? (
        <p className="empty-state">{copy.noCalls}</p>
      ) : (
        <div className="table-scroll">
          <table className="detail-table">
            <thead>
              <tr>
                <th scope="col">{copy.columns.caller}</th>
                <th scope="col">{copy.columns.callee}</th>
                <th scope="col">{copy.columns.resolution}</th>
                <th scope="col">{copy.columns.targets}</th>
                <th scope="col">{copy.columns.uses}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="mono">
                    {row.from}
                  </th>
                  <td className="mono">
                    {row.name} <span className="muted">L{row.line}</span>
                  </td>
                  <td>
                    <span className="badge">
                      {copy.resolution[row.resolution]}
                    </span>
                  </td>
                  <td>
                    <CallTargets row={row} />
                  </td>
                  <td>{number(row.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function External({ detail }: { detail: Detail }) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail;
  const id = useId();
  // External APIs come from the analysis of the code files; references and
  // components from the project file. "None" is only a finding when the
  // program was analyzed completely.
  const apis = detail.analysis?.externalApis ?? [];
  const known = apis.length + detail.externalReferences.length;
  const note = !detail.analysis
    ? copy.externalUnknown
    : !detail.complete
      ? copy.externalPartial
      : known === 0
        ? copy.noExternal
        : null;
  return (
    <section aria-labelledby={id}>
      <h6 id={id}>{copy.externalTitle}</h6>
      {note && (
        <p
          className={known === 0 ? 'empty-state' : 'muted'}
          data-testid="external-note"
        >
          {note}
        </p>
      )}
      {known > 0 && (
        <ul className="detail-list">
          {apis.map((api) => (
            <li key={`api:${api.library}:${api.name}`}>
              <span className="badge">{copy.externalApi}</span>{' '}
              <span className="mono">
                {api.name} ({api.library})
              </span>
            </li>
          ))}
          {detail.externalReferences.map((reference) => (
            <li key={`${reference.kind}:${reference.identifier}`}>
              <span className="badge">
                {copy.referenceKind[reference.kind]}
              </span>{' '}
              <span className="mono">
                {reference.fileName ?? reference.identifier}
              </span>
              {reference.description && (
                <span className="muted"> {reference.description}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
