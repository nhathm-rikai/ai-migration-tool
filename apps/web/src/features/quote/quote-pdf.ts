import { branding } from '../../app/branding';

// Builds the quote PDF in the browser, with no library: the hidden quote
// document is drawn into images (the browser lays out the text, Japanese
// included), cut into A4 pages at row and block boundaries, and written as a
// PDF whose pages are those images. The text in the file is therefore not
// selectable, but the layout is the same on every machine and nothing
// depends on the print dialog.

const PAGE_W = 794; // A4 at 96 dpi, in CSS pixels
const PAGE_H = 1123;
const MARGIN_TOP = 36;
const MARGIN_BOTTOM = 58; // room for the footer
const SIDE = 42;
// Pixels per CSS pixel; lowered for a very long document (canvas limit).
const MAX_SCALE = 3;
const MAX_PIXELS = 15000;
const FONT =
  '"Yu Gothic", "Meiryo", "Hiragino Sans", "Noto Sans JP", sans-serif';

const ns = 'http://www.w3.org/1999/xhtml';

// Rules of the stylesheets that style the document, so they can travel
// inside the image (an SVG image cannot see the page's styles).
function documentCss(): string {
  const rules: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let list: CSSRuleList;
    try {
      list = sheet.cssRules;
    } catch {
      continue;
    }
    for (const rule of Array.from(list)) {
      if (
        rule instanceof CSSStyleRule &&
        /qd-|quote-doc-root/.test(rule.selectorText)
      )
        rules.push(rule.cssText);
    }
  }
  return rules.join('\n');
}

const escapeText = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

async function dataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () =>
      reject(reader.error ?? new Error('The image could not be read.'));
    reader.readAsDataURL(blob);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The quote could not be drawn.'));
    image.src = src;
  });
}

function toBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('The page could not be encoded.'));
        void blob
          .arrayBuffer()
          .then((buffer) => resolve(new Uint8Array(buffer)));
      },
      'image/jpeg',
      0.95,
    );
  });
}

// Heights (px from the top of the document) where a page may end.
function breakPoints(root: HTMLElement): number[] {
  const top = root.getBoundingClientRect().top;
  const points: number[] = [];
  const add = (element: Element) =>
    points.push(Math.ceil(element.getBoundingClientRect().bottom - top));
  root.querySelectorAll('.qd-head, .qd-kpis, .qd-block').forEach(add);
  // A block taller than a page (the module table) may also end between
  // its rows, but never leaves the first row or the total row alone.
  const room = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM;
  root.querySelectorAll('.qd-block').forEach((block) => {
    if (block.getBoundingClientRect().height <= room) return;
    block.querySelectorAll('.qd-table tbody').forEach((body) => {
      Array.from(body.children).slice(1, -1).forEach(add);
    });
  });
  return points.sort((a, b) => a - b);
}

// [start, end] of the document that goes on each page.
function slices(height: number, points: number[]): [number, number][] {
  const room = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM;
  const pages: [number, number][] = [];
  let start = 0;
  while (start < height - 1) {
    const limit = start + room;
    let end = height;
    if (height > limit) {
      const fit = points.filter((y) => y > start + 120 && y <= limit);
      end = fit.length > 0 ? Math.max(...fit) : limit;
    }
    pages.push([start, end]);
    start = end;
  }
  return pages;
}

