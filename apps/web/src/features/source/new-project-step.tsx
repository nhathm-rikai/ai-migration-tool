import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  PROJECT_LOCAL_MODE,
  PutProjectSourceSchema,
  SOURCE_PROFILE_IDS,
  UpdateProjectSchema,
  type Project,
  type ProjectSource,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import type { ProjectsApi } from '../../shared/api/projects-api';
import type { RunsApi } from '../../shared/api/runs-api';
import type { SourcesApi } from '../../shared/api/sources-api';
import { useLocale } from '../../shared/i18n/locale-context';
import {
  FolderChooser,
  ProjectInfoPanel,
  type Language,
  type PickerState,
} from './source-step';
import { sourceErrorMessage } from './source-messages';

// Step 1 of a new project (UI04): the same scan card and project
// information as an existing project, with nothing stored until "Quét
// source". Then the project is created (name, local source), the folder
// registered and the first run started; the page moves to the project's own
// step 1, which follows that run. A folder that is chosen but never scanned
// leaves no project behind. A save that fails after the project was created
// keeps that project: a second "Quét source" never creates another one.

type FieldErrors = { name: boolean; language: boolean; rootPath: boolean };

// Last segment of a Windows or POSIX path, as the default project name.
export function folderName(path: string): string {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.at(-1) ?? path;
}

