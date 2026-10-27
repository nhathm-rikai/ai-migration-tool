import { useLocale } from '../../shared/i18n/locale-context';
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
      {complexity.needsReview && (
        <span className="badge review">{copy.needsReview}</span>
      )}
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
