import { branding } from '../../app/branding';
import { jaMessages } from '../../shared/i18n/ja';
import {
  effectiveBase,
  QUOTE_SCOPE_ITEMS,
  QUOTE_VALIDITY_DAYS,
  SHARED_MODULE,
  type QuoteItemId,
  type QuoteParams,
  type QuotePhaseId,
  type QuoteResult,
} from './quote-model';

// The quote as a printable A4 document (PDF through the browser's print
// dialog). It is built for paper, not copied from the screen, and always in
// Japanese because it goes to the customer. The content flows over as many
// pages as it needs; a table wraps the whole document so that its empty head
// and foot rows leave the page margins on every page without the browser's
// own header and footer (the page itself has no margin).

const copy = jaMessages.quote;

const PHASE_COLORS: Record<QuotePhaseId, string> = {
  doc: '#8B5CD6',
  code: '#0077BE',
  test: '#C25E00',
  mgmt: '#D13F86',
};

const GROUPS: { id: QuotePhaseId; items: QuoteItemId[] }[] = [
  { id: 'doc', items: ['BD', 'DD'] },
  { id: 'code', items: ['coding'] },
  { id: 'test', items: ['UT', 'IT', 'UAT support'] },
  { id: 'mgmt', items: ['pm', 'brse', 'comtor'] },
];

const yen = (value: number) => `¥${Math.round(value).toLocaleString('en-US')}`;
const mm2 = (value: number) => value.toFixed(2);
const int = (value: number) => value.toLocaleString('en-US');

