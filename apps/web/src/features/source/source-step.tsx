import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FIXTURE_SOURCE_REVISION,
  PutProjectSourceSchema,
  SOURCE_PROFILE_IDS,
  UpdateProjectSchema,
  type Project,
  type ProjectSource,
  type TableNameMapping,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import type { ProjectsApi } from '../../shared/api/projects-api';
import type { RunsApi } from '../../shared/api/runs-api';
import type { SourcesApi } from '../../shared/api/sources-api';
import { useLocale } from '../../shared/i18n/locale-context';
import { projectErrorMessage } from '../projects/project-messages';
import { RunHistory } from '../jobs/run-history';
import { ScanStage, type ScanSource } from '../jobs/scan-stage';
import { isActiveRun, useAnalyzeRuns } from '../jobs/use-analyze-runs';
import { sourceErrorMessage } from './source-messages';
import { startableRevision, useProjectSource } from './use-project-source';

// Step 1 "Nạp source" (UI04): scan card, project information (name,
// customer, source folder, analysis language) and run history; the caller
// places the recent projects beside it.
//
// "Bắt đầu phân tích" saves what changed first (project PATCH, source PUT)
// and only then starts a run on the revision that save returned. Nothing
// here runs on open, reload or locale change. The registered path never
// comes back from the API, so an empty path field keeps the registered one.

type MappingStatus = TableNameMapping['status'];
type FieldErrors = {
  name: boolean;
  customerName: boolean;
  rootPath: 'required' | 'reenter' | 'invalid' | null;
  defaultSchema: boolean;
};
const NO_ERRORS: FieldErrors = {
  name: false,
  customerName: false,
  rootPath: null,
  defaultSchema: false,
};

type InfoSave =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'error'; error: unknown };

// Language chips of demo02. Only VB6 has an analysis profile; the others
// are listed as coming and cannot be chosen.
const COMING_LANGUAGES = [
  'Java',
  'C#',
  'PHP',
  'PL/SQL',
  'COBOL',
  'JavaScript',
] as const;

