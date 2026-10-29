import { useLocale } from '../../shared/i18n/locale-context';
import type { EffectiveMapping } from './table-mapping';
import type {
  ComplexityLevel,
  ComplexityView,
  ProgramState,
} from './assessment-summary';

// Colored tags for complexity level and program state. The color only
// repeats what the text says (FE-07): the label and score are always shown.

const STATE_TONE: Record<ProgramState, ComplexityLevel> = {
  complete: 'low',
  partial: 'medium',
  unsupported: 'high',
};

export function ComplexityTag({
  level,
  score,
}: {
  level: ComplexityLevel;
  score: number;
}) {
  const { messages } = useLocale();
  return (
    <span className={`tag tag-${level}`}>
      {messages.assessment.programs.level[level]} · {score}
    </span>
  );
}

export function ComplexityCell({
  complexity,
}: {
  complexity: ComplexityView | null;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.programs;
  if (!complexity) return <>{copy.notAnalyzed}</>;
  return (
    <span className="tag-group">
      <ComplexityTag level={complexity.level} score={complexity.score} />
      {complexity.draft && <span className="badge">{copy.draft}</span>}
    </span>
  );
}

export function ProgramStateTag({ state }: { state: ProgramState }) {
  const { messages } = useLocale();
  return (
    <span className={`tag tag-${STATE_TONE[state]}`}>
      {messages.assessment.programs.state[state]}
    </span>
  );
}

// Status of the table name mapping behind the "after mapping" views; an
// inferred schema is always named as an assumption.
export function MappingStatus({
  mapping,
  stored,
}: {
  mapping: EffectiveMapping;
  // False for an inventory written before table name mapping existed.
  stored: boolean;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment;
  if (mapping.inferred && mapping.defaultSchema)
    return <>{copy.mappingInferred(mapping.defaultSchema)}</>;
  if (!stored && !mapping.defaultSchema) return <>{copy.mapping.absent}</>;
  return (
    <>
      {copy.mapping[mapping.status]}
      {mapping.defaultSchema && (
        <span className="mono"> ({mapping.defaultSchema})</span>
      )}
    </>
  );
}

// One line above a CRUD table: which names are shown and a link to the
// other view (F04-AC01). The mapped view says which mapping it assumes;
// without a mapped view only the names as written exist.
export function TableNameView({
  view,
  mappedAvailable,
  mapping,
  stored,
  onChange,
}: {
  view: 'raw' | 'mapped';
  mappedAvailable: boolean;
  mapping: EffectiveMapping;
  stored: boolean;
  onChange: (view: 'raw' | 'mapped') => void;
}) {
  const { messages } = useLocale();
  const copy = messages.assessment.detail;
  const shown = view === 'mapped' && mappedAvailable ? 'mapped' : 'raw';
  return (
    <p className="muted table-name-view" role="note">
      {shown === 'mapped' ? (
        <MappingStatus mapping={mapping} stored={stored} />
      ) : (
        <>
          {copy.crudViews.raw}
          {!mappedAvailable && (
            <>
              {' · '}
              <MappingStatus mapping={mapping} stored={stored} />
            </>
          )}
        </>
      )}
      {mappedAvailable && (
        <>
          {' · '}
          <button
            className="link-button"
            onClick={() => onChange(shown === 'mapped' ? 'raw' : 'mapped')}
          >
            {shown === 'mapped' ? copy.showRaw : copy.showMapped}
          </button>
        </>
      )}
    </p>
  );
}
