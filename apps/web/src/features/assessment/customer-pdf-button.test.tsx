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
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import { json, requestUrl, testCredentials } from '../../testing/fixtures';
import { customerReportFixture } from '../../testing/customer-report-fixture';
import { customerPdfFileName } from './customer-pdf-button';

// AR03-AC04 / AC05 (web): the PDF button of the analysis step.

const projectId = FIXTURE_IDS.project;
const runId = FIXTURE_IDS.runs.succeeded;
const artifactId = FIXTURE_IDS.artifact;
const jsonUrl = `/api/v1/projects/${projectId}/artifacts/${artifactId}/versions/1/customer-report?format=json`;

function reportResponse() {
  const report = customerReportFixture();
  if (report.source.origin) {
    report.source.origin.artifactId = artifactId;
    report.source.origin.projectId = projectId;
  }
  return new Response(JSON.stringify(report), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'content-disposition': 'attachment; filename="a.json"',
    },
  });
}

function setup(
  onReport: () => Promise<Response> | Response,
  render_ = vi.fn<(report: unknown, day: string) => Promise<Uint8Array>>(() =>
    Promise.resolve(new TextEncoder().encode('%PDF-1.4 fake')),
  ),
) {
  const calls: string[] = [];
  const fetcher = vi.fn<typeof fetch>((input) => {
    const url = requestUrl(input);
    calls.push(url);
    if (url.includes('/runs/') && url.endsWith('/artifacts'))
      return Promise.resolve(json(artifactListFixture));
    if (url.endsWith('/versions/1'))
      return Promise.resolve(json(mappedInventoryArtifactFixture));
    return Promise.resolve(onReport());
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
        renderCustomerPdf={render_}
      />
    </LocaleProvider>
  );
  return { calls, save, view, renderPdf: render_ };
}

const button = () =>
  screen.findByRole('button', { name: 'Báo cáo cho khách (PDF)' });

describe('Customer PDF button (AR03)', () => {
  it('reads the customer JSON of the exact version and saves a .pdf', async () => {
    const { view, save, calls, renderPdf } = setup(reportResponse);
    render(view());
    fireEvent.click(await button());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(calls).toContain(jsonUrl);
    const [name, blob] = save.mock.calls[0] ?? [];
    expect(name).toMatch(/^アセスメント報告書_デモ受注管理_\d{8}\.pdf$/);
    expect(blob?.type).toBe('application/pdf');
    expect(renderPdf).toHaveBeenCalledTimes(1);
    // The document is drawn from the JSON that was read.
    expect(
      (renderPdf.mock.calls[0]?.[0] as { reportVersion: string }).reportVersion,
    ).toBe('customer-assessment-report-v1');
  });

  it('is disabled while it works and comes back afterwards', async () => {
    let finish: (bytes: Uint8Array) => void = () => undefined;
    const drawing = vi.fn(
      () =>
        new Promise<Uint8Array>((resolve) => {
          finish = resolve;
        }),
    );
    const { view, save } = setup(reportResponse, drawing);
    render(view());
    const pdf = await button();
    fireEvent.click(pdf);
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Đang xuất…' })
          .disabled,
      ).toBe(true),
    );
    await waitFor(() => expect(drawing).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Đang xuất…' })
        .disabled,
    ).toBe(true);
    finish(new TextEncoder().encode('%PDF'));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect((await button()).hasAttribute('disabled')).toBe(false);
  });

  it('shows an error and saves nothing when the JSON cannot be read', async () => {
    const { view, save, renderPdf } = setup(
      () =>
        new Response(
          JSON.stringify(errorResponseFixture('ARTIFACT_NOT_FOUND')),
          {
            status: 404,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );
    render(view());
    fireEvent.click(await button());
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    expect(renderPdf).not.toHaveBeenCalled();
    expect((await button()).hasAttribute('disabled')).toBe(false);
  });

  it('shows an error and saves nothing when drawing fails, then can retry', async () => {
    const failing = vi
      .fn<(report: unknown, day: string) => Promise<Uint8Array>>()
      .mockRejectedValueOnce(new Error('canvas'))
      .mockResolvedValue(new TextEncoder().encode('%PDF'));
    const { view, save } = setup(reportResponse, failing);
    render(view());
    fireEvent.click(await button());
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(await button());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('rejects a JSON that does not match the contract', async () => {
    const { view, save } = setup(
      () =>
        new Response(
          JSON.stringify({
            reportVersion: 'customer-assessment-report-v1',
            scale: {},
            source: { origin: { artifactId, artifactVersion: 1 } },
          }),
          {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'content-disposition': 'attachment; filename="a.json"',
            },
          },
        ),
    );
    render(view());
    fireEvent.click(await button());
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('customerPdfFileName', () => {
  it('is アセスメント報告書_<project>_<date>.pdf without unsafe characters', () => {
    const day = new Date('2026-11-06T10:00:00Z');
    expect(customerPdfFileName('受注/管理 システム', day)).toBe(
      'アセスメント報告書_受注_管理_システム_20261106.pdf',
    );
    expect(customerPdfFileName('..', day)).toBe(
      'アセスメント報告書_project_20261106.pdf',
    );
    expect(customerPdfFileName('', day)).toBe(
      'アセスメント報告書_project_20261106.pdf',
    );
  });
});
