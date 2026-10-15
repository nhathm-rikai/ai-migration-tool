// Line model shared by every language: 1-based lines split only on CRLF, LF
// or CR; a final newline does not create an extra line (source-analysis §3).
export const SOURCE_NORMALIZATION_VERSION = 'newline-lf-v1';

export type NewlineStyle = 'crlf' | 'lf' | 'cr' | 'mixed' | 'none';

export type SourceLines = {
  lines: string[];
  newlineStyle: NewlineStyle;
  endsWithNewline: boolean;
};

const NEWLINE = /\r\n|\r|\n/g;

export function splitSourceLines(text: string): SourceLines {
  if (text === '')
    return { lines: [], newlineStyle: 'none', endsWithNewline: false };
  const styles = new Set(text.match(NEWLINE) ?? []);
  const lines = text.split(NEWLINE);
  const endsWithNewline = lines.at(-1) === '';
  if (endsWithNewline) lines.pop();
  const [only] = styles;
  const newlineStyle: NewlineStyle =
    styles.size === 0
      ? 'none'
      : styles.size > 1
        ? 'mixed'
        : only === '\r\n'
          ? 'crlf'
          : only === '\n'
            ? 'lf'
            : 'cr';
  return { lines, newlineStyle, endsWithNewline };
}

export function toNormalizedText(source: SourceLines): string {
  return source.lines.join('\n') + (source.endsWithNewline ? '\n' : '');
}

// Evidence quote: lines startLine..endLine (inclusive, 1-based) joined by LF.
export function quoteLines(
  source: SourceLines,
  startLine: number,
  endLine: number,
): string | null {
  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(endLine) ||
    startLine < 1 ||
    startLine > endLine ||
    endLine > source.lines.length
  )
    return null;
  return source.lines.slice(startLine - 1, endLine).join('\n');
}
