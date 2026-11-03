import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import type { SourceInventoryDocument } from '@portal/contracts';
import { Link, stepPath } from '../../app/router';
import type { ArtifactsApi } from '../../shared/api/artifacts-api';
import { useLocale } from '../../shared/i18n/locale-context';
import { useRunAssessment } from '../assessment/use-run-assessment';
import {
  computeQuote,
  DEFAULT_QUOTE_PARAMS,
  formatQuoteNumber,
  moduleOf,
  effectiveBase,
  formulaFacts,
  QUOTE_BASE,
  QUOTE_SCOPE_ITEMS,
  QUOTE_VALIDITY_DAYS,
  SHARED_MODULE,
  type QuoteParams,
  type QuoteItem,
  type QuotePhaseId,
  type QuoteUnitDays,
  type QuoteProgram,
} from './quote-model';
import { branding } from '../../app/branding';
import { QuoteDocument } from './quote-document';
import { renderQuotePdf } from './quote-pdf';
import { buildQuoteSheets } from './quote-workbook';
import { buildWorkbook } from './xlsx';

// Step 5 (prototype tpl-Quote). A draft estimate of every program of the
// latest analysis; every number comes from stored analysis data and the
// parameters on this screen. Parameters and the quote number stay in this
// browser only.

const PHASE_COLORS: Record<QuotePhaseId, string> = {
  doc: '#8B5CD6',
  code: '#0077BE',
  test: '#C25E00',
  mgmt: '#D13F86',
};
const STORAGE_PREFIX = 'portal.quote.';
// v2: new defaults; parameters saved before are dropped.
const PARAMS_KEY = `${STORAGE_PREFIX}v2.`;

const yen = (value: number) => `¥${Math.round(value).toLocaleString('en-US')}`;
const mm = (value: number) => value.toFixed(1);

function readParams(projectId: string): QuoteParams {
  try {
    const saved = window.localStorage.getItem(PARAMS_KEY + projectId);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<QuoteParams>;
      return {
        ...DEFAULT_QUOTE_PARAMS,
        ...parsed,
        pct: { ...DEFAULT_QUOTE_PARAMS.pct, ...parsed.pct },
        rate: { ...DEFAULT_QUOTE_PARAMS.rate, ...parsed.rate },
      };
    }
  } catch {
    // Storage may be blocked: the defaults still work.
  }
  return DEFAULT_QUOTE_PARAMS;
}

