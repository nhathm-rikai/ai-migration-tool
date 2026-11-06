import { branding } from '../../app/branding';
import { renderA4Pdf, type A4Options } from '../../shared/pdf/a4-pdf';

// The quote PDF: the shared A4 renderer with the quote document's own
// selectors (qd-*). Output must not change when the renderer changes (AR03).

export const QUOTE_PDF_OPTIONS: A4Options = {
  cssPattern: /qd-|quote-doc-root/,
  exportClass: 'qd-export',
  breakSelector: '.qd-head, .qd-kpis, .qd-block',
  blockSelector: '.qd-block',
  rowTableBodySelector: '.qd-table tbody',
  logoUrl: branding.logoUrl,
};

export function renderQuotePdf(
  source: HTMLElement,
  footerLabel: string,
): Promise<Uint8Array<ArrayBuffer>> {
  return renderA4Pdf(source, footerLabel, QUOTE_PDF_OPTIONS);
}
