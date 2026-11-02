// The last section of a generated document (pack README), headed by its
// language's fixed title. Counts its bullets for the reminder on the screen.
export const UNRESOLVED_HEADINGS = [
  'Điểm chưa xác định',
  '未確定事項',
  'Unresolved points',
];

const heading = /^#{1,6}\s+(.*?)\s*#*$/;

export function isUnresolvedHeading(text: string): boolean {
  const title = text.replace(/^[\d.\s]+/, '').trim();
  return UNRESOLVED_HEADINGS.includes(title);
}

export function countUnresolvedPoints(markdown: string): number {
  let inside = false;
  let count = 0;
  for (const line of markdown.split(/\r?\n/)) {
    const title = heading.exec(line)?.[1];
    if (title !== undefined) inside = isUnresolvedHeading(title);
    else if (inside && /^\s*[-*]\s+\S/.test(line)) count += 1;
  }
  return count;
}