export function NewProjectStep({
  api,
  sourcesApi,
  runsApi,
  aside,
  newKey = () => crypto.randomUUID(),
  onCreated,
}: {
  api: ProjectsApi;
  sourcesApi: SourcesApi;
  runsApi: RunsApi;
  aside?: ReactNode;
  newKey?: () => string;
  // The project exists and its folder is registered (its first run may or
  // may not have started): open its own step 1.
  onCreated: (project: Project) => void;
}) {
  const { messages } = useLocale();
  const copy = messages.sourceStep;
  const [rootPath, setRootPath] = useState('');
  // A folder chosen in the dialog or typed and accepted.
  const [folder, setFolder] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [picker, setPicker] = useState<PickerState>({ status: 'idle' });
  const [name, setName] = useState('');
  // The name follows the chosen folder until the user types one.
  const [nameEdited, setNameEdited] = useState(false);
  const [language, setLanguage] = useState<Language | null>(null);
  const [invalid, setInvalid] = useState<FieldErrors>({
    name: false,
    language: false,
    rootPath: false,
  });
  const [error, setError] = useState<{
    on: 'project' | 'source';
    error: unknown;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const created = useRef<Project | null>(null);
  const registered = useRef<ProjectSource | null>(null);
  const busy = useRef(false);
  const mutation = useRef<AbortController | null>(null);
  useEffect(() => () => mutation.current?.abort(), []);

  function acceptFolder(path: string) {
    setFolder(path);
    setRootPath('');
    setManual(false);
    setPicker({ status: 'idle' });
    setError(null);
    if (!nameEdited) setName(folderName(path));
    setInvalid((errors) => ({ ...errors, rootPath: false, name: false }));
  }

  async function exclusive(task: (signal: AbortSignal) => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    const controller = new AbortController();
    mutation.current = controller;
    try {
      await task(controller.signal);
    } finally {
      busy.current = false;
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  function pickFolder() {
    void exclusive(async (signal) => {
      setPicker({ status: 'pending' });
      try {
        const result = await sourcesApi.pickFolder(signal);
        if (result.status === 'selected') acceptFolder(result.path);
        else if (result.status === 'cancelled') setPicker({ status: 'idle' });
        else {
          // No dialog on this machine: back to the chooser with the path
          // field.
          setPicker({ status: 'unavailable', reason: result.reason });
          setManual(true);
          setFolder(null);
        }
      } catch (failure) {
        if (signal.aborted) return;
        setPicker({ status: 'error', error: failure });
        setFolder(null);
      }
    });
  }

  function chooseTyped() {
    const path = rootPath.trim();
    if (!Check(PutProjectSourceSchema.properties.rootPath, path)) {
      setInvalid((errors) => ({ ...errors, rootPath: true }));
      return;
    }
    acceptFolder(path);
  }

  function scan() {
    const trimmed = name.trim();
    const errors: FieldErrors = {
      name: !Check(UpdateProjectSchema, { name: trimmed }),
      language: language === null,
      rootPath: false,
    };
    setInvalid(errors);
    if (errors.name || errors.language || folder === null) return;
    void exclusive(async (signal) => {
      setError(null);
      let project = created.current;
      try {
        if (!project) {
          project = await api.create(
            { name: trimmed, mode: PROJECT_LOCAL_MODE },
            signal,
          );
          created.current = project;
        } else if (project.name !== trimmed) {
          project = await api.update(project.id, { name: trimmed }, signal);
          created.current = project;
        }
      } catch (failure) {
        if (!signal.aborted) setError({ on: 'project', error: failure });
        return;
      }
      let source: ProjectSource;
      try {
        const response = await sourcesApi.put(
          project.id,
          {
            rootPath: folder,
            profileId: SOURCE_PROFILE_IDS[0],
            tableNameMapping: { defaultSchema: null, status: 'unconfigured' },
            expectedSourceRevision:
              registered.current?.kind === 'local'
                ? registered.current.revision
                : null,
          },
          signal,
        );
        if (!response.source) throw new Error('No source after registration.');
        source = response.source;
        registered.current = source;
      } catch (failure) {
        if (!signal.aborted) setError({ on: 'source', error: failure });
        return;
      }
      // The first run; its step 1 follows it (or offers "Quét source" again
      // if it could not start).
      if (source.kind === 'local' && source.status === 'ready')
        await runsApi
          .start(
            project.id,
            newKey(),
            {
              kind: 'analyze',
              source: {
                strategy: 'current-source',
                expectedSourceRevision: source.revision,
              },
              retryOfRunId: null,
            },
            signal,
          )
          .catch(() => undefined);
      if (!signal.aborted) onCreated(project);
    });
  }

  const choosing = folder === null;
  return (
    <div className="source-step">
      <div className="source-main">
        <section
          className={`scan-card phase-${choosing ? 'choose' : 'chosen'}`}
          aria-labelledby="scan-title"
        >
          <div className="scan-icon" aria-hidden="true">
            <span className="scan-ring" />
            <span className="scan-ring late" />
            <span className="scan-box">
              <svg viewBox="0 0 24 24">
                <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <path d="M12 11v5" />
                <path d="M9.5 13.5L12 11l2.5 2.5" />
              </svg>
            </span>
          </div>
          <div className="scan-text" role="status">
            <h2 id="scan-title">
              {choosing ? copy.hero.chooseTitle : copy.hero.chosenTitle}
            </h2>
            {folder !== null && (
              <span className="folder-chip">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                <span className="mono">{folderName(folder)}</span>
              </span>
            )}
            {folder !== null && <p>{copy.hero.chosenHelp}</p>}
          </div>
          {choosing ? (
            <FolderChooser
              value={rootPath}
              manual={manual}
              invalid={invalid.rootPath}
              pending={saving}
              picker={picker}
              error={null}
              onChange={(value) => {
                setRootPath(value);
                setInvalid((errors) => ({ ...errors, rootPath: false }));
              }}
              onPick={pickFolder}
              onSubmit={chooseTyped}
              onReload={() => undefined}
              onCancel={null}
            />
          ) : (
            <div className="scan-actions">
              <button
                className="button primary large"
                disabled={saving}
                onClick={scan}
              >
                <svg
                  className="button-icon"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" />
                </svg>
                {saving ? messages.runs.starting : copy.hero.scan}
              </button>
              <button
                className="button large"
                disabled={saving}
                onClick={pickFolder}
              >
                {picker.status === 'pending'
                  ? copy.form.picking
                  : copy.hero.changeFolder}
              </button>
            </div>
          )}
          {error?.on === 'source' && (
            <p role="alert" className="error">
              {sourceErrorMessage(error.error, messages)}
            </p>
          )}
        </section>
        <ProjectInfoPanel
          name={name}
          language={language}
          invalid={invalid}
          disabled={saving}
          error={error?.on === 'project' ? error.error : null}
          onName={(value) => {
            setName(value);
            setNameEdited(true);
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
