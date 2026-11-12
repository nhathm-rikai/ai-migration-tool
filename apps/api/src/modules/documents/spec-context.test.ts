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
    expect(prompt).toContain('headed exactly "未確定事項"');
    expect(prompt).toContain('do not ask questions');
    expect(prompt).toContain('context/input-context.md');
    expect(prompt).toContain('OUTPUT LANGUAGE: Japanese');
    expect(prompt).toContain('section headings, table headers');
    expect(prompt).toContain('read-only');
  });

  // A LIVE run ended with "次の回で続けます" before the last document: there
  // is no next turn, so the package lacked a file and was rejected whole.
  it('says the session is the only one and every file must be in the answer', () => {
    const prompt = taskPrompt({
      generated: ['business-rules', 'it-test-spec'],
      language: 'ja',
    });
    expect(prompt).toContain('THIS IS THE ONLY SESSION');
    expect(prompt).toContain('Never end with a promise to continue');
    expect(prompt).toContain('a block for EVERY file listed below');
    // The rule comes before the file list the fake runner reads.
    expect(prompt.indexOf('THIS IS THE ONLY SESSION')).toBeLessThan(
      prompt.indexOf('in this order: business-rules.md, it-test-spec.md.'),
    );
  });

  it('describes the integration checklist only when it-test-spec is generated', () => {
    const withIt = taskPrompt({ generated: ['it-test-spec'], language: 'vi' });
    expect(withIt).toContain('context/p1/1.5-it-skeleton.json');
    expect(withIt).toContain('"counterparts"');
    expect(withIt).toContain('ít nhất một program trong danh sách');
    const without = taskPrompt({ generated: ['ut-test-spec'], language: 'vi' });
    expect(without).not.toContain('1.5-it-skeleton.json');
    expect(without).toContain('context/p1/1.4-ut-skeleton.json');
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

  it('drops a block cut by an output limit and keeps the restarted one', () => {
    const expected = packageFileNames(['business-rules', 'db-design']);
    const parsed = parsePackage(
      `${answer({ 'business-rules.md': doc('BR', 'hoàn tất') })}\n=== FILE: db-design.md ===\n${doc('DB cut', 'đang sinh').slice(0, 40)}\n${answer({ 'db-design.md': doc('DB', 'hoàn tất') })}`,
      expected,
    );
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    expect(parsed.files[1]?.content).toContain('# DB\n');
    expect(parsed.files[1]?.content).not.toContain('cut');
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

  // A LIVE run of seven documents was rejected as "missing" five files the
  // log showed as written. The answer is not kept, so the reason has to say
  // what was seen.
  it('says which missing files were started and never closed', () => {
    const expected = packageFileNames(['business-rules', 'db-design']);
    const raw = [
      '=== FILE: business-rules.md ===',
      doc('BR', 'hoàn tất'),
      '=== FILE: db-design.md ===',
      doc('DB', 'hoàn tất'),
      '=== END FILE ===',
    ].join('\n');
    expect(parsePackage(raw, expected)).toEqual({
      status: 'invalid',
      reason:
        'missing business-rules.md (started without "=== END FILE ===": business-rules.md)',
    });
    // Never started: nothing to add.
    expect(
      parsePackage(answer({ 'db-design.md': doc('DB', 'hoàn tất') }), expected),
    ).toEqual({ status: 'invalid', reason: 'missing business-rules.md' });
    // Cut at the end of the answer.
    expect(
      parsePackage(
        `${answer({ 'business-rules.md': doc('BR', 'hoàn tất') })}\n=== FILE: db-design.md ===\n# DB`,
        expected,
      ),
    ).toMatchObject({
      reason:
        'missing db-design.md (started without "=== END FILE ===": db-design.md)',
    });
  });

  it('reads marker lines trimmed: CRLF and trailing spaces are not another marker', () => {
    const expected = packageFileNames(['business-rules', 'db-design']);
    const raw = answer({
      'business-rules.md': doc('BR', 'hoàn tất'),
      'db-design.md': doc('DB', 'hoàn tất'),
    });
    for (const variant of [
      raw.replaceAll('\n', '\r\n'),
      raw.replaceAll('=== END FILE ===', '=== END FILE ===  '),
      raw.replaceAll('=== FILE: ', '  === FILE: '),
    ]) {
      const parsed = parsePackage(variant, expected);
      expect(parsed.status).toBe('ok');
      if (parsed.status !== 'ok') return;
      expect(parsed.files.map((file) => file.name)).toEqual(expected);
      expect(parsed.files[0]?.content).toContain(
        '| Trạng thái sinh | hoàn tất |',
      );
    }
  });

  it('still counts a restarted block once: the cut copy is dropped', () => {
    const expected = packageFileNames(['db-design']);
    const parsed = parsePackage(
      `=== FILE: db-design.md ===\n# cut\n${answer({ 'db-design.md': doc('DB', 'hoàn tất') })}`,
      expected,
    );
    expect(parsed.status).toBe('ok');
    if (parsed.status !== 'ok') return;
    expect(parsed.files[0]?.content.startsWith('# DB')).toBe(true);
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
    ).toMatchObject({ status: 'incomplete' });
    expect(
      parsePackage(
        answer({
          'business-rules.md': doc('BR', 'hoàn tất'),
          'db-design.md': '# DB\n\nno header\n',
        }),
        expected,
      ),
    ).toMatchObject({ status: 'incomplete' });
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
