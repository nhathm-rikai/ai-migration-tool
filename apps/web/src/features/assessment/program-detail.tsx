import { useId, useMemo, useState, type ReactNode } from 'react';
import type { SourceInventoryDocument } from '@portal/contracts';
import { useLocale } from '../../shared/i18n/locale-context';
import { pageOf, programLabel } from './assessment-summary';
import { ComplexityTag, MappingStatus } from './tags';
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
// program selected in the overview, one tab each. Lists and tables only;
// every value is rendered as text (React escapes it), never as HTML or a
// link guessed from a name.

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
  const [tab, setTab] = useState<DetailTab>('summary');
  if (!detail) return null;
  const label = programLabel(detail.projectPath);
  const analysis = detail.analysis;
  const tabs: DetailTab[] = analysis
    ? ['summary', 'files', 'procedures', 'crud', 'calls']
    : ['summary', 'files'];
  const panel = (value: DetailTab) => `${titleId}-${value}`;
  const count = (value: DetailTab): number | null => {
    if (value === 'files') return detail.members.length;
    if (!analysis) return null;
    if (value === 'procedures') return analysis.procedures.length;
    if (value === 'crud') return analysis.rawCrud.length;
    if (value === 'calls') return analysis.calls.length;
    return null;
  };
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
      <div className="tabs" role="tablist" aria-label={copy.tabsLabel}>
        {tabs.map((value) => {
          const total = count(value);
          return (
            <button
              key={value}
              id={`${panel(value)}-tab`}
              role="tab"
              className="tab"
              aria-selected={tab === value}
              aria-controls={panel(value)}
              onClick={() => setTab(value)}
            >
              {copy.tabs[value]}
              {total !== null && <span className="tab-count">{total}</span>}
            </button>
          );
        })}
      </div>
      <TabPanel id={panel('summary')} active={tab === 'summary'}>
        {analysis ? (
          <Summary analysis={analysis} />
        ) : (
          <p className="empty-state">{copy.unavailable}</p>
        )}
        <External detail={detail} />
      </TabPanel>
      <TabPanel id={panel('files')} active={tab === 'files'}>
        <Members rows={detail.members} label={label} />
      </TabPanel>
      {analysis && (
        <>
          <TabPanel id={panel('procedures')} active={tab === 'procedures'}>
            <Procedures analysis={analysis} />
          </TabPanel>
          <TabPanel id={panel('crud')} active={tab === 'crud'}>
            <Crud detail={detail} analysis={analysis} />
          </TabPanel>
          <TabPanel id={panel('calls')} active={tab === 'calls'}>
            <Calls rows={analysis.calls} />
          </TabPanel>
        </>
      )}
    </section>
  );
}

type DetailTab = 'summary' | 'files' | 'procedures' | 'crud' | 'calls';

function TabPanel({
  id,
  active,
  children,
}: {
  id: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={id}
      aria-labelledby={`${id}-tab`}
      hidden={!active}
      className="detail-panel-body"
    >
      {children}
    </div>
  );
}

// Detail tables show 10 rows per page, so an open program stays short in
// the list it was opened from.
export const DETAIL_PAGE_SIZE = 10;
function useRowLimit<T>(rows: readonly T[]) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail;
  const pages = messages.assessment.programs;
  const [page, setPage] = useState(1);
  const number = useNumber();
  const current = pageOf(rows, page, DETAIL_PAGE_SIZE);
  const from = (current.page - 1) * DETAIL_PAGE_SIZE + 1;
  const more =
    rows.length > DETAIL_PAGE_SIZE ? (
      <nav
        className="pagination detail-pagination"
        aria-label={copy.rowsPagination}
      >
        <span className="muted">
          {copy.rowRange(
            number(from),
            number(from + current.items.length - 1),
            number(rows.length),
          )}
        </span>
        <button
          className="button small"
          disabled={current.page <= 1}
          onClick={() => setPage(current.page - 1)}
        >
          {pages.previous}
        </button>
        <span>{pages.page(current.page, current.pages)}</span>
        <button
          className="button small"
          disabled={current.page >= current.pages}
          onClick={() => setPage(current.page + 1)}
        >
          {pages.next}
        </button>
      </nav>
    ) : null;
  return { shown: current.items, more, reset: () => setPage(1) };
}

// "path/File.frm#sub:Name" → "Name" and "File.frm"; the full ID stays in
// the tooltip as evidence.
function shortProcedure(id: string): { name: string; file: string } {
  const [path = id, procedure = ''] = id.split('#');
  const file = path.split('/').pop() ?? path;
  const name = procedure.includes(':')
    ? procedure.slice(procedure.indexOf(':') + 1)
    : procedure;
  return { name: name || file, file };
}

