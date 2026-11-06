import type { CustomerReportDocument } from '@portal/contracts';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { branding } from '../../app/branding';
import { renderA4Pdf, type A4Options } from '../../shared/pdf/a4-pdf';
import { AssessmentDocument } from './assessment-document';
import { DOC_TITLE } from './assessment-document-text';

// The customer PDF: the shared A4 renderer over the hidden assessment
// document. The document is drawn off screen for the length of the export.

export const ASSESSMENT_PDF_OPTIONS: A4Options = {
  // The document reuses the quote's qd-* rules and adds its own ad-* ones.
  cssPattern: /qd-|ad-|quote-doc-root|assess-doc-root/,
  exportClass: 'qd-export',
  breakSelector: '.qd-head, .qd-kpis, .qd-block, .ad-cover',
  blockSelector: '.qd-block',
  rowTableBodySelector: '.qd-table tbody',
  pageBreakBeforeSelector: '[data-page-break]',
  logoUrl: branding.logoUrl,
};

export async function renderAssessmentPdf(
  report: CustomerReportDocument,
  issuedOn: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    flushSync(() =>
      root.render(<AssessmentDocument report={report} issuedOn={issuedOn} />),
    );
    const source = host.querySelector<HTMLElement>('.assess-doc-root');
    if (!source) throw new Error('The report could not be laid out.');
    return await renderA4Pdf(
      source,
      `${branding.logoAlt} · ${DOC_TITLE}`,
      ASSESSMENT_PDF_OPTIONS,
    );
  } finally {
    root.unmount();
    host.remove();
  }
}
