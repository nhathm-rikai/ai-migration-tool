import { documentsToGenerate, packageFileNames } from '@portal/contracts';
import { describe, expect, it } from 'vitest';
import {
  createPackageTracker,
  templateSections,
  generationState,
  parsePackage,
  taskPrompt,
} from './spec-context.js';

// SD-CT-07 companions, the task text and how a package answer is accepted.

const doc = (title: string, state: string) =>
  `# ${title}\n\n| Mục | Giá trị |\n| --- | --- |\n| Unit/program | P |\n| Trạng thái sinh | ${state} |\n\n## Câu hỏi mở\n\nKhông có\n`;

function answer(files: Record<string, string>) {
  return Object.entries(files)
    .map(([name, body]) => `=== FILE: ${name} ===\n${body}\n=== END FILE ===`)
    .join('\n');
}

describe('specification-design package', () => {
  it('adds SD-CT-07 companions in generation order, one file per document', () => {
    expect(documentsToGenerate(['business-rules'])).toEqual(['business-rules']);
    expect(documentsToGenerate(['basic-design'])).toEqual([
      'business-rules',
      'basic-design',
    ]);
    expect(documentsToGenerate(['detail-design', 'db-design'])).toEqual([
      'business-rules',
      'db-design',
      'basic-design',
      'detail-design',
    ]);
    // Security audit stands alone and is written last.
    expect(documentsToGenerate(['security-audit'])).toEqual(['security-audit']);
    expect(documentsToGenerate(['security-audit', 'basic-design'])).toEqual([
      'business-rules',
      'basic-design',
      'security-audit',
    ]);
    // Pack 0.9.0: no coverage.md / open-questions.md.
    expect(packageFileNames(['business-rules', 'db-design'])).toEqual([
      'business-rules.md',
      'db-design.md',
    ]);
  });

  it('asks for exactly the package files, read-only, in the chosen language', () => {
    const prompt = taskPrompt({
      generated: ['business-rules', 'db-design'],
      language: 'ja',
    });
    expect(prompt).toContain('in this order: business-rules.md, db-design.md.');
    expect(prompt).toContain('rules/security-audit.md');
    expect(prompt).not.toContain('coverage');
    expect(prompt).not.toContain('open-questions');
    expect(prompt).toContain('| 生成状態 |');
    expect(prompt).not.toContain('Trạng thái sinh');
    expect(prompt).toContain('No Vietnamese may remain');
    expect(prompt).toContain('context/input-context.md');
    expect(prompt).toContain('OUTPUT LANGUAGE: Japanese');
    expect(prompt).toContain('section headings, table headers');
    expect(prompt).toContain('read-only');
  });

  it('accepts a package whose documents are all "hoàn tất"', () => {
    const expected = packageFileNames(['business-rules', 'db-design']);
    const parsed = parsePackage(
      `noise before\n${answer({
        'db-design.md': doc('DB', '`hoàn tất`'),
        'business-rules.md': doc('BR', 'hoàn tất (10/10 procedure)'),
      })}`,
      expected,
    );
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    expect(parsed.files.map((file) => file.name)).toEqual(expected);
    expect(parsed.files[0]?.content).toContain('# BR');
  });

  it('rejects missing, unexpected or duplicated files', () => {
    const expected = packageFileNames(['db-design']);
    expect(parsePackage(answer({}), expected)).toMatchObject({
      status: 'invalid',
    });
    expect(
      parsePackage(
        answer({
          'db-design.md': doc('DB', 'hoàn tất'),
          'coverage.md': doc('Coverage', 'hoàn tất'),
        }),
        expected,
      ),
    ).toEqual({ status: 'invalid', reason: 'unexpected file coverage.md' });
  });

  it('keeps a package out while a document is "đang sinh" or has no state (SD-CT-08)', () => {
    const expected = packageFileNames(['business-rules', 'db-design']);
    expect(
      parsePackage(
        answer({
          'business-rules.md': doc('BR', 'hoàn tất'),
          'db-design.md': doc('DB', 'đang sinh — dừng ở ORDERS'),
        }),
        expected,
      ),
    ).toEqual({ status: 'incomplete' });
    expect(
      parsePackage(
        answer({
          'business-rules.md': doc('BR', 'hoàn tất'),
          'db-design.md': '# DB\n\nno header\n',
        }),
        expected,
      ),
    ).toEqual({ status: 'incomplete' });
    expect(generationState('| **Trạng thái sinh** | `hoàn tất` |')).toBe(
      'hoàn tất',
    );
    expect(generationState('| 生成状態 | `完了` |')).toBe('hoàn tất');
    expect(generationState('| 生成状態 | 生成中 — ORDERS |')).toBe('đang sinh');
    expect(generationState('| Generation status | Complete |')).toBe(
      'hoàn tất',
    );
    expect(generationState('| Generation status | in progress |')).toBe(
      'đang sinh',
    );
    expect(generationState('# no header')).toBeUndefined();
  });

  it('follows FILE markers live, even when a chunk cuts a marker in two', () => {
    const changes: string[] = [];
    const tracker = createPackageTracker(
      ['business-rules.md', 'db-design.md'],
      (name, status) => changes.push(`${name}:${status}`),
    );
    const text = answer({
      'business-rules.md': doc('BR', 'hoàn tất'),
      'db-design.md': doc('DB', 'hoàn tất'),
    });
    for (let at = 0; at < text.length; at += 7)
      tracker.push(text.slice(at, at + 7));
    tracker.end();
    expect(changes).toEqual([
      'business-rules.md:writing',
      'business-rules.md:written',
      'db-design.md:writing',
      'db-design.md:written',
    ]);
  });

  it('counts template sections and the sections written live', () => {
    expect(
      templateSections('# T\n\n## A\n### B\ntext\n#### deep\n## C\n'),
    ).toBe(5);
    const sections: string[] = [];
    const tracker = createPackageTracker(
      ['business-rules.md'],
      () => {},
      (name) => sections.push(name),
    );
    tracker.push(answer({ 'business-rules.md': doc('BR', 'hoàn tất') }));
    tracker.end();
    // "# BR", the "Trạng thái sinh" row and "## Câu hỏi mở".
    expect(sections).toHaveLength(3);
  });
});