// The project's number, issued once when its first quote is shown. Without
// storage it lasts for this visit only.
function issueQuoteNumber(projectId: string): string {
  const key = `${STORAGE_PREFIX}number.${projectId}`;
  const now = new Date();
  try {
    const saved = window.localStorage.getItem(key);
    if (saved) return saved;
    const dayKey = `${STORAGE_PREFIX}sequence.${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const sequence = Number(window.localStorage.getItem(dayKey) ?? 0) + 1;
    const issued = formatQuoteNumber(now, sequence);
    window.localStorage.setItem(dayKey, String(sequence));
    window.localStorage.setItem(key, issued);
    return issued;
  } catch {
    return formatQuoteNumber(now, 1);
  }
}

const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function saveFile(
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
  type = XLSX_TYPE,
) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

// Every program of the latest analysis; one without analysis data (parse
// failure) cannot be estimated and is counted apart.
export function quotePrograms(inventory: SourceInventoryDocument): {
  programs: QuoteProgram[];
  skipped: number;
  // Code lines that belong to no program (shared modules), billed apart.
  sharedLines: number;
} {
  const programs = inventory.programs.flatMap((program): QuoteProgram[] => {
    if (!program.analysis) return [];
    const complexity =
      program.analysis.normalizedComplexity ?? program.analysis.complexity;
    return [
      {
        projectPath: program.projectPath,
        name: program.name ?? program.projectPath,
        codeLines: program.analysis.metrics.ownCodeLines,
        metrics: {
          decisionPoints: program.analysis.metrics.decisionPoints,
          tables:
            program.analysis.metrics.normalizedTables ??
            program.analysis.metrics.tables,
          concatenatedSql: program.analysis.metrics.concatenatedSql ?? 0,
          dynamicSql: program.analysis.metrics.dynamicSql,
          components: program.analysis.metrics.components,
          externalApis: program.analysis.metrics.externalApis,
        },
        score: complexity.score,
        level: complexity.level,
      },
    ];
  });
  const own = programs.reduce((sum, program) => sum + program.codeLines, 0);
  return {
    programs,
    skipped: inventory.programs.length - programs.length,
    sharedLines: Math.max(0, inventory.totals.uniqueCounters.codeLines - own),
  };
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`quote-chevron${open ? ' open' : ''}`}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <path
        d="M5.5 3.5 10.5 8l-5 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NumberField({
  label,
  value,
  onChange,
  max,
  compact = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
  compact?: boolean;
}) {
  return (
    <input
      className={`quote-input mono${compact ? ' compact' : ''}`}
      type="number"
      min={0}
      max={max}
      step="any"
      aria-label={label}
      value={value}
      onChange={(event) => {
        const next = Math.max(0, Number(event.target.value) || 0);
        onChange(max === undefined ? next : Math.min(max, next));
      }}
    />
  );
}

export function QuoteStep({
  projectId,
  projectName,
  analysisRunId,
  headerSlot = null,
  eyebrowSlot = null,
  artifactsApi,
}: {
  projectId: string;
  projectName: string;
  analysisRunId: string | null;
  headerSlot?: HTMLElement | null;
  eyebrowSlot?: HTMLElement | null;
  artifactsApi: ArtifactsApi;
}) {
  const { messages } = useLocale();
  const copy = messages.quote;
  const inventory = useRunAssessment(
    artifactsApi,
    projectId,
    analysisRunId ?? '',
  );
  const [params, setParams] = useState<QuoteParams>(() =>
    readParams(projectId),
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PARAMS_KEY + projectId,
        JSON.stringify(params),
      );
    } catch {
      // Storage may be blocked: parameters then last for this visit only.
    }
  }, [params, projectId]);

  const scope = useMemo(
    () =>
      inventory.state.status === 'ready'
        ? quotePrograms(inventory.state.artifact.payload)
        : null,
    [inventory.state],
  );
  const result = useMemo(
    () =>
      scope
        ? computeQuote(scope.programs, params, QUOTE_BASE, scope.sharedLines)
        : null,
    [scope, params],
  );
  const hasQuote = (scope?.programs.length ?? 0) > 0;
  const [quoteNumber, setQuoteNumber] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  // Keys of the open rows: `m:<module>` shows its programs, `p:<path>` the
  // effort of that program by work item.
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (hasQuote) setQuoteNumber(issueQuoteNumber(projectId));
  }, [hasQuote, projectId]);

  if (analysisRunId !== null && inventory.state.status === 'error')
    return (
      <p role="alert" className="error">
        {copy.loadFailed}
      </p>
    );
  if (analysisRunId !== null && !scope && inventory.state.status !== 'empty')
    return <p role="status">{copy.loading}</p>;
  if (!scope || !result || scope.programs.length === 0)
    return (
      <section className="panel empty-panel" aria-labelledby="quote-empty">
        <h2 id="quote-empty">{copy.emptyTitle}</h2>
        <p className="muted">{copy.emptyHelp}</p>
        <div className="form-actions">
          <Link className="button primary" to={stepPath(projectId, 'analysis')}>
            {copy.emptyAction}
          </Link>
        </div>
      </section>
    );

  const patch = (next: Partial<QuoteParams>) =>
    setParams((current) => ({ ...current, ...next }));
  const phaseName = (id: QuotePhaseId) => {
    if (id !== 'doc' && id !== 'test') return copy.phases[id];
    const items = QUOTE_SCOPE_ITEMS[id].filter(
      (item) => !params.excluded.includes(item),
    );
    return items.length > 0
      ? `${copy.phases[id]} (${items.join(', ')})`
      : copy.phases[id];
  };
  let angle = 0;
  const stops = result.phases.map((phase) => {
    const from = angle;
    angle += result.totalMM > 0 ? (phase.mm / result.totalMM) * 360 : 0;
    return `${PHASE_COLORS[phase.id]} ${from}deg ${angle}deg`;
  });
  const maxPhase = Math.max(...result.phases.map((phase) => phase.mm), 0) || 1;
  // One label per month up to a year, then every quarter, then every year.
  const monthStep = result.months <= 12 ? 1 : result.months <= 36 ? 3 : 12;
  const maxShare = Math.max(...result.modules.map((m) => m.share), 0) || 1;
  const needle = programFilter.trim().toLowerCase();
  const matches = (row: { name: string; projectPath: string }) =>
    needle === '' ||
    `${row.name} ${row.projectPath}`.toLowerCase().includes(needle);
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const columns = 7;
  const effective = effectiveBase(params);
  const coding = effective.coding;
  const unitRows: {
    key: keyof QuoteUnitDays;
    part: string;
    unit: string;
    days: number;
  }[] = [
    {
      key: 'perHundredLines',
      ...copy.units.lines,
      days: coding.perHundredLines,
    },
    {
      key: 'perHundredDecisions',
      ...copy.units.decisions,
      days: coding.perHundredDecisions,
    },
    { key: 'perTable', ...copy.units.tables, days: coding.perTable },
    {
      key: 'perConcatenatedSql',
      ...copy.units.sql,
      days: coding.perConcatenatedSql,
    },
    {
      key: 'perComponent',
      ...copy.units.components,
      days: coding.perComponent,
    },
    { key: 'perExternalApi', ...copy.units.apis, days: coding.perExternalApi },
  ];
  const formulaLines = copy.formula(formulaFacts(params, QUOTE_BASE, result));
  // Effort of one module or program by work item, shown as cards per phase;
  // the label and the colour tell which kind of row it belongs to.
  const groups = [
    { id: 'doc', ids: ['BD', 'DD'] },
    { id: 'code', ids: ['coding'] },
    { id: 'test', ids: ['UT', 'IT', 'UAT support'] },
    { id: 'mgmt', ids: ['pm', 'brse', 'comtor'] },
  ] as const;
  const breakdown = (
    share: number,
    kind: 'module' | 'program',
    name: string,
  ) => (
    <tr className={`quote-detail ${kind}`}>
      <td colSpan={columns}>
        <div className="quote-detail-body">
          <span className="quote-detail-label">
            <b>{kind === 'module' ? copy.module : copy.programTitle}</b>
            <span className="mono">{name}</span>
            <small>{copy.itemsTitle}</small>
          </span>
          <div className="quote-phase-cards">
            {groups.map((group) => {
              const items = result.items.filter(
                (item: QuoteItem) =>
                  (group.ids as readonly string[]).includes(item.id) &&
                  item.mm > 0,
              );
              if (items.length === 0) return null;
              const mmSum = items.reduce((sum, item) => sum + item.mm, 0);
              const costSum = items.reduce((sum, item) => sum + item.cost, 0);
              const percent = (cost: number) =>
                result.totalCost > 0
                  ? Math.round((cost / result.totalCost) * 100)
                  : 0;
              return (
                <section
                  key={group.id}
                  className="quote-phase-card"
                  style={{ '--phase': PHASE_COLORS[group.id] } as CSSProperties}
                >
                  <header>
                    <b>{copy.phases[group.id]}</b>
                    <span className="mono">{percent(costSum)}%</span>
                  </header>
                  <p className="mono">
                    {(mmSum * share).toFixed(2)} MM · {yen(costSum * share)}
                  </p>
                  <ul>
                    {items.map((item: QuoteItem) => (
                      <li key={item.id}>
                        <span>{copy.items[item.id]}</span>
                        <b className="mono">{(item.mm * share).toFixed(2)}</b>
                        <small className="mono">{yen(item.cost * share)}</small>
                        <em className="mono">{percent(item.cost)}%</em>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      </td>
    </tr>
  );
  const moduleName = (name: string) =>
    name === SHARED_MODULE ? copy.sharedModule : name;
  const roleRows = (['pm', 'brse', 'comtor'] as const).map((key) => ({
    key,
    label: copy.roles[key],
  }));

  // 見積書_<project>_<number without the QT- prefix>, without characters a file name cannot hold.
  const fileName = (title: string) =>
    [title, projectName, quoteNumber.replace(/^QT-/, '')]
      .filter(Boolean)
      .join('_')
      .replace(/[\\/:*?"<>|\s]+/g, '_');

  async function exportPdf() {
    const source = document.querySelector<HTMLElement>('.quote-doc-root');
    if (!source || pdfBusy) return;
    setPdfBusy(true);
    try {
      const bytes = await renderQuotePdf(
        source,
        `${branding.logoAlt} · ${quoteNumber}`,
      );
      saveFile(`${fileName('見積書')}.pdf`, bytes, 'application/pdf');
    } catch {
      // The button comes back; the screen itself is unaffected.
    } finally {
      setPdfBusy(false);
    }
  }

  function exportExcel() {
    if (!result || !scope) return;
    const sheets = buildQuoteSheets({
      projectName,
      quoteNumber,
      params,
      result,
    });
    saveFile(`${fileName('見積書')}.xlsx`, buildWorkbook(sheets));
  }

  return (
    <div className="quote">
      {createPortal(
        <QuoteDocument
          projectName={projectName}
          quoteNumber={quoteNumber}
          params={params}
          result={result}
        />,
        document.body,
      )}
      {eyebrowSlot &&
        quoteNumber &&
        createPortal(
          ` · ${quoteNumber} · ${copy.validity(QUOTE_VALIDITY_DAYS)}`,
          eyebrowSlot,
        )}
      {headerSlot &&
        createPortal(
          <span className="quote-actions">
            <button
              type="button"
              className="button"
              onClick={() => void exportPdf()}
              disabled={pdfBusy}
            >
              {copy.exportPdf}
            </button>
            <button type="button" className="button" onClick={exportExcel}>
              {copy.exportExcel}
            </button>
            <button
              type="button"
              className="button primary"
              disabled
              title={copy.sendLater}
            >
              {copy.send}
            </button>
          </span>,
          headerSlot,
        )}
      <p className="page-lead">
        {copy.lead(result.programs, result.codeLines, scope.skipped)}
      </p>
      <div className="quote-kpis">
        <div className="quote-kpi primary">
          <span>{copy.totalCost}</span>
          <strong className="mono">{yen(result.totalCost)}</strong>
          <small>{copy.costNote}</small>
        </div>
        <div className="quote-kpi">
          <span>{copy.totalEffort}</span>
          <strong className="mono">{mm(result.totalMM)} MM</strong>
          <small>{copy.effortNote(mm(result.devMM), mm(result.mgmtMM))}</small>
        </div>
        <div className="quote-kpi">
          <span>{copy.duration}</span>
          <strong className="mono">{copy.months(result.months)}</strong>
          <small>{copy.durationNote(params.devs, mm(result.aiSavedMM))}</small>
        </div>
      </div>
      <div className="quote-columns">
        <section className="doc-card quote-params print-hide">
          <h2>{copy.paramsTitle}</h2>
          <div className="quote-group">
            <span>
              <strong>{copy.aiTitle}</strong> · {copy.aiHelp}
            </span>
            {(
              [
                ['aiCode', copy.aiCode],
                ['aiTest', copy.aiTest],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="quote-slider">
                <span>
                  {label}
                  <b className="mono">-{params[key]}%</b>
                </span>
                <input
                  type="range"
                  min={0}
                  max={60}
                  value={params[key]}
                  onChange={(event) =>
                    patch({ [key]: Number(event.target.value) })
                  }
                />
              </label>
            ))}
            <small className="muted">{copy.saved(mm(result.aiSavedMM))}</small>
          </div>
          <div className="quote-devs">
            <span>
              <strong>{copy.devs}</strong>
              <small>{copy.devsHelp}</small>
            </span>
            <span className="quote-stepper">
              <button
                type="button"
                aria-label={copy.devsLess}
                onClick={() => patch({ devs: Math.max(1, params.devs - 1) })}
              >
                −
              </button>
              <b className="mono">{params.devs}</b>
              <button
                type="button"
                aria-label={copy.devsMore}
                onClick={() => patch({ devs: Math.min(30, params.devs + 1) })}
              >
                +
              </button>
            </span>
          </div>
          <div className="quote-group">
            <span>
              <strong>{copy.rolesTitle}</strong> (¥ / man-month)
            </span>
            <div className="quote-role head">
              <small>{copy.role}</small>
              <small>% effort</small>
              <small>{copy.rate}</small>
            </div>
            {roleRows.map(({ key, label }) => (
              <div key={key} className="quote-role">
                <span>{label}</span>
                <NumberField
                  label={`${label} % effort`}
                  value={params.pct[key]}
                  max={50}
                  onChange={(value) =>
                    patch({ pct: { ...params.pct, [key]: value } })
                  }
                />
                <NumberField
                  label={`${label} ${copy.rate}`}
                  value={params.rate[key]}
                  onChange={(value) =>
                    patch({ rate: { ...params.rate, [key]: value } })
                  }
                />
              </div>
            ))}
            <div className="quote-role">
              <span>{copy.roles.sa}</span>
              <span className="muted quote-dash">–</span>
              <NumberField
                label={`${copy.roles.sa} ${copy.rate}`}
                value={params.rate.sa}
                onChange={(value) =>
                  patch({ rate: { ...params.rate, sa: value } })
                }
              />
            </div>
            <div className="quote-role">
              <span>{copy.roles.dev}</span>
              <span className="muted quote-dash">–</span>
              <NumberField
                label={`${copy.roles.dev} ${copy.rate}`}
                value={params.rate.dev}
                onChange={(value) =>
                  patch({ rate: { ...params.rate, dev: value } })
                }
              />
            </div>
            <small className="muted">{copy.rolesHelp}</small>
          </div>
        </section>
        <div className="quote-right">
          <section className="doc-card quote-phases">
            <div
              className="quote-donut"
              style={{ background: `conic-gradient(${stops.join(', ')})` }}
              role="img"
              aria-label={`${mm(result.totalMM)} man-month`}
            >
              <div>
                <strong className="mono">{mm(result.totalMM)}</strong>
                <span>man-month</span>
              </div>
            </div>
            <div className="quote-phase-list">
              <h2>{copy.phaseTitle}</h2>
              {result.phases.map((phase) => (
                <div key={phase.id} className="quote-phase">
                  <span>
                    <i style={{ background: PHASE_COLORS[phase.id] }} />
                    {phaseName(phase.id)}
                    <b className="mono">
                      {mm(phase.mm)} MM · {yen(phase.cost)}
                    </b>
                  </span>
                  <span className="quote-bar" aria-hidden="true">
                    <i
                      style={{
                        width: `${(phase.mm / maxPhase) * 100}%`,
                        background: PHASE_COLORS[phase.id],
                      }}
                    />
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="doc-card quote-gantt">
            <header>
              <h2>{copy.scheduleTitle}</h2>
              <small>{copy.scheduleNote(params.devs, result.months)}</small>
            </header>
            {result.months > 12 && (
              <p className="muted quote-suggest">
                {copy.suggestDevs(Math.ceil(result.devMM / 12))}
              </p>
            )}
            <div className="quote-gantt-grid">
              <span />
              <div
                className="quote-months mono"
                style={{
                  gridTemplateColumns: `repeat(${result.months}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: result.months }, (_, i) => (
                  <span key={i}>{i % monthStep === 0 ? `T${i + 1}` : ''}</span>
                ))}
              </div>
              {result.schedule.map((row) => (
                <div key={row.id} className="quote-gantt-row">
                  <span>{phaseName(row.id)}</span>
                  <div className="quote-track">
                    <i
                      title={copy.monthsShort(row.end - row.start)}
                      style={{
                        left: `${(row.start / Math.max(result.months, 1)) * 100}%`,
                        width: `${((row.end - row.start) / Math.max(result.months, 1)) * 100}%`,
                        background: PHASE_COLORS[row.id],
                      }}
                    >
                      {copy.monthsShort(row.end - row.start)}
                    </i>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <section className="doc-card quote-adjust print-hide">
        <header>
          <h2>{copy.adjustTitle}</h2>
          <button
            type="button"
            className="button quote-reset"
            onClick={() => patch({ weights: undefined, unitDays: undefined })}
          >
            {copy.resetDefaults}
          </button>
        </header>
        <div className="quote-adjust-grid">
          <div className="quote-group">
            <span>
              <strong>{copy.scopeTitle}</strong> · {copy.scopeHelp}
            </span>
            {(['doc', 'test'] as const).map((id) => (
              <fieldset key={id} className="quote-scope">
                <legend>{copy.phases[id]}</legend>
                {QUOTE_SCOPE_ITEMS[id].map((item) => (
                  <label key={item}>
                    <input
                      type="checkbox"
                      checked={!params.excluded.includes(item)}
                      onChange={(event) =>
                        patch({
                          excluded: event.target.checked
                            ? params.excluded.filter((name) => name !== item)
                            : [...params.excluded, item],
                        })
                      }
                    />
                    {item}
                    <span className="quote-weight">
                      <NumberField
                        compact
                        label={`${item} %`}
                        value={effective.weights[item]}
                        onChange={(value) =>
                          patch({
                            weights: { ...params.weights, [item]: value },
                          })
                        }
                      />
                      <small className="muted">%</small>
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          <div className="quote-group">
            <span>
              <strong>{copy.unitDaysTitle}</strong> · {copy.unitDaysHelp}
            </span>
            <div className="quote-unit-grid">
              {unitRows.map((row) => (
                <label key={row.key} className="quote-unit-row">
                  <span>
                    {row.part}
                    <small className="muted"> / {row.unit}</small>
                  </span>
                  <NumberField
                    compact
                    label={`${row.part} / ${row.unit}`}
                    value={row.days}
                    onChange={(value) =>
                      patch({
                        unitDays: { ...params.unitDays, [row.key]: value },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="doc-card quote-table print-hide">
        <header>
          <h2>{copy.moduleTitle}</h2>
          <small>{copy.shareNote}</small>
        </header>
        <input
          className="quote-input"
          type="search"
          aria-label={copy.programFilter}
          placeholder={copy.programFilter}
          value={programFilter}
          onChange={(event) => setProgramFilter(event.target.value)}
        />
        <div className="quote-scroll quote-program-scroll">
          <table>
            <thead>
              <tr>
                <th>{copy.module}</th>
                <th className="num">{copy.programCount}</th>
                <th className="num">LoC</th>
                <th className="num">{copy.complexity}</th>
                <th className="num">{copy.effort}</th>
                <th className="num">{copy.cost}</th>
                <th>{copy.shareColumn}</th>
              </tr>
            </thead>
            <tbody>
              {result.modules.map((row) => {
                const children = result.rows.filter(
                  (program) =>
                    moduleOf(program.projectPath) === row.name &&
                    matches(program),
                );
                if (needle !== '' && children.length === 0) return null;
                const key = `m:${row.name}`;
                const expanded = needle !== '' || open.has(key);
                return (
                  <Fragment key={row.name}>
                    <tr
                      className={`quote-module-row${expanded ? ' open' : ''}`}
                      onClick={() => toggle(key)}
                    >
                      <td className="mono">
                        <button
                          type="button"
                          className="quote-toggle"
                          aria-expanded={expanded}
                          aria-label={`${moduleName(row.name)}: ${copy.toggleRow}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggle(key);
                          }}
                        >
                          <Chevron open={expanded} />
                        </button>
                        {moduleName(row.name)}
                      </td>
                      <td className="num mono">
                        {row.programs > 0 ? row.programs : '–'}
                      </td>
                      <td className="num mono">
                        {row.codeLines.toLocaleString('en-US')}
                      </td>
                      <td
                        className={`num mono cx-${row.score >= 70 ? 'high' : row.score >= 45 ? 'mid' : 'low'}`}
                      >
                        {row.programs > 0 ? row.score : '–'}
                      </td>
                      <td className="num mono">
                        <b>{mm(row.mm)}</b>
                      </td>
                      <td className="num mono">{yen(row.cost)}</td>
                      <td>
                        <span className="quote-bar" aria-hidden="true">
                          <i
                            style={{
                              width: `${(row.share / maxShare) * 100}%`,
                              background: '#5867D8',
                            }}
                          />
                        </span>
                      </td>
                    </tr>
                    {expanded &&
                      breakdown(row.share, 'module', moduleName(row.name))}
                    {expanded &&
                      children.map((program) => {
                        const programKey = `p:${program.projectPath}`;
                        const programOpen = open.has(programKey);
                        return (
                          <Fragment key={program.projectPath}>
                            <tr
                              className={`quote-program-row${programOpen ? ' open' : ''}`}
                              onClick={() => toggle(programKey)}
                            >
                              <td className="mono">
                                <button
                                  type="button"
                                  className="quote-toggle"
                                  aria-expanded={programOpen}
                                  aria-label={`${program.name}: ${copy.toggleRow}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    toggle(programKey);
                                  }}
                                >
                                  <Chevron open={programOpen} />
                                </button>
                                {program.name}
                              </td>
                              <td />
                              <td className="num mono">
                                {program.codeLines.toLocaleString('en-US')}
                              </td>
                              <td
                                className={`num mono cx-${program.score >= 70 ? 'high' : program.score >= 45 ? 'mid' : 'low'}`}
                              >
                                {program.score}
                              </td>
                              <td className="num mono">
                                <b>{mm(program.mm)}</b>
                              </td>
                              <td className="num mono">{yen(program.cost)}</td>
                              <td>
                                <span className="quote-bar" aria-hidden="true">
                                  <i
                                    style={{
                                      width: `${(program.share / maxShare) * 100}%`,
                                      background: '#5867D8',
                                    }}
                                  />
                                </span>
                              </td>
                            </tr>
                            {programOpen &&
                              breakdown(program.share, 'program', program.name)}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>{copy.total}</td>
                <td className="num mono">{result.programs}</td>
                <td className="num mono">
                  {result.codeLines.toLocaleString('en-US')}
                </td>
                <td className="num mono">{result.averageScore}</td>
                <td className="num mono strong">{mm(result.totalMM)}</td>
                <td className="num mono strong">{yen(result.totalCost)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <section className="doc-card quote-table quote-units">
        <header>
          <h2>{copy.formulaTitle}</h2>
        </header>
        <ol className="quote-formula-list">
          {formulaLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
        <h3>{copy.unitsTitle}</h3>
        <div className="quote-scroll">
          <table>
            <thead>
              <tr>
                <th>{copy.unitColumns.part}</th>
                <th>{copy.unitColumns.unit}</th>
                <th className="num">{copy.unitColumns.days}</th>
              </tr>
            </thead>
            <tbody>
              {unitRows.map((row) => (
                <tr key={row.part}>
                  <td>{row.part}</td>
                  <td>{row.unit}</td>
                  <td className="num mono">{row.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="doc-card quote-assumptions">
        <h2>{copy.assumptionsTitle}</h2>
        <ul>
          {copy.assumptions().map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
