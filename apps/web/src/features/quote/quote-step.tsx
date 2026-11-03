import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReviewBoard, SourceInventoryDocument } from '@portal/contracts';
import { Link, stepPath } from '../../app/router';
import type { ArtifactsApi } from '../../shared/api/artifacts-api';
import type { DocumentsApi } from '../../shared/api/documents-api';
import { useLocale } from '../../shared/i18n/locale-context';
import { useRunAssessment } from '../assessment/use-run-assessment';
import { runRequestErrorMessage } from '../jobs/run-messages';
import {
  computeQuote,
  DEFAULT_QUOTE_PARAMS,
  formatQuoteNumber,
  QUOTE_BASE,
  QUOTE_SCOPE_ITEMS,
  QUOTE_VALIDITY_DAYS,
  type QuoteParams,
  type QuotePhaseId,
  type QuoteProgram,
} from './quote-model';
import { buildXlsx, type Cell } from './xlsx';

// Step 5 (prototype tpl-Quote). A draft estimate of the programs that have
// approved documents; every number comes from stored analysis data and the
// parameters on this screen. Parameters and the quote number stay in this
// browser only.

const PHASE_COLORS: Record<QuotePhaseId, string> = {
  doc: '#8B5CD6',
  code: '#0077BE',
  test: '#C25E00',
  mgmt: '#D13F86',
};
const STORAGE_PREFIX = 'portal.quote.';

const yen = (value: number) => `¥${Math.round(value).toLocaleString('en-US')}`;
const mm = (value: number) => value.toFixed(1);