export function SourceStep({
  project,
  api,
  runsApi,
  sourcesApi,
  aside,
  onProjectChange,
  onProgress,
  onOpenResults,
}: {
  project: Project;
  api: ProjectsApi;
  runsApi: RunsApi;
  sourcesApi: SourcesApi;
  // Shown beside the step (recent projects).
  aside?: ReactNode;
  // A saved name or customer; the shell shows it without re-reading.
  onProjectChange: (project: Project) => void;
  // A source was saved or a run started or ended: step marks re-read.
  onProgress: () => void;
  onOpenResults: (runId: string) => void;
}) {
  const demo = project.mode === 'demo';
  const source = useProjectSource(sourcesApi, project.id, !demo);
  const revision = demo
    ? FIXTURE_SOURCE_REVISION
    : startableRevision(source.state);
  const runs = useAnalyzeRuns(runsApi, project.id, revision);

  // Report run starts and ends after the first read, as the run panel did.
  const current = runs.state.status === 'ready' ? runs.state.current : null;
  const activeRunId =
    current && isActiveRun(current.status) ? current.id : null;
  const lastActive = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (runs.state.status !== 'ready') return;
    if (lastActive.current !== undefined && lastActive.current !== activeRunId)
      onProgress();
    lastActive.current = activeRunId;
  }, [runs.state.status, activeRunId, onProgress]);
  const sourceSaved = source.save.status === 'saved';
  useEffect(() => {
    if (sourceSaved) onProgress();
  }, [sourceSaved, onProgress]);

  // Form values. Kept across failed saves, reloads and locale changes.
  const [name, setName] = useState(project.name);
  const [customerName, setCustomerName] = useState(project.customerName ?? '');
  const [rootPath, setRootPath] = useState('');
  // null: as registered (or unconfigured when nothing is registered).
  const [mappingStatus, setMappingStatus] = useState<MappingStatus | null>(
    null,
  );
  const [defaultSchema, setDefaultSchema] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<FieldErrors>(NO_ERRORS);
  const [infoSave, setInfoSave] = useState<InfoSave>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);

  const registered =
    source.state.status === 'ready' && source.state.source?.kind === 'local'
      ? source.state.source
      : null;
  const shownMapping = mappingStatus ?? registered?.tableNameMapping.status;
  const mapping: MappingStatus = shownMapping ?? 'unconfigured';
  const schema =
    defaultSchema ?? registered?.tableNameMapping.defaultSchema ?? '';
  const mappingChanged =
    !demo &&
    (mapping !== (registered?.tableNameMapping.status ?? 'unconfigured') ||
      (mapping !== 'unconfigured' &&
        schema.trim() !== (registered?.tableNameMapping.defaultSchema ?? '')));
  const pathGiven = !demo && rootPath.trim() !== '';
  const canStart = revision !== null || pathGiven;

  function validate(forStart: boolean): FieldErrors | null {
    const trimmedName = name.trim();
    const trimmedCustomer = customerName.trim();
    const errors: FieldErrors = {
      name: !Check(UpdateProjectSchema, { name: trimmedName }),
      customerName:
        trimmedCustomer !== '' &&
        !Check(UpdateProjectSchema, { customerName: trimmedCustomer }),
      rootPath: null,
      defaultSchema: false,
    };
    if (!demo) {
      if (pathGiven) {
        if (!Check(PutProjectSourceSchema.properties.rootPath, rootPath.trim()))
          errors.rootPath = 'invalid';
      } else if (mappingChanged) errors.rootPath = 'reenter';
      else if (forStart && revision === null) errors.rootPath = 'required';
      errors.defaultSchema =
        mapping !== 'unconfigured' &&
        (pathGiven || mappingChanged) &&
        !Check(PutProjectSourceSchema.properties.tableNameMapping, {
          defaultSchema: schema.trim(),
          status: mapping,
        });
    }
    setInvalid(errors);
    return errors.name ||
      errors.customerName ||
      errors.rootPath ||
      errors.defaultSchema
      ? null
      : errors;
  }

  // Saves what changed; resolves the revision a run may lock (null: not
  // saved, or no readable source), or undefined when a save failed.
  async function save(forStart: boolean): Promise<number | null | undefined> {
    if (!validate(forStart)) return undefined;
    const trimmedName = name.trim();
    const trimmedCustomer = customerName.trim();
    if (
      trimmedName !== project.name ||
      trimmedCustomer !== (project.customerName ?? '')
    ) {
      const controller = new AbortController();
      mutation.current = controller;
      try {
        const saved = await api.update(
          project.id,
          { name: trimmedName, customerName: trimmedCustomer || null },
          controller.signal,
        );
        if (controller.signal.aborted) return undefined;
        setInfoSave({ status: 'saved' });
        onProjectChange(saved);
      } catch (error) {
        if (!controller.signal.aborted) setInfoSave({ status: 'error', error });
        return undefined;
      }
    }
    if (!pathGiven) return revision;
    const tableNameMapping: TableNameMapping =
      mapping === 'unconfigured'
        ? { defaultSchema: null, status: 'unconfigured' }
        : { defaultSchema: schema.trim(), status: mapping };
    const saved: ProjectSource | null = await source.put({
      rootPath: rootPath.trim(),
      profileId: SOURCE_PROFILE_IDS[0],
      tableNameMapping,
      // The revision this page read; a newer one answers 409.
      expectedSourceRevision: registered?.revision ?? null,
    });
    if (!saved) return undefined;
    setRootPath('');
    setMappingStatus(null);
    setDefaultSchema(null);
    return saved.kind === 'local' && saved.status === 'ready'
      ? saved.revision
      : null;
  }

  async function submit(intent: 'save' | 'start', retryOfRunId?: string) {
    if (busy.current) return;
    // A Start whose outcome is unknown is resent as it was: nothing else
    // is saved or changed before it.
    if (intent === 'start' && runs.uncertainStart) {
      void runs.start();
      return;
    }
    busy.current = true;
    setSaving(true);
    setInfoSave({ status: 'idle' });
    try {
      const locked = await save(intent === 'start');
      if (intent !== 'start' || locked === undefined || locked === null) return;
      if (retryOfRunId) await runs.retry(retryOfRunId, locked);
      else await runs.start(locked);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  const scanSource: ScanSource = demo
    ? { status: 'demo' }
    : source.state.status === 'loading'
      ? { status: 'loading' }
      : registered
        ? { status: registered.status, folder: registered.displayName }
        : { status: 'none' };

  return (
    <div className="source-step">
      <div className="source-main">
        <ScanStage
          runs={runs}
          source={scanSource}
          canStart={canStart}
          starting={saving}
          onStart={(retryOf) => void submit('start', retryOf ?? undefined)}
          onOpenResults={onOpenResults}
        />
        <ProjectInfoForm
          demo={demo}
          fixtureId={project.mode === 'demo' ? project.fixtureId : null}
          source={source}
          registered={registered}
          values={{ name, customerName, rootPath, mapping, schema }}
          onChange={{
            name: (value) => {
              setName(value);
              setInvalid((errors) => ({ ...errors, name: false }));
            },
            customerName: (value) => {
              setCustomerName(value);
              setInvalid((errors) => ({ ...errors, customerName: false }));
            },
            rootPath: (value) => {
              setRootPath(value);
              setInvalid((errors) => ({ ...errors, rootPath: null }));
            },
            mapping: (value) => {
              setMappingStatus(value);
              setInvalid((errors) => ({ ...errors, defaultSchema: false }));
            },
            schema: (value) => {
              setDefaultSchema(value);
              setInvalid((errors) => ({ ...errors, defaultSchema: false }));
            },
          }}
          invalid={invalid}
          infoSave={infoSave}
          saving={saving}
          onSave={() => void submit('save')}
        />
        <RunHistory
          runs={runs}
          demo={demo}
          canStart={revision !== null}
          onOpenResults={onOpenResults}
        />
      </div>
      {aside}
    </div>
  );
}

type Values = {
  name: string;
  customerName: string;
  rootPath: string;
  mapping: MappingStatus;
  schema: string;
};

function ProjectInfoForm({
  demo,
  fixtureId,
  source,
  registered,
  values,
  onChange,
  invalid,
  infoSave,
  saving,
  onSave,
}: {
  demo: boolean;
  fixtureId: string | null;
  source: ReturnType<typeof useProjectSource>;
  registered: Extract<ProjectSource, { kind: 'local' }> | null;
  values: Values;
  onChange: { [K in keyof Values]: (value: Values[K]) => void };
  invalid: FieldErrors;
  infoSave: InfoSave;
  saving: boolean;
  onSave: () => void;
}) {
  const { messages } = useLocale();
  const copy = messages.sourceStep.form;
  const sourceCopy = messages.source;
  const pending = saving || source.save.status === 'pending';
  const rootPathError =
    invalid.rootPath === 'required'
      ? copy.folderRequired
      : invalid.rootPath === 'reenter'
        ? copy.folderReenter
        : invalid.rootPath === 'invalid'
          ? sourceCopy.form.rootPathInvalid
          : null;
  return (
    <form
      className="panel project-info"
      noValidate
      aria-labelledby="project-info-title"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="section-heading">
        <h2 id="project-info-title">{copy.title}</h2>
        {!demo && (
          <button
            type="button"
            className="button small"
            onClick={source.refresh}
          >
            {sourceCopy.reload}
          </button>
        )}
      </div>
      {infoSave.status === 'saved' && (
        <p role="status" className="success">
          {copy.saved}
        </p>
      )}
      {source.save.status === 'saved' && (
        <p role="status" className="success">
          {sourceCopy.form.saved}
        </p>
      )}
      <div className="field-grid">
        <div>
          <label htmlFor="project-name">{copy.name}</label>
          <input
            id="project-name"
            autoComplete="off"
            value={values.name}
            disabled={pending}
            aria-invalid={invalid.name}
            aria-describedby={invalid.name ? 'project-name-error' : undefined}
            onChange={(event) => onChange.name(event.target.value)}
          />
          {invalid.name && (
            <p id="project-name-error" role="alert" className="error">
              {messages.projects.create.nameInvalid}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="project-customer">{copy.customer}</label>
          <input
            id="project-customer"
            autoComplete="off"
            value={values.customerName}
            disabled={pending}
            aria-invalid={invalid.customerName}
            aria-describedby={
              invalid.customerName
                ? 'project-customer-help project-customer-error'
                : 'project-customer-help'
            }
            onChange={(event) => onChange.customerName(event.target.value)}
          />
          <p className="field-help" id="project-customer-help">
            {copy.customerHelp}
          </p>
          {invalid.customerName && (
            <p id="project-customer-error" role="alert" className="error">
              {copy.customerInvalid}
            </p>
          )}
        </div>
      </div>
      {infoSave.status === 'error' && (
        <p role="alert" className="error">
          {projectErrorMessage(infoSave.error, 'update', messages.errors)}
        </p>
      )}
      {demo ? (
        <div className="field">
          <span className="field-label">{copy.folder}</span>
          <p className="folder-fixed mono">
            {copy.demoFolder(fixtureId ?? '')}
          </p>
        </div>
      ) : (
        <SourceFields
          source={source}
          registered={registered}
          values={values}
          onChange={onChange}
          invalid={invalid}
          rootPathError={rootPathError}
          pending={pending}
        />
      )}
      <fieldset className="language-chips">
        <legend>{copy.language}</legend>
        <label className="language-chip selected">
          <input type="radio" name="analysis-language" checked readOnly />
          <span>VB6</span>
        </label>
        {COMING_LANGUAGES.map((language) => (
          <label key={language} className="language-chip coming">
            <input type="radio" name="analysis-language" disabled />
            <span>{language}</span>
            <span className="chip-note">{copy.comingSoon}</span>
          </label>
        ))}
      </fieldset>
      <div className="form-actions">
        <button className="button" type="submit" disabled={pending}>
          {pending ? copy.saving : copy.save}
        </button>
      </div>
    </form>
  );
}

function SourceFields({
  source,
  registered,
  values,
  onChange,
  invalid,
  rootPathError,
  pending,
}: {
  source: ReturnType<typeof useProjectSource>;
  registered: Extract<ProjectSource, { kind: 'local' }> | null;
  values: Values;
  onChange: { [K in keyof Values]: (value: Values[K]) => void };
  invalid: FieldErrors;
  rootPathError: string | null;
  pending: boolean;
}) {
  const { messages } = useLocale();
  const copy = messages.sourceStep.form;
  const sourceCopy = messages.source;
  const { state } = source;
  const describedBy = ['source-root-help'];
  if (rootPathError) describedBy.push('source-root-error');
  return (
    <div className="field">
      <label htmlFor="source-root">{copy.folder}</label>
      {state.status === 'loading' && (
        <p role="status" className="muted">
          {sourceCopy.loading}
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="error">
          {sourceErrorMessage(state.error, messages)}
        </p>
      )}
      {registered && (
        <p className="registered-folder">
          <span className="muted">{copy.registered}:</span>{' '}
          <span className="mono">{registered.displayName}</span>{' '}
          <span className={`source-status status-${registered.status}`}>
            {sourceCopy.status[registered.status]}
          </span>
        </p>
      )}
      <input
        id="source-root"
        autoComplete="off"
        spellCheck={false}
        className="mono"
        value={values.rootPath}
        disabled={pending}
        aria-invalid={invalid.rootPath !== null}
        aria-describedby={describedBy.join(' ')}
        onChange={(event) => onChange.rootPath(event.target.value)}
      />
      <p className="field-help" id="source-root-help">
        {registered ? `${copy.keepFolder} ` : ''}
        {sourceCopy.form.rootPathHelp}
      </p>
      {rootPathError && (
        <p id="source-root-error" role="alert" className="error">
          {rootPathError}
        </p>
      )}
      {source.save.status === 'error' && (
        <p role="alert" className="error">
          {sourceErrorMessage(source.save.error, messages)}
        </p>
      )}
      {/* Opens by itself when its field needs attention. */}
      <details
        className="technical mapping-fields"
        open={invalid.defaultSchema || undefined}
      >
        <summary>{copy.mapping}</summary>
        <label htmlFor="source-mapping-status">
          {sourceCopy.form.mappingStatus}
        </label>
        <select
          id="source-mapping-status"
          value={values.mapping}
          disabled={pending}
          onChange={(event) => {
            const value = event.target.value;
            if (
              value === 'unconfigured' ||
              value === 'assumed' ||
              value === 'confirmed'
            )
              onChange.mapping(value);
          }}
        >
          {(['unconfigured', 'assumed', 'confirmed'] as const).map((status) => (
            <option key={status} value={status}>
              {sourceCopy.mappingStatus[status]}
            </option>
          ))}
        </select>
        {values.mapping !== 'unconfigured' && (
          <>
            <label htmlFor="source-schema">
              {sourceCopy.form.defaultSchema}
            </label>
            <input
              id="source-schema"
              autoComplete="off"
              spellCheck={false}
              className="mono"
              value={values.schema}
              disabled={pending}
              aria-invalid={invalid.defaultSchema}
              aria-describedby={
                invalid.defaultSchema
                  ? 'source-schema-help source-schema-error'
                  : 'source-schema-help'
              }
              onChange={(event) => onChange.schema(event.target.value)}
            />
            <p className="field-help" id="source-schema-help">
              {sourceCopy.form.defaultSchemaHelp}
            </p>
            {invalid.defaultSchema && (
              <p id="source-schema-error" role="alert" className="error">
                {sourceCopy.form.defaultSchemaInvalid}
              </p>
            )}
          </>
        )}
      </details>
    </div>
  );
}
