import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FIXTURE_SOURCE_REVISION,
  PutProjectSourceSchema,
  SOURCE_PROFILE_IDS,
  UpdateProjectSchema,
  type FolderPickerUnavailableReason,
  type Project,
  type TableNameMapping,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import { ApiError } from '../../shared/api/api-error';
import type { ProjectsApi } from '../../shared/api/projects-api';
import type { RunsApi } from '../../shared/api/runs-api';
import type { SourcesApi } from '../../shared/api/sources-api';
import { useLocale } from '../../shared/i18n/locale-context';
import { projectErrorMessage } from '../projects/project-messages';
import { ScanStage, type ScanSource } from '../jobs/scan-stage';
import { isActiveRun, useAnalyzeRuns } from '../jobs/use-analyze-runs';
import { sourceErrorMessage } from './source-messages';
import { startableRevision, useProjectSource } from './use-project-source';

// Step 1 "Nạp source" (UI04), as demo02: the scan card (choose a folder,
// "Quét source", "Đổi thư mục") and the project information (name and
// analysis language); the caller places the recent projects beside it.
//
// Choosing a folder registers it (PUT source); the registered path never
// comes back from the API, so the card shows the folder name. "Quét source"
// needs a project name and a chosen language, saves a changed name (PATCH)
// and only then starts a run on the registered revision. Nothing here runs
// on open, reload or locale change. Table-name mapping and run history are
// kept in the API but not shown here (user request, 02/11/2026).

export type PickerState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'unavailable'; reason: FolderPickerUnavailableReason }
  | { status: 'error'; error: unknown };

type FieldErrors = { name: boolean; language: boolean; rootPath: boolean };
const NO_ERRORS: FieldErrors = {
  name: false,
  language: false,
  rootPath: false,
};