type Analysis = NonNullable<Detail['analysis']>;

function Summary({ analysis }: { analysis: Analysis }) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail;
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
          <ComplexityTag
            level={analysis.complexity.level}
            score={analysis.complexity.score}
          />{' '}
          <span className="mono muted version">
            {analysis.complexity.version}
          </span>
        </dd>
      </div>
      {analysis.mappedComplexity && (
        <div>
          <dt>{copy.mappedComplexity}</dt>
          <dd>
            <ComplexityTag
              level={analysis.mappedComplexity.level}
              score={analysis.mappedComplexity.score}
            />
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
  const { shown, more } = useRowLimit(rows);
  const metric = (value: number | null) =>
    value === null ? copy.notAnalyzed : number(value);
  return (
    <section aria-labelledby={id}>
      <h6 id={id}>{members.title(label)}</h6>
      {rows.length === 0 ? (
        <p className="empty-state">{members.none}</p>
      ) : (
        <div className="table-scroll">
          <table className="detail-table detail-files">
            <thead>
              <tr>
                <th scope="col">{copy.columns.file}</th>
                <th scope="col">{copy.columns.kind}</th>
                <th scope="col">{copy.columns.codeLines}</th>
                <th scope="col">{copy.columns.procedures}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.key}>
                  <th scope="row" title={row.relativePath ?? row.declaredPath}>
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
      {more}
    </section>
  );
}

function Procedures({ analysis }: { analysis: Analysis }) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail;
  const number = useNumber();
  const id = useId();
  const { shown, more } = useRowLimit(analysis.procedures);
  return (
    <section aria-labelledby={id}>
      <h6 id={id}>{copy.proceduresTitle}</h6>
      <p className="muted">{copy.proceduresHelp}</p>
      {analysis.procedures.length === 0 ? (
        <p className="empty-state">{copy.noProcedures}</p>
      ) : (
        <div className="table-scroll">
          <table className="detail-table detail-procedures">
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
              {shown.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    <span className="mono">{row.name}</span>{' '}
                    <span className="muted">
                      {row.kind} · {row.visibility}
                    </span>
                  </th>
                  <td title={row.relativePath}>
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
      {more}
    </section>
  );
}

function Crud({ detail, analysis }: { detail: Detail; analysis: Analysis }) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail;
  // The mapped view opens first when there is one (configured or inferred).
  const [view, setView] = useState<CrudView>(
    analysis.mappedCrud ? 'mapped' : 'raw',
  );
  const id = useId();
  const { rows, shown, fallback } = crudRows(analysis, view);
  const limited = useRowLimit(rows);
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
              onChange={() => {
                setView(option);
                limited.reset();
              }}
            />{' '}
            {copy.crudViews[option]}
          </label>
        ))}
      </fieldset>
      <p className="muted" role="note">
        {shown === 'raw' ? copy.crudRawHelp : copy.crudMappedHelp}{' '}
        {copy.mappingStatus}{' '}
        <MappingStatus
          mapping={detail.mapping}
          stored={detail.tableNames !== null}
        />
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
          <table
            className={`detail-table detail-crud${shown === 'mapped' ? ' with-names' : ''}`}
            data-testid={`crud-${shown}`}
          >
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
              {limited.shown.map((row) => (
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
      {limited.more}
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
  return (
    <span className="mono" title={row.targets.join(', ')}>
      {row.targets
        .map((target) => {
          const { name, file } = shortProcedure(target);
          return name === file ? file : `${name} (${file})`;
        })
        .join(', ')}
    </span>
  );
}

function Calls({ rows }: { rows: CallRow[] }) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail;
  const number = useNumber();
  const id = useId();
  const { shown, more } = useRowLimit(rows);
  return (
    <section aria-labelledby={id}>
      <h6 id={id}>{copy.callsTitle}</h6>
      <p className="muted">{copy.callsHelp}</p>
      {rows.length === 0 ? (
        <p className="empty-state">{copy.noCalls}</p>
      ) : (
        <div className="table-scroll">
          <table className="detail-table detail-calls">
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
              {shown.map((row) => {
                const caller = shortProcedure(row.from);
                return (
                  <tr key={row.key}>
                    <th scope="row" title={row.from}>
                      <span className="mono">{caller.name}</span>{' '}
                      <span className="muted">{caller.file}</span>
                    </th>
                    <td className="mono">
                      {row.name} <span className="muted">L{row.line}</span>
                    </td>
                    <td>
                      <span className="badge">
                        {copy.resolution[row.resolution]}
                      </span>
                    </td>
                    <td title={row.targets.join(', ')}>
                      <CallTargets row={row} />
                    </td>
                    <td>{number(row.count)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {more}
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