function pdf(pages: { jpeg: Uint8Array; width: number; height: number }[]) {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let size = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? encoder.encode(data) : data;
    parts.push(bytes);
    size += bytes.length;
  };
  const object = (id: number, body: () => void) => {
    offsets[id] = size;
    push(`${id} 0 obj\n`);
    body();
    push('\nendobj\n');
  };
  // 1 catalog, 2 pages, then three objects per page: page, content, image.
  const total = 2 + pages.length * 3;
  push('%PDF-1.4\n%âãÏÓ\n');
  object(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  object(2, () =>
    push(
      `<< /Type /Pages /Count ${pages.length} /Kids [${pages
        .map((_, index) => `${3 + index * 3} 0 R`)
        .join(' ')}] >>`,
    ),
  );
  const w = (PAGE_W * 72) / 96;
  const h = (PAGE_H * 72) / 96;
  pages.forEach((page, index) => {
    const id = 3 + index * 3;
    object(id, () =>
      push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w.toFixed(2)} ${h.toFixed(2)}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`,
      ),
    );
    const content = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} 0 0 cm /Im0 Do Q`;
    object(id + 1, () =>
      push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`),
    );
    object(id + 2, () => {
      push(
        `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      );
      push(page.jpeg);
      push('\nendstream');
    });
  });
  const xref = size;
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n`);
  for (let id = 1; id <= total; id += 1)
    push(`${String(offsets[id] ?? 0).padStart(10, '0')} 00000 n \n`);
  push(
    `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
  );
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export async function renderQuotePdf(
  source: HTMLElement,
  footerLabel: string,
): Promise<Uint8Array<ArrayBuffer>> {
  // Measure in a bare frame that has only the document's own styles, the
  // same thing the image will see, so the page cuts land where they are
  // measured.
  const css = documentCss();
  const frame = document.createElement('iframe');
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${PAGE_W}px;height:200px;border:0;`;
  frame.srcdoc = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0}${css}</style><body></body>`;
  const loaded = new Promise((resolve) => {
    frame.onload = resolve;
  });
  document.body.append(frame);
  try {
    await loaded;
    const frameDocument = frame.contentDocument;
    if (!frameDocument) throw new Error('The quote could not be laid out.');
    const root = frameDocument.importNode(source, true);
    root.classList.add('qd-export');
    const logo = root.querySelector('img');
    if (logo) logo.setAttribute('src', await dataUrl(branding.logoUrl));
    frameDocument.body.append(root);
    await frameDocument.fonts?.ready;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const height = Math.ceil(root.getBoundingClientRect().height);
    const points = breakPoints(root);
    const SCALE = Math.max(
      1,
      Math.min(MAX_SCALE, Math.floor(MAX_PIXELS / height)),
    );
    const markup = new XMLSerializer().serializeToString(root);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W * SCALE}" height="${height * SCALE}" viewBox="0 0 ${PAGE_W} ${height}">` +
      `<foreignObject width="${PAGE_W}" height="${height}">` +
      `<div xmlns="${ns}"><style>${escapeText(css)}</style>${markup}</div>` +
      '</foreignObject></svg>';
    const image = await loadImage(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    );
    const rendered: { jpeg: Uint8Array; width: number; height: number }[] = [];
    const cuts = slices(height, points);
    for (const [index, [start, end]] of cuts.entries()) {
      const canvas = document.createElement('canvas');
      canvas.width = PAGE_W * SCALE;
      canvas.height = PAGE_H * SCALE;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('The page could not be drawn.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(
        image,
        0,
        start * SCALE,
        PAGE_W * SCALE,
        (end - start) * SCALE,
        0,
        MARGIN_TOP * SCALE,
        PAGE_W * SCALE,
        (end - start) * SCALE,
      );
      const footerY = (PAGE_H - 30) * SCALE;
      context.fillStyle = '#d5dde6';
      context.fillRect(
        SIDE * SCALE,
        footerY - 14 * SCALE,
        (PAGE_W - SIDE * 2) * SCALE,
        SCALE,
      );
      context.fillStyle = '#55657a';
      context.font = `${10 * SCALE}px ${FONT}`;
      context.textBaseline = 'middle';
      context.textAlign = 'left';
      context.fillText(footerLabel, SIDE * SCALE, footerY);
      context.textAlign = 'right';
      context.fillText(
        `${index + 1} / ${cuts.length}`,
        (PAGE_W - SIDE) * SCALE,
        footerY,
      );
      rendered.push({
        jpeg: await toBytes(canvas),
        width: canvas.width,
        height: canvas.height,
      });
    }
    return pdf(rendered);
  } finally {
    frame.remove();
  }
}