export function QuoteDocument({
  projectName,
  quoteNumber,
  params,
  result,
}: {
  projectName: string;
  quoteNumber: string;
  params: QuoteParams;
  result: QuoteResult;
}) {
  const today = new Date().toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const base = effectiveBase(params);
  const itemOf = (id: QuoteItemId) =>
    result.items.find((item) => item.id === id) ?? { id, mm: 0, cost: 0 };
  const totalCost = result.totalCost || 1;

  // Timeline: months on the axis, a tick every month, quarter or year.
  const span = Math.max(
    result.months,
    ...result.schedule.map((entry) => entry.end),
    1,
  );
  const step = span <= 12 ? 1 : span <= 36 ? 3 : 12;
  const ticks = Array.from(
    { length: Math.floor(span / step) + 1 },
    (_, index) => index * step,
  );
  const at = (month: number) => `${(month / span) * 100}%`;

  const settings: [string, string][] = [
    ['対象コード行数', `${int(result.codeLines)} 行`],
    ['1 人月の人日', `${base.coding.daysPerMM} 人日`],
    ['開発者数', `${params.devs} 名`],
    ['AI 削減率（DD・コーディング）', `${params.aiCode}%`],
    ['AI 削減率（テスト）', `${params.aiTest}%`],
  ];
  const ratios: [string, string][] = [
    ...[...QUOTE_SCOPE_ITEMS.doc, ...QUOTE_SCOPE_ITEMS.test].map(
      (item): [string, string] => [
        copy.items[item],
        params.excluded.includes(item) ? '対象外' : `${base.weights[item]}%`,
      ],
    ),
    ...(['pm', 'brse', 'comtor'] as const).map((key): [string, string] => [
      copy.roles[key],
      `${params.pct[key]}%`,
    ]),
  ];
  const rates: [string, string][] = [
    [copy.roles.sa, yen(params.rate.sa)],
    [copy.roles.dev, yen(params.rate.dev)],
    ...(['pm', 'brse', 'comtor'] as const).map((key): [string, string] => [
      copy.roles[key],
      yen(params.rate[key]),
    ]),
  ];
  const pairs = (rows: [string, string][]) => (
    <table className="qd-table qd-compact">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td>{label}</td>
            <td className="num">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="quote-doc-root" aria-hidden="true">
      <header className="qd-head">
        <img src={branding.logoUrl} alt={branding.logoAlt} />
        <div>
          <h1>{copy.title(projectName)}</h1>
          <p>
            {copy.quoteNumber}: {quoteNumber} · {today} ·{' '}
            {copy.validity(QUOTE_VALIDITY_DAYS)}
          </p>
        </div>
      </header>

      <div className="qd-kpis">
        <div className="qd-kpi main">
          <span>{copy.totalCost}</span>
          <b>{yen(result.totalCost)}</b>
          <small>{copy.costNote}</small>
        </div>
        <div className="qd-kpi">
          <span>{copy.totalEffort}</span>
          <b>{mm2(result.totalMM)} MM</b>
          <small>
            Dev {mm2(result.devMM)} + PM/BrSE/Comtor {mm2(result.mgmtMM)}
          </small>
        </div>
        <div className="qd-kpi">
          <span>{copy.duration}</span>
          <b>{copy.months(result.months)}</b>
          <small>{result.programs} プログラム</small>
        </div>
        <div className="qd-kpi">
          <span>{copy.devs}</span>
          <b>{params.devs} 名</b>
          <small>{copy.devsHelp}</small>
        </div>
      </div>

      <section className="qd-block">
        <h2>{copy.scheduleTitle}</h2>
        <div className="qd-gantt">
          {result.schedule.map((entry) => (
            <div className="qd-gantt-row" key={entry.id}>
              <span>{copy.phases[entry.id]}</span>
              <div className="qd-gantt-track">
                {ticks.map((tick) => (
                  <i
                    className="qd-gantt-grid"
                    key={tick}
                    style={{ left: at(tick) }}
                  />
                ))}
                <b
                  style={{
                    left: at(entry.start),
                    width: `max(1.5%, ${((entry.end - entry.start) / span) * 100}%)`,
                    background: PHASE_COLORS[entry.id],
                  }}
                >
                  {copy.monthsShort(entry.end - entry.start)}
                </b>
              </div>
            </div>
          ))}
          <div className="qd-gantt-row">
            <span />
            <div className="qd-gantt-axis">
              {ticks.map((tick) => (
                <em key={tick} style={{ left: at(tick) }}>
                  {tick}
                </em>
              ))}
            </div>
          </div>
        </div>
        <p className="qd-note">
          {copy.scheduleNote(params.devs, result.months)}
        </p>
      </section>

      <section className="qd-block">
        <h2>{copy.paramsTitle}</h2>
        <div className="qd-cols">
          <div>
            <h3>設定</h3>
            {pairs(settings)}
          </div>
          <div>
            <h3>{copy.scopeHelp}</h3>
            {pairs(ratios)}
          </div>
          <div>
            <h3>{copy.rolesTitle}（円 / 人月）</h3>
            {pairs(rates)}
          </div>
        </div>
      </section>

      <section className="qd-block">
        <h2>{copy.itemsTitle}</h2>
        <div className="qd-bar" aria-hidden="true">
          {result.phases.map((phase) => (
            <i
              key={phase.id}
              style={{
                width: `${(phase.cost / totalCost) * 100}%`,
                background: PHASE_COLORS[phase.id],
              }}
            />
          ))}
        </div>
        <ul className="qd-legend">
          {result.phases.map((phase) => (
            <li key={phase.id}>
              <i style={{ background: PHASE_COLORS[phase.id] }} />
              {copy.phases[phase.id]}{' '}
              <b>{Math.round((phase.cost / totalCost) * 100)}%</b>
            </li>
          ))}
        </ul>
        <table className="qd-table">
          <thead>
            <tr>
              <th>{copy.phaseTitle}</th>
              <th>{copy.itemsTitle}</th>
              <th className="num">{copy.effort}</th>
              <th className="num">単価（円 / 人月）</th>
              <th className="num">{copy.cost}</th>
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((group) => {
              const items = group.items.map(itemOf);
              const cost = items.reduce((sum, i) => sum + i.cost, 0);
              const effort = items.reduce((sum, i) => sum + i.mm, 0);
              return [
                ...items.map((item, index) => (
                  <tr key={`${group.id}-${item.id}`}>
                    {index === 0 && (
                      <td rowSpan={items.length + 1} className="qd-group">
                        <i style={{ background: PHASE_COLORS[group.id] }} />
                        {copy.phases[group.id]}
                      </td>
                    )}
                    <td>{copy.items[item.id]}</td>
                    <td className="num">{mm2(item.mm)}</td>
                    <td className="num">
                      {item.mm > 0 ? yen(item.cost / item.mm) : '–'}
                    </td>
                    <td className="num">{yen(item.cost)}</td>
                  </tr>
                )),
                <tr key={`${group.id}-sum`} className="qd-sub">
                  <td>小計</td>
                  <td className="num">{mm2(effort)}</td>
                  <td />
                  <td className="num">{yen(cost)}</td>
                </tr>,
              ];
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>{copy.total}</td>
              <td className="num">{mm2(result.totalMM)}</td>
              <td className="num">
                {result.totalMM > 0
                  ? yen(result.totalCost / result.totalMM)
                  : '–'}
              </td>
              <td className="num">{yen(result.totalCost)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="qd-block qd-flow">
        <h2>{copy.moduleTitle}</h2>
        <table className="qd-table">
          <thead>
            <tr>
              <th>{copy.module}</th>
              <th className="num">{copy.programCount}</th>
              <th className="num">LoC</th>
              <th className="num">{copy.effort}</th>
              <th className="num">構成比</th>
              <th className="num">{copy.cost}</th>
            </tr>
          </thead>
          <tbody>
            {result.modules.map((row) => (
              <tr key={row.name}>
                <td>
                  {row.name === SHARED_MODULE ? copy.sharedModule : row.name}
                </td>
                <td className="num">{row.programs}</td>
                <td className="num">{int(row.codeLines)}</td>
                <td className="num">{mm2(row.mm)}</td>
                <td className="num">{(row.share * 100).toFixed(1)}%</td>
                <td className="num">{yen(row.cost)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{copy.total}</td>
              <td className="num">{result.programs}</td>
              <td className="num">{int(result.codeLines)}</td>
              <td className="num">{mm2(result.totalMM)}</td>
              <td className="num">100%</td>
              <td className="num">{yen(result.totalCost)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="qd-note">
          {copy.costNote} · {copy.validity(QUOTE_VALIDITY_DAYS)}
        </p>
      </section>

      <section className="qd-block">
        <h2>{copy.assumptionsTitle}</h2>
        <ul className="qd-notes">
          {copy.assumptions().map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