// Language chips of demo02. Only VB6 has an analysis profile; the others
// are listed as coming and cannot be chosen.
export type Language = 'vb6';
const COMING_LANGUAGES = ['COBOL', 'PHP', 'C#', 'Java'] as const;
const UNCONFIGURED: TableNameMapping = {
  defaultSchema: null,
  status: 'unconfigured',
};

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
  // A saved name; the shell shows it without re-reading.
  onProjectChange: (project: Project) => void;
  // A source was saved or a run started or ended: step marks re-read.
  onProgress: () => void;
  onOpenResults: (runId: string) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.sourceStep;
  const demo = project.mode === 'demo';
  const source = useProjectSource(sourcesApi, project.id, !demo);
  const revision = demo
    ? FIXTURE_SOURCE_REVISION
    : startableRevision(source.state);
  const runs = useAnalyzeRuns(runsApi, project.id, revision);

  // Report run starts and ends after the first read.
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

  const registered =
    source.state.status === 'ready' && source.state.source?.kind === 'local'
      ? source.state.source
      : null;
  // Kept across failed saves, reloads and locale changes.
  const [name, setName] = useState(project.name);
  // The bundled fixture, or a source registered before this page opened,
  // already names its profile; a new source needs the language chosen.
  const [language, setLanguage] = useState<Language | null>(
    demo ? 'vb6' : null,
  );
  const languageRead = useRef(demo);
  useEffect(() => {
    if (languageRead.current || source.state.status === 'loading') return;
    languageRead.current = true;
    if (source.state.status === 'ready' && source.state.source)
      setLanguage((chosen) => chosen ?? 'vb6');
  }, [source.state]);
  const chosenLanguage = language;
  const [rootPath, setRootPath] = useState('');
  const [changingFolder, setChangingFolder] = useState(false);
  // The path field is shown on request or when the dialog is unavailable.
  const [manualPath, setManualPath] = useState(false);
  const [picker, setPicker] = useState<PickerState>({ status: 'idle' });
  const [invalid, setInvalid] = useState<FieldErrors>(NO_ERRORS);
  const [infoError, setInfoError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);

  async function exclusive(task: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    try {
      await task();
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  // Registers a folder (chosen in the dialog or typed); the table-name
  // mapping stays as registered (unconfigured for a new source).
  async function register(path: string): Promise<boolean> {
    const saved = await source.put({
      rootPath: path,
      profileId: SOURCE_PROFILE_IDS[0],
      tableNameMapping: registered?.tableNameMapping ?? UNCONFIGURED,
      // The revision this page read; a newer one answers 409.
      expectedSourceRevision: registered?.revision ?? null,
    });
    if (!saved) return false;
    setRootPath('');
    setManualPath(false);
    setChangingFolder(false);
    return true;
  }

  function chooseTyped() {
    const path = rootPath.trim();
    if (!Check(PutProjectSourceSchema.properties.rootPath, path)) {
      setInvalid((errors) => ({ ...errors, rootPath: true }));
      return;
    }
    void exclusive(async () => {
      await register(path);
    });
  }

  // Opens the OS folder dialog on the backend machine (UI05). A path the
  // backend then refuses is put in the path field to correct it; an
  // unavailable dialog leaves the path field only.
  function pickFolder() {
    void exclusive(async () => {
      setPicker({ status: 'pending' });
      const controller = new AbortController();
      mutation.current = controller;
      try {
        const result = await sourcesApi.pickFolder(controller.signal);
        if (controller.signal.aborted) return;
        if (result.status === 'unavailable') {
          setPicker({ status: 'unavailable', reason: result.reason });
          setManualPath(true);
          setChangingFolder(true);
          return;
        }
        setPicker({ status: 'idle' });
        if (result.status === 'cancelled') return;
        // A refused folder shows the reason on the chooser; the next choice
        // opens the dialog again.
        if (!(await register(result.path))) setChangingFolder(true);
      } catch (error) {
        if (controller.signal.aborted) return;
        setPicker({ status: 'error', error });
        setChangingFolder(true);
      }
    });
  }

  function scan(retryOfRunId: string | null) {
    // A Start whose outcome is unknown is resent as it was: nothing else
    // is saved or changed before it.
    if (runs.uncertainStart) {
      void runs.start();
      return;
    }
    const trimmed = name.trim();
    const errors: FieldErrors = {
      name: !Check(UpdateProjectSchema, { name: trimmed }),
      language: chosenLanguage === null,
      rootPath: false,
    };
    setInvalid(errors);
    if (errors.name || errors.language || revision === null) return;
    void exclusive(async () => {
      setInfoError(null);
      if (trimmed !== project.name) {
        const controller = new AbortController();
        mutation.current = controller;
        try {
          const saved = await api.update(
            project.id,
            { name: trimmed },
            controller.signal,
          );
          if (controller.signal.aborted) return;
          onProjectChange(saved);
        } catch (error) {
          if (!controller.signal.aborted) setInfoError(error);
          return;
        }
      }
      if (retryOfRunId) await runs.retry(retryOfRunId, revision);
      else await runs.start(revision);
    });
  }

  const choosing =
    !demo &&
    source.state.status !== 'loading' &&
    (changingFolder || !registered || registered.status !== 'ready');
  const scanSource: ScanSource = demo
    ? { status: 'demo', folder: copy.form.demoFolder(project.fixtureId) }
    : source.state.status === 'loading'
      ? { status: 'loading' }
      : registered
        ? { status: registered.status, folder: registered.displayName }
        : { status: 'none' };

  const chooser = choosing ? (
    <FolderChooser
      value={rootPath}
      manual={manualPath}
      invalid={invalid.rootPath}
      pending={saving || source.save.status === 'pending'}
      picker={picker}
      error={
        source.state.status === 'error'
          ? source.state.error
          : source.save.status === 'error'
            ? source.save.error
            : null
      }
      onChange={(value) => {
        setRootPath(value);
        setInvalid((errors) => ({ ...errors, rootPath: false }));
      }}
      onPick={pickFolder}
      onSubmit={chooseTyped}
      onReload={source.refresh}
      onCancel={
        registered?.status === 'ready'
          ? () => {
              setChangingFolder(false);
              setManualPath(false);
              setPicker({ status: 'idle' });
            }
          : null
      }
    />
  ) : null;

  return (
    <div className="source-step">
      <div className="source-main">
        <ScanStage
          runs={runs}
          source={scanSource}
          chooser={chooser}
          starting={saving}
          onStart={scan}
          onChangeFolder={demo ? null : pickFolder}
          picking={picker.status === 'pending'}
          onOpenResults={onOpenResults}
        />
        <ProjectInfoPanel
          name={name}
          language={chosenLanguage}
          invalid={invalid}
          disabled={saving}
          error={infoError}
          onName={(value) => {
            setName(value);
            setInvalid((errors) => ({ ...errors, name: false }));
          }}
          onLanguage={(value) => {
            setLanguage(value);
            setInvalid((errors) => ({ ...errors, language: false }));
          }}
        />
      </div>
      {aside}
    </div>
  );
}

// "Thông tin dự án": project name and analysis language (only VB6 can be
// chosen). Shared by the step of an existing and of a new project.
export function ProjectInfoPanel({
  name,
  language,
  invalid,
  disabled,
  error,
  onName,
  onLanguage,
}: {
  name: string;
  language: Language | null;
  invalid: { name: boolean; language: boolean };
  disabled: boolean;
  // A refused save of the project.
  error: unknown;
  onName: (value: string) => void;
  onLanguage: (value: Language) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.sourceStep.form;
  return (
    <section className="panel project-info" aria-labelledby="info-title">
      <h2 id="info-title">{copy.title}</h2>
      <label htmlFor="project-name">{copy.name}</label>
      <input
        id="project-name"
        autoComplete="off"
        value={name}
        disabled={disabled}
        aria-invalid={invalid.name}
        aria-describedby={invalid.name ? 'project-name-error' : undefined}
        onChange={(event) => onName(event.target.value)}
      />
      {invalid.name && (
        <p id="project-name-error" role="alert" className="error">
          {messages.projects.create.nameInvalid}
        </p>
      )}
      {error !== null && error !== undefined && (
        <p role="alert" className="error">
          {projectErrorMessage(error, 'update', messages.errors)}
        </p>
      )}
      <fieldset
        className="language-chips"
        aria-describedby={invalid.language ? 'language-error' : undefined}
      >
        <legend>{copy.language}</legend>
        <label
          className={'language-chip' + (language === 'vb6' ? ' selected' : '')}
        >
          <input
            type="radio"
            name="analysis-language"
            checked={language === 'vb6'}
            disabled={disabled}
            onChange={() => onLanguage('vb6')}
          />
          <span>VB6</span>
        </label>
        {COMING_LANGUAGES.map((label) => (
          <label key={label} className="language-chip coming">
            <input type="radio" name="analysis-language" disabled />
            <span>{label}</span>
            <span className="chip-note">{copy.comingSoon}</span>
          </label>
        ))}
      </fieldset>
      {invalid.language && (
        <p id="language-error" role="alert" className="error">
          {copy.languageRequired}
        </p>
      )}
    </section>
  );
}

// Folder choice on the scan card: the OS folder dialog (UI05). An absolute
// path can be typed only when this machine has no dialog (`manual`).
export function FolderChooser({
  value,
  manual,
  invalid,
  pending,
  picker,
  error,
  onChange,
  onPick,
  onSubmit,
  onReload,
  onCancel,
}: {
  value: string;
  manual: boolean;
  invalid: boolean;
  pending: boolean;
  picker: PickerState;
  error: unknown;
  onChange: (value: string) => void;
  onPick: () => void;
  onSubmit: () => void;
  onReload: () => void;
  onCancel: (() => void) | null;
}) {
  const { messages } = useLocale();
  const copy = messages.sourceStep.form;
  const stale =
    error instanceof ApiError && error.code === 'SOURCE_REVISION_CONFLICT';
  const picking = picker.status === 'pending';
  return (
    <div className="folder-chooser">
      <div className="scan-actions">
        {picker.status !== 'unavailable' && (
          <button
            className="button primary large"
            type="button"
            disabled={pending}
            onClick={onPick}
          >
            <FolderIcon />
            {picking ? copy.picking : copy.pick}
          </button>
        )}
        {onCancel && (
          <button
            className="button large"
            type="button"
            disabled={pending}
            onClick={onCancel}
          >
            {copy.cancel}
          </button>
        )}
      </div>
      {picking && (
        <p role="status" className="field-help">
          {copy.pickingHelp}
        </p>
      )}
      {picker.status === 'unavailable' && (
        <p role="status" className="notice">
          {copy.pickerUnavailable[picker.reason]}
        </p>
      )}
      {picker.status === 'error' && (
        <p role="alert" className="error">
          {projectErrorMessage(picker.error, 'source', messages.errors)}
        </p>
      )}
      {manual && (
        <form
          noValidate
          aria-busy={pending}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label htmlFor="source-root">{copy.folder}</label>
          <div className="folder-row">
            <input
              id="source-root"
              autoComplete="off"
              spellCheck={false}
              className="mono"
              value={value}
              disabled={pending}
              aria-invalid={invalid}
              aria-describedby={
                invalid
                  ? 'source-root-help source-root-error'
                  : 'source-root-help'
              }
              onChange={(event) => onChange(event.target.value)}
            />
            <button className="button large" type="submit" disabled={pending}>
              {pending && !picking ? copy.saving : copy.useFolder}
            </button>
          </div>
          <p className="field-help" id="source-root-help">
            {messages.source.form.rootPathHelp}
          </p>
          {invalid && (
            <p id="source-root-error" role="alert" className="error">
              {messages.source.form.rootPathInvalid}
            </p>
          )}
        </form>
      )}
      {error !== null && error !== undefined && (
        <div role="alert" className="error">
          {sourceErrorMessage(error, messages)}{' '}
          {stale && (
            <button className="button small" type="button" onClick={onReload}>
              {messages.source.reload}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function FolderIcon() {
  return (
    <svg className="button-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
  );
}
