import { useEffect, useRef, useState } from 'react';
import {
  CreateProjectSchema,
  PROJECT_FIXTURE_ID,
  type Project,
} from '@portal/contracts';
import { Check } from 'typebox/value';
import type { ProjectsApi } from '../../shared/api/projects-api';
import { projectErrorMessage, projectMessages } from './project-messages';
import { Icon } from '../../shared/ui/icon';

export function CreateProjectForm({
  api,
  onCreated,
}: {
  api: ProjectsApi;
  onCreated: (project: Project) => void;
}) {
  const [name, setName] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [pending, setPending] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);

  async function submit() {
    if (active.current) return;
    const input = { name: name.trim(), fixtureId: PROJECT_FIXTURE_ID };
    setSubmitError('');
    if (!Check(CreateProjectSchema, input)) {
      setFieldError(projectMessages.nameInvalid);
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setFieldError('');
    try {
      const project = await api.create(input, controller.signal);
      if (!controller.signal.aborted) {
        setName('');
        onCreated(project);
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setSubmitError(projectErrorMessage(failure, 'create'));
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
        active.current = null;
      }
    }
  }
  return (
    <section className="panel create-panel" aria-labelledby="create-title">
      <span className="eyebrow">Không gian làm việc</span>
      <h1 id="create-title">Tạo dự án mới</h1>
      <p className="muted">
        Khởi tạo dự án để quản lý thông tin và chuẩn bị đánh giá hệ thống
        legacy.
      </p>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        aria-busy={pending}
      >
        <label htmlFor="project-name">Tên dự án</label>
        <input
          id="project-name"
          autoComplete="off"
          placeholder="Ví dụ: Hệ thống quản lý bán hàng"
          value={name}
          disabled={pending}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={
            fieldError ? 'name-help create-field-error' : 'name-help'
          }
          onChange={(event) => {
            setName(event.target.value);
            setFieldError('');
          }}
        />
        <p className="field-help" id="name-help">
          {projectMessages.nameHelp}
        </p>
        <div className="fixture-card">
          <span className="fixture-icon">
            <Icon name="folder" />
          </span>
          <div>
            <strong>Dữ liệu mẫu VB6</strong>
            <p>
              {PROJECT_FIXTURE_ID} · Chỉ lưu thông tin dự án, chưa đọc source.
            </p>
          </div>
        </div>
        {fieldError && (
          <p id="create-field-error" role="alert" className="error">
            {fieldError}
          </p>
        )}
        {submitError && (
          <p role="alert" className="error">
            {submitError}
          </p>
        )}
        <div className="form-actions">
          <button className="button primary" disabled={pending} type="submit">
            {pending ? 'Đang tạo…' : 'Tạo dự án'}
          </button>
        </div>
      </form>
      <p className="field-help">
        Dự án được lưu trên máy này. Chọn dự án trong cây bên trái để mở lại
        thông tin.
      </p>
    </section>
  );
}
