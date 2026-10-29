import { useEffect, useRef, useState } from 'react';
import {
  CreateProjectSchema,
  PROJECT_FIXTURE_ID,
  PROJECT_LOCAL_MODE,
  type CreateProjectInput,
  type Project,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import type { ProjectsApi } from '../../shared/api/projects-api';
import { projectErrorMessage } from './project-messages';
import { Icon } from '../../shared/ui/icon';
import { useLocale } from '../../shared/i18n/locale-context';

export function CreateProjectForm({
  api,
  onCreated,
}: {
  api: ProjectsApi;
  onCreated: (project: Project) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.projects.create;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'demo' | 'local'>('local');
  const [fieldInvalid, setFieldInvalid] = useState(false);
  const [submitFailure, setSubmitFailure] = useState<{ error: unknown } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function submit() {
    if (active.current) return;
    const input: CreateProjectInput =
      kind === 'demo'
        ? { name: name.trim(), fixtureId: PROJECT_FIXTURE_ID }
        : { name: name.trim(), mode: PROJECT_LOCAL_MODE };
    setSubmitFailure(null);
    if (!Check(CreateProjectSchema, input)) {
      setFieldInvalid(true);
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setFieldInvalid(false);
    try {
      const project = await api.create(input, controller.signal);
      if (!controller.signal.aborted) {
        setName('');
        onCreated(project);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setSubmitFailure({ error: failure });
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
        active.current = null;
      }
    }
  }
  return (
    <section className="panel create-panel" aria-labelledby="create-title">
      <span className="eyebrow">{copy.eyebrow}</span>
      <h2 id="create-title">{messages.projects.createNew}</h2>
      <p className="muted">{copy.description}</p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        aria-busy={pending}
      >
        <label htmlFor="project-name">{copy.name}</label>
        <input
          id="project-name"
          autoComplete="off"
          placeholder={copy.placeholder}
          value={name}
          disabled={pending}
          aria-invalid={fieldInvalid}
          aria-describedby={
            fieldInvalid ? 'name-help create-field-error' : 'name-help'
          }
          onChange={(event) => {
            setName(event.target.value);
            setFieldInvalid(false);
          }}
        />
        <p className="field-help" id="name-help">
          {copy.nameHelp}
        </p>
        <fieldset className="project-kind" disabled={pending}>
          <legend>{copy.kind}</legend>
          <label className="fixture-card">
            <input
              type="radio"
              name="project-kind"
              value="local"
              checked={kind === 'local'}
              onChange={() => setKind('local')}
            />
            <span className="fixture-icon">
              <Icon name="folder" />
            </span>
            <span>
              <strong>{copy.kindLocal}</strong>
              <span className="field-help">{copy.kindLocalDescription}</span>
            </span>
          </label>
          <label className="fixture-card">
            <input
              type="radio"
              name="project-kind"
              value="demo"
              checked={kind === 'demo'}
              onChange={() => setKind('demo')}
            />
            <span className="fixture-icon">
              <Icon name="folder" />
            </span>
            <span>
              <strong>{copy.kindDemo}</strong>
              <span className="field-help">
                {PROJECT_FIXTURE_ID} · {copy.sampleDescription}
              </span>
            </span>
          </label>
        </fieldset>
        {fieldInvalid && (
          <p id="create-field-error" role="alert" className="error">
            {copy.nameInvalid}
          </p>
        )}
        {submitFailure && (
          <p role="alert" className="error">
            {projectErrorMessage(
              submitFailure.error,
              'create',
              messages.errors,
            )}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary" disabled={pending} type="submit">
            {pending ? copy.pending : copy.submit}
          </button>
        </div>
      </form>
      <p className="field-help">{copy.savedLocally}</p>
    </section>
  );
}
