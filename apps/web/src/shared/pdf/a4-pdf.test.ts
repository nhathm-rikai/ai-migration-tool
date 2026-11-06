import { describe, expect, it } from 'vitest';
import { QUOTE_PDF_OPTIONS } from '../../features/quote/quote-pdf';
import { PAGE_H, PAGE_W, pdf, slices } from './a4-pdf';

// AR03-AC02: the quote PDF must not change when the renderer is shared. The
// expected values below were computed from the original quote-pdf.ts (before
// the split) with the same inputs.

const jpeg = (length: number) =>
  Uint8Array.from({ length }, (_, index) => (index * 7 + 3) % 256);

describe('shared A4 renderer keeps the quote output', () => {
  it('writes the same PDF bytes: page count, page size and image objects', async () => {
    const out = pdf([
      { jpeg: jpeg(40), width: 2382, height: 3369 },
      { jpeg: jpeg(25), width: 2382, height: 3369 },
      { jpeg: jpeg(9), width: 794, height: 1123 },
    ]);
    expect(out.length).toBe(1689);
    const digest = await crypto.subtle.digest('SHA-256', out);
    expect(
      Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join(''),
    ).toBe('3ab1c5cc88ca7fc0b021c51218b45183bc7167ef75d6e7f810740edaa54d8e2c');
    const text = new TextDecoder('latin1').decode(out);
    expect(text).toContain('/Count 3');
    // A4 in points: 794 x 1123 CSS px at 72/96.
    expect(text).toContain('/MediaBox [0 0 595.50 842.25]');
    expect([PAGE_W, PAGE_H]).toEqual([794, 1123]);
  });

  it('cuts pages where the original did, with and without break points', () => {
    expect(slices(2600, [300, 500, 900, 1200, 1500, 2100, 2400, 2600])).toEqual(
      [
        [0, 900],
        [900, 1500],
        [1500, 2400],
        [2400, 2600],
      ],
    );
    expect(slices(900, [])).toEqual([[0, 900]]);
    expect(slices(5000, [])).toEqual([
      [0, 1029],
      [1029, 2058],
      [2058, 3087],
      [3087, 4116],
      [4116, 5000],
    ]);
  });

  it('keeps the quote selectors, and a forced break only when asked for', () => {
    expect(QUOTE_PDF_OPTIONS.breakSelector).toBe(
      '.qd-head, .qd-kpis, .qd-block',
    );
    expect(QUOTE_PDF_OPTIONS.exportClass).toBe('qd-export');
    expect(QUOTE_PDF_OPTIONS.pageBreakBeforeSelector).toBeUndefined();
    // No forced break: identical to the call without the argument.
    expect(slices(2600, [900, 1500], [])).toEqual(slices(2600, [900, 1500]));
    // A forced break ends the page there even when more would fit.
    expect(slices(2000, [300, 900], [400])).toEqual([
      [0, 400],
      [400, 900],
      [900, 1929],
      [1929, 2000],
    ]);
  });
});
