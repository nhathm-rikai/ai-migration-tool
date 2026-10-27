import { useState } from 'react';
import {
  PutProjectSourceSchema,
  SOURCE_PROFILE_IDS,
  type ProjectSource,
  type PutProjectSourceInput,
  type SourceProfileId,
  type TableNameMapping,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { useLocale } from '../../shared/i18n/locale-context';
import { sourceErrorMessage } from './source-messages';
import type { ProjectSourceControl } from './use-project-source';

type MappingStatus = TableNameMapping['status'];
type FieldErrors = { rootPath: boolean; defaultSchema: boolean };

// Source of a local project (F01): what is registered and the form to
// register or change it. The UI only checks that fields are filled and well
// formed; the backend decides whether a path may be used.
export function SourcePanel({ control }: { control: ProjectSourceControl }) {
  const { messages, formatDateTime } = useLocale();
  const copy = messages.source;
  const { state } = control;
  const [editing, setEditing] = useState(false);

  if (state.status === 'loading')
    return (
      <section className="panel source-panel" aria-labelledby="source-title">
        <h2 id="source-title">{copy.title}</h2>
        <p role="status">{copy.loading}</p>
      </section>
    );
  if (state.status === 'error')
    return (
      <section className="panel source-panel" aria-labelledby="source-title">
        <h2 id="source-title">{copy.title}</h2>
        <p role="alert" className="error">
          {sourceErrorMessage(state.error, messages)}
        </p>
        <button className="button" onClick={control.refresh}>
          {copy.reload}
        </button>
      </section>
    );

  const source = state.source?.kind === 'local' ? state.source : null;
  const showForm = !source || editing;
  return (
    <section className="panel source-panel" aria-labelledby="source-title">
      <div className="section-heading">
        <h2 id="source-title">
          {copy.title}{' '}
          <span className="badge">{messages.projects.localBadge}</span>
        </h2>
        <button className="button small" onClick={control.refresh}>
          {copy.reload}
        </button>
      </div>
      {control.save.status === 'saved' && !editing && (
        <p role="status" className="success">
          {copy.form.saved}
        </p>
      )}
      {source ? (
        <SourceSummary source={source} formatDateTime={formatDateTime} />
      ) : (
        <p className="notice">{copy.unregistered}</p>
      )}
      {source && !editing && (
        <div className="form-actions">
          <button className="button" onClick={() => setEditing(true)}>
            {copy.form.edit}
          </button>
        </div>
      )}
      {showForm && (
        <SourceForm
          control={control}
          registered={source}
          onSaved={() => setEditing(false)}
          {...(source ? { onCancel: () => setEditing(false) } : {})}
        />
      )}
    </section>
  );
}

function SourceSummary({
  source,
  formatDateTime,
}: {
  source: Extract<ProjectSource, { kind: 'local' }>;
  formatDateTime: (date: string) => string;
}) {
  const { messages } = useLocale();
  const copy = messages.source;
  const { tableNameMapping: mapping } = source;
  return (
    <dl className="project-metadata">
      <div>
        <dt>{copy.fields.folder}</dt>
        <dd>{source.displayName}</dd>
      </div>
      <div>
        <dt>{copy.fields.status}</dt>
        <dd>
          <span
            className={`source-status status-${source.status}`}
            role="status"
          >
            {copy.status[source.status]}
          </span>
        </dd>
      </div>
      <div>
        <dt>{copy.fields.profile}</dt>
        <dd>{profileLabel(source.profileId, copy.profiles)}</dd>
      </div>
      <div>
        <dt>{copy.fields.defaultSchema}</dt>
        <dd>
          {mapping.defaultSchema !== null && (
            <span className="mono">{mapping.defaultSchema} </span>
          )}
          <span className="badge">{copy.mappingStatus[mapping.status]}</span>
        </dd>
      </div>
      <div>
        <dt>{copy.fields.revision}</dt>
        <dd>{source.revision}</dd>
      </div>
      <div>
        <dt>{copy.fields.checkedAt}</dt>
        <dd>{formatDateTime(source.checkedAt)}</dd>
      </div>
    </dl>
  );
}

function isKnownProfile(id: string): id is SourceProfileId {
  return SOURCE_PROFILE_IDS.some((known) => known === id);
}

// A profile this UI does not know yet is shown by its ID.
function profileLabel(
  id: string,
  labels: Record<SourceProfileId, string>,
): string {
  return isKnownProfile(id) ? labels[id] : id;
}

function SourceForm({
  control,
  registered,
  onSaved,
  onCancel,
}: {
  control: ProjectSourceControl;
  registered: Extract<ProjectSource, { kind: 'local' }> | null;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const { messages } = useLocale();
  const copy = messages.source;
  // Kept across failed saves, reloads and locale changes. The registered
  // path is never sent back by the API, so a change re-enters it.
  const [rootPath, setRootPath] = useState('');
  const [profileId, setProfileId] = useState<string>(
    registered?.profileId ?? SOURCE_PROFILE_IDS[0],
  );
  const [mappingStatus, setMappingStatus] = useState<MappingStatus>(
    registered?.tableNameMapping.status ?? 'unconfigured',
  );
  const [defaultSchema, setDefaultSchema] = useState(
    registered?.tableNameMapping.defaultSchema ?? '',
  );
  const [invalid, setInvalid] = useState<FieldErrors>({
    rootPath: false,
    defaultSchema: false,
  });
  const pending = control.save.status === 'pending';

  async function submit() {
    if (pending) return;
    const tableNameMapping: TableNameMapping =
      mappingStatus === 'unconfigured'
        ? { defaultSchema: null, status: 'unconfigured' }
        : { defaultSchema: defaultSchema.trim(), status: mappingStatus };
    const input: PutProjectSourceInput = {
      rootPath: rootPath.trim(),
      profileId,
      tableNameMapping,
      // The revision this form was opened on; a newer one answers 409.
      expectedSourceRevision: registered?.revision ?? null,
    };
    const errors = {
      rootPath: !Check(
        PutProjectSourceSchema.properties.rootPath,
        input.rootPath,
      ),
      defaultSchema:
        mappingStatus !== 'unconfigured' &&
        !Check(
          PutProjectSourceSchema.properties.tableNameMapping,
          tableNameMapping,
        ),
    };
    setInvalid(errors);
    if (errors.rootPath || errors.defaultSchema) return;
    if (await control.put(input)) {
      setRootPath('');
      onSaved();
    }
  }

  return (
    <form
      noValidate
      aria-labelledby="source-form-title"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h3 id="source-form-title">
        {registered ? copy.form.titleEdit : copy.form.titleNew}
      </h3>
      <label htmlFor="source-root">{copy.form.rootPath}</label>
      <input
        id="source-root"
        autoComplete="off"
        spellCheck={false}
        className="mono"
        value={rootPath}
        disabled={pending}
        aria-invalid={invalid.rootPath}
        aria-describedby={
          invalid.rootPath
            ? 'source-root-help source-root-error'
            : 'source-root-help'
        }
        onChange={(event) => {
          setRootPath(event.target.value);
          setInvalid((value) => ({ ...value, rootPath: false }));
        }}
      />
      <p className="field-help" id="source-root-help">
        {copy.form.rootPathHelp}
      </p>
      {invalid.rootPath && (
        <p id="source-root-error" role="alert" className="error">
          {copy.form.rootPathInvalid}
        </p>
      )}
      <label htmlFor="source-profile">{copy.form.profile}</label>
      <select
        id="source-profile"
        value={profileId}
        disabled={pending}
        onChange={(event) => setProfileId(event.target.value)}
      >
        {SOURCE_PROFILE_IDS.map((id) => (
          <option key={id} value={id}>
            {copy.profiles[id]}
          </option>
        ))}
      </select>
      <label htmlFor="source-mapping-status">{copy.form.mappingStatus}</label>
      <select
        id="source-mapping-status"
        value={mappingStatus}
        disabled={pending}
        onChange={(event) => {
          const value = event.target.value;
          if (
            value === 'unconfigured' ||
            value === 'assumed' ||
            value === 'confirmed'
          )
            setMappingStatus(value);
          setInvalid((errors) => ({ ...errors, defaultSchema: false }));
        }}
      >
        {(['unconfigured', 'assumed', 'confirmed'] as const).map((status) => (
          <option key={status} value={status}>
            {copy.mappingStatus[status]}
          </option>
        ))}
      </select>
      {mappingStatus !== 'unconfigured' && (
        <>
          <label htmlFor="source-schema">{copy.form.defaultSchema}</label>
          <input
            id="source-schema"
            autoComplete="off"
            spellCheck={false}
            className="mono"
            value={defaultSchema}
            disabled={pending}
            aria-invalid={invalid.defaultSchema}
            aria-describedby={
              invalid.defaultSchema
                ? 'source-schema-help source-schema-error'
                : 'source-schema-help'
            }
            onChange={(event) => {
              setDefaultSchema(event.target.value);
              setInvalid((value) => ({ ...value, defaultSchema: false }));
            }}
          />
          <p className="field-help" id="source-schema-help">
            {copy.form.defaultSchemaHelp}
          </p>
          {invalid.defaultSchema && (
            <p id="source-schema-error" role="alert" className="error">
              {copy.form.defaultSchemaInvalid}
            </p>
          )}
        </>
      )}
      {control.save.status === 'error' && (
        <p role="alert" className="error">
          {sourceErrorMessage(control.save.error, messages)}
        </p>
      )}
      <div className="form-actions">
        <button className="button primary" type="submit" disabled={pending}>
          {pending
            ? copy.form.pending
            : registered
              ? copy.form.update
              : copy.form.submit}
        </button>
        {onCancel && (
          <button
            className="button"
            type="button"
            disabled={pending}
            onClick={onCancel}
          >
            {copy.form.cancelEdit}
          </button>
        )}
      </div>
    </form>
  );
}