function readParams(projectId: string): QuoteParams {
  try {
    const saved = window.localStorage.getItem(STORAGE_PREFIX + projectId);
    if (saved)
      return {
        ...DEFAULT_QUOTE_PARAMS,
        ...(JSON.parse(saved) as Partial<QuoteParams>),
      };
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

function saveFile(name: string, bytes: Uint8Array<ArrayBuffer>) {
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function quotePrograms(
  inventory: SourceInventoryDocument,
  board: ReviewBoard,
): { programs: QuoteProgram[]; approvedDocuments: number } {
  const approved = new Map(
    board.programs
      .map(
        (program) =>
          [
            program.program,
            program.documents.filter((doc) => doc.status === 'approved').length,
          ] as const,
      )
      .filter(([, count]) => count > 0),
  );
  const programs = inventory.programs.flatMap((program): QuoteProgram[] => {
    if (!approved.has(program.projectPath) || !program.analysis) return [];
    const complexity =
      program.analysis.normalizedComplexity ?? program.analysis.complexity;
    return [
      {
        projectPath: program.projectPath,
        name: program.name ?? program.projectPath,
        codeLines: program.analysis.metrics.ownCodeLines,
        score: complexity.score,
        level: complexity.level,
      },
    ];
  });
  const included = new Set(programs.map((program) => program.projectPath));
  return {
    programs,
    approvedDocuments: [...approved.entries()]
      .filter(([key]) => included.has(key))
      .reduce((sum, [, count]) => sum + count, 0),
  };
}

function NumberField({
  label,
  value,
  onChange,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
}) {
  return (
    <input
      className="quote-input mono"
      type="number"
      min={0}
      max={max}
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
  documentsApi,
  artifactsApi,
}: {
  projectId: string;
  projectName: string;
  analysisRunId: string | null;
  headerSlot?: HTMLElement | null;
  eyebrowSlot?: HTMLElement | null;
  documentsApi: DocumentsApi;
  artifactsApi: ArtifactsApi;
}) {
  const { messages } = useLocale();
  const copy = messages.quote;
  const inventory = useRunAssessment(
    artifactsApi,
    projectId,
    analysisRunId ?? '',
  );
  const [board, setBoard] = useState<ReviewBoard | null>(null);
  const [boardError, setBoardError] = useState<unknown>(null);
  const [params, setParams] = useState<QuoteParams>(() =>
    readParams(projectId),
  );

  useEffect(() => {
    const controller = new AbortController();
    documentsApi.reviewBoard(projectId, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setBoard(result);
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setBoardError(error);
      },
    );
    return () => controller.abort();
  }, [documentsApi, projectId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_PREFIX + projectId,
        JSON.stringify(params),
      );
    } catch {
      // Storage may be blocked: parameters then last for this visit only.
    }
  }, [params, projectId]);

  const scope = useMemo(
    () =>
      board && inventory.state.status === 'ready'
        ? quotePrograms(inventory.state.artifact.payload, board)
        : null,
    [board, inventory.state],
  );
  const result = useMemo(
    () => (scope ? computeQuote(scope.programs, params) : null),
    [scope, params],
  );
  const hasQuote = (scope?.programs.length ?? 0) > 0;
  const [quoteNumber, setQuoteNumber] = useState('');
  useEffect(() => {
    if (hasQuote) setQuoteNumber(issueQuoteNumber(projectId));
  }, [hasQuote, projectId]);

  if (boardError !== null)
    return (
      <p role="alert" className="error">
        {runRequestErrorMessage(boardError, messages)}
      </p>
    );
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
          <Link className="button primary" to={stepPath(projectId, 'review')}>
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
  const maxShare = Math.max(...result.modules.map((m) => m.share), 0) || 1;
  const roleRows = (['pm', 'brse', 'comtor'] as const).map((key) => ({
    key,
    label: copy.roles[key],
  }));

  function exportExcel() {
    if (!result || !scope) return;
    const rows: Cell[][] = [
      [copy.title(projectName)],
      [copy.draft],
      [copy.quoteNumber, quoteNumber],
      [copy.validityDays, QUOTE_VALIDITY_DAYS],
      [],
      [copy.totalCost, Math.round(result.totalCost)],
      [copy.totalEffort, Number(mm(result.totalMM))],
      [copy.duration, result.months],
      [],
      [copy.phaseTitle, 'MM', copy.cost],
      ...result.phases.map((phase): Cell[] => [
        phaseName(phase.id),
        Number(mm(phase.mm)),
        Math.round(phase.cost),
      ]),
      [],
      [
        copy.module,
        copy.programCount,
        'LoC',
        copy.complexity,
        copy.factor,
        copy.effort,
        copy.cost,
      ],
      ...result.modules.map((row): Cell[] => [
        row.name,
        row.programs,
        row.codeLines,
        row.score,
        Number(row.factor.toFixed(2)),
        Number(mm(row.mm)),
        Math.round(row.cost),
      ]),
      [
        copy.total,
        result.programs,
        result.codeLines,
        result.averageScore,
        null,
        Number(mm(result.totalMM)),
        Math.round(result.totalCost),
      ],
      [],
      [copy.assumptionsTitle],
      ...copy
        .assumptions(QUOTE_BASE.productivity)
        .map((line): Cell[] => [line]),
    ];
    saveFile(`${quoteNumber || 'quote'}.xlsx`, buildXlsx('Quote', rows));
  }

  return (
    <div className="quote">
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
              onClick={() => window.print()}
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
        {copy.lead(result.programs, result.codeLines, scope.approvedDocuments)}
      </p>
      <p role="note" className="generate-note">
        {copy.draft}
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
                    <small className="muted mono">
                      {QUOTE_BASE.weights[item]}%
                    </small>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
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
          <div className="quote-formula">
            <strong>{copy.formulaTitle}</strong>
            {copy.formula.map((line) => (
              <code key={line}>{line}</code>
            ))}
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
            <div className="quote-gantt-grid">
              <span />
              <div
                className="quote-months mono"
                style={{
                  gridTemplateColumns: `repeat(${result.months}, minmax(0, 1fr))`,
                }}
              >
                {Array.from({ length: result.months }, (_, i) => (
                  <span key={i}>T{i + 1}</span>
                ))}
              </div>
              {result.schedule.map((row) => (
                <div key={row.id} className="quote-gantt-row">
                  <span>{phaseName(row.id)}</span>
                  <div className="quote-track">
                    <i
                      style={{
                        left: `${(row.start / Math.max(result.months, 1)) * 100}%`,
                        width: `${((row.end - row.start) / Math.max(result.months, 1)) * 100}%`,
                        background: PHASE_COLORS[row.id],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
      <section className="doc-card quote-table">
        <header>
          <h2>{copy.moduleTitle}</h2>
          <small>{copy.factorNote}</small>
        </header>
        <div className="quote-scroll">
          <table>
            <thead>
              <tr>
                <th>{copy.module}</th>
                <th className="num">{copy.programCount}</th>
                <th className="num">LoC</th>
                <th className="num">{copy.complexity}</th>
                <th className="num">{copy.factor}</th>
                <th className="num">{copy.effort}</th>
                <th className="num">{copy.cost}</th>
                <th>{copy.shareColumn}</th>
              </tr>
            </thead>
            <tbody>
              {result.modules.map((row) => (
                <tr key={row.name}>
                  <td className="mono">{row.name}</td>
                  <td className="num mono">{row.programs}</td>
                  <td className="num mono">
                    {row.codeLines.toLocaleString('en-US')}
                  </td>
                  <td
                    className={`num mono cx-${row.score >= 70 ? 'high' : row.score >= 45 ? 'mid' : 'low'}`}
                  >
                    {row.score}
                  </td>
                  <td className="num mono">×{row.factor.toFixed(2)}</td>
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
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{copy.total}</td>
                <td className="num mono">{result.programs}</td>
                <td className="num mono">
                  {result.codeLines.toLocaleString('en-US')}
                </td>
                <td className="num mono">{result.averageScore}</td>
                <td />
                <td className="num mono strong">{mm(result.totalMM)}</td>
                <td className="num mono strong">{yen(result.totalCost)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <section className="doc-card quote-assumptions">
        <h2>{copy.assumptionsTitle}</h2>
        <ul>
          {copy.assumptions(QUOTE_BASE.productivity).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
