import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  FIXTURE_IDS,
  artifactListFixture,
  errorResponseFixture,
  mappedInventoryArtifactFixture,
} from '@portal/contracts/fixtures';
import { AssessmentOverview } from './assessment-overview';
import { createArtifactsApi } from '../../shared/api/artifacts-api';
import { fileNameFromDisposition } from '../../shared/api/api-client';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import { json, requestUrl, testCredentials } from '../../testing/fixtures';

// AR01-AC06: the export button of the analysis step.

const projectId = FIXTURE_IDS.project;
const runId = FIXTURE_IDS.runs.succeeded;
const artifactId = FIXTURE_IDS.artifact;
const reportUrl = `/api/v1/projects/${projectId}/artifacts/${artifactId}/versions/1/report?format=xlsx`;

type Pending = {
  resolve: (response: Response) => void;
  signal: AbortSignal | null | undefined;
  headers: HeadersInit | undefined;
};

function setup(report: (pending: Pending) => Promise<Response> | Response) {
  const calls: string[] = [];
  const pendings: Pending[] = [];
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const url = requestUrl(input);
    calls.push(url);
    if (url.includes('/runs/') && url.endsWith('/artifacts'))
      return Promise.resolve(json(artifactListFixture));
    if (url.endsWith('/versions/1'))
      return Promise.resolve(json(mappedInventoryArtifactFixture));
    const pending: Pending = {
      resolve: () => undefined,
      signal: init?.signal,
      headers: init?.headers,
    };
    pendings.push(pending);
    return Promise.resolve(report(pending));
  });
  const save = vi.fn<(name: string, blob: Blob) => void>();
  const api = createArtifactsApi(fetcher, testCredentials);
  const view = (id: string = runId) => (
    <LocaleProvider>
      <AssessmentOverview
        api={api}
        projectId={projectId}
        runId={id}
        saveFile={save}
      />
    </LocaleProvider>
  );
  return { calls, pendings, save, view, fetcher };
}

const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]);

const fileResponse = (
  name = 'assessment-Demo-20261106.xlsx',
  body: BodyInit = ZIP_BYTES,
  type = XLSX_TYPE,
) =>
  new Response(body, {
    status: 200,
    headers: {
      'content-type': type,
      'content-disposition': `attachment; filename="a.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });

describe('Assessment report export button (AR01)', () => {
  it('asks for the displayed artifact id and version, then saves under the server name', async () => {
    const ctx = setup(() => fileResponse('assessment-受注-20261106.xlsx'));
    render(ctx.view());
    fireEvent.click(await screen.findByRole('button', { name: 'Xuất Excel' }));
    await waitFor(() => expect(ctx.save).toHaveBeenCalledTimes(1));
    expect(ctx.calls.filter((url) => url.includes('/report'))).toEqual([
      reportUrl,
    ]);
    expect(ctx.save.mock.calls[0]?.[0]).toBe('assessment-受注-20261106.xlsx');
    expect(ctx.save.mock.calls[0]?.[1].size).toBeGreaterThan(0);
    // Same credential header as the other API calls.
    expect(JSON.stringify(ctx.pendings[0]?.headers)).toContain('Bearer');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('is disabled with a busy label while the file is being built', async () => {
    let finish: (response: Response) => void = () => undefined;
    const ctx = setup(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    render(ctx.view());
    const button = await screen.findByRole('button', { name: 'Xuất Excel' });
    fireEvent.click(button);
    const busy = await screen.findByRole('button', { name: 'Đang xuất…' });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busy);
    expect(ctx.pendings).toHaveLength(1);
    finish(fileResponse());
    await waitFor(() => expect(ctx.save).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Xuất Excel' })
        .disabled,
    ).toBe(false);
  });

  it('shows an error and saves no file when the server refuses', async () => {
    const ctx = setup(() =>
      json(errorResponseFixture('ARTIFACT_NOT_FOUND'), 404),
    );
    render(ctx.view());
    fireEvent.click(await screen.findByRole('button', { name: 'Xuất Excel' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Không tìm thấy phiên bản kết quả',
    );
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('shows a generic error when the request fails', async () => {
    const ctx = setup(() => json({ nope: true }, 500));
    render(ctx.view());
    fireEvent.click(await screen.findByRole('button', { name: 'Xuất Excel' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Không xuất được báo cáo',
    );
    expect(ctx.save).not.toHaveBeenCalled();
  });

  // Review finding 3: a 200 that is not the requested file is not saved.
  it.each([
    ['an HTML page', '<html>login</html>', 'text/html'],
    ['a body that is not a ZIP', 'plain text', XLSX_TYPE],
    ['a ZIP under another media type', ZIP_BYTES, 'application/octet-stream'],
    ['an empty body', '', XLSX_TYPE],
  ])('does not save %s answered with 200', async (_name, body, type) => {
    const ctx = setup(() => fileResponse('x.xlsx', body, type));
    render(ctx.view());
    fireEvent.click(await screen.findByRole('button', { name: 'Xuất Excel' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Không xuất được báo cáo',
    );
    expect(ctx.save).not.toHaveBeenCalled();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Xuất Excel' })
        .disabled,
    ).toBe(false);
  });

  it('explains a report too large for Excel', async () => {
    const ctx = setup(() =>
      json(errorResponseFixture('REPORT_TOO_LARGE'), 422),
    );
    render(ctx.view());
    fireEvent.click(await screen.findByRole('button', { name: 'Xuất Excel' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'quá lớn để xếp vào một sheet Excel',
    );
    expect(ctx.save).not.toHaveBeenCalled();
  });

  it('drops the answer when the run changes while downloading', async () => {
    let finish: (response: Response) => void = () => undefined;
    const ctx = setup(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const { rerender } = render(ctx.view());
    fireEvent.click(await screen.findByRole('button', { name: 'Xuất Excel' }));
    await screen.findByRole('button', { name: 'Đang xuất…' });
    const signal = ctx.pendings[0]?.signal;
    rerender(ctx.view(FIXTURE_IDS.runs.failed));
    await waitFor(() => expect(signal?.aborted).toBe(true));
    finish(fileResponse());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ctx.save).not.toHaveBeenCalled();
  });
});

describe('fileNameFromDisposition', () => {
  it('prefers the UTF-8 name and falls back to the plain one', () => {
    expect(
      fileNameFromDisposition(
        `attachment; filename="a_.xlsx"; filename*=UTF-8''a%20%E5%8F%97.xlsx`,
      ),
    ).toBe('a 受.xlsx');
    expect(fileNameFromDisposition('attachment; filename="b.xlsx"')).toBe(
      'b.xlsx',
    );
    expect(fileNameFromDisposition(null)).toBeNull();
    expect(fileNameFromDisposition('attachment')).toBeNull();
  });
});
