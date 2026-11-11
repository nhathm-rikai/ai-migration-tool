import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Download } from '../../shared/api/api-client';
import type { DocumentsApi } from '../../shared/api/documents-api';
import { LocaleProvider } from '../../shared/i18n/locale-provider';
import {
  ItExcelButton,
  SpecExcelButton,
  UtExcelButton,
} from './ut-excel-button';

afterEach(cleanup);

// TC01-AC05: the Excel button of the unit test specification.
function setup(utSpecExcel: DocumentsApi['utSpecExcel']) {
  const save = vi.fn();
  render(
    <LocaleProvider>
      <UtExcelButton
        api={{ utSpecExcel }}
        projectId="p"
        runId="r"
        item={0}
        save={save}
      />
    </LocaleProvider>,
  );
  return save;
}

describe('UtExcelButton', () => {
  it('asks for exactly this run and item and saves the file under the server name', async () => {
    const blob = new Blob(['x']);
    const api = vi
      .fn<DocumentsApi['utSpecExcel']>()
      .mockResolvedValue({ blob, fileName: '単体テスト仕様書_A.xlsx' });
    const save = setup(api);
    fireEvent.click(screen.getByRole('button', { name: /Excel/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(api.mock.calls[0]?.slice(0, 3)).toEqual(['p', 'r', 0]);
    expect(save).toHaveBeenCalledWith('単体テスト仕様書_A.xlsx', blob);
  });

  it('is disabled while it works', async () => {
    let finish: (value: Download) => void = () => undefined;
    const api = vi
      .fn<DocumentsApi['utSpecExcel']>()
      .mockReturnValue(new Promise((resolve) => (finish = resolve)));
    setup(api);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(api).toHaveBeenCalledTimes(1);
    finish({ blob: new Blob(['x']), fileName: null });
    await waitFor(() =>
      expect((button as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it('shows a message and saves nothing when the download fails', async () => {
    const save = setup(
      vi.fn<DocumentsApi['utSpecExcel']>().mockRejectedValue(new Error('x')),
    );
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });
});

// TC02-AC05: the same button for the integration test specification.
describe('ItExcelButton', () => {
  it('downloads the integration Excel of this run and item, with its own label', async () => {
    const blob = new Blob(['x']);
    const api = vi
      .fn<DocumentsApi['itSpecExcel']>()
      .mockResolvedValue({ blob, fileName: '結合テスト仕様書_A.xlsx' });
    const save = vi.fn();
    render(
      <LocaleProvider>
        <ItExcelButton
          api={{ itSpecExcel: api }}
          projectId="p"
          runId="r"
          item={2}
          save={save}
        />
      </LocaleProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: /結合テスト仕様書/ }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(api.mock.calls[0]?.slice(0, 3)).toEqual(['p', 'r', 2]);
    expect(save).toHaveBeenCalledWith('結合テスト仕様書_A.xlsx', blob);
  });
});

describe('SpecExcelButton', () => {
  const api = { utSpecExcel: vi.fn(), itSpecExcel: vi.fn() };
  const show = (fileName: string) =>
    render(
      <LocaleProvider>
        <SpecExcelButton
          fileName={fileName}
          api={api}
          projectId="p"
          runId="r"
          item={0}
        />
      </LocaleProvider>,
    );

  it.each([
    ['ut-test-spec.md', 'ut-excel'],
    ['it-test-spec.md', 'it-excel'],
  ])('shows the button of %s', (fileName, testId) => {
    show(fileName);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByTestId(testId)).toBeTruthy();
  });

  it('shows nothing for a document without an Excel', () => {
    show('detail-design.md');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
