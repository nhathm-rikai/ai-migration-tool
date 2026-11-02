// Stand-in for the agent CLI in process tests: reads the prompt on stdin and
// prints events like `claude --print --output-format stream-json`, or like
// `codex exec --json` when argv starts with `exec`. The scenario comes from
// FAKE_AGENT_SCENARIO.
import { spawn } from 'node:child_process';

const scenario = process.env.FAKE_AGENT_SCENARIO ?? 'success';
const argv = process.argv.slice(2);
const emit = (event: unknown) =>
  process.stdout.write(`${JSON.stringify(event)}\n`);

let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  prompt += chunk;
});
function codex() {
  emit({ type: 'thread.started', thread_id: 't1' });
  emit({ type: 'turn.started' });
  if (scenario === 'tools') {
    emit({
      type: 'item.started',
      item: { id: 'i1', type: 'file_change', changes: [] },
    });
    setInterval(() => {}, 1000);
    return;
  }
  if (scenario === 'auth') {
    emit({
      type: 'turn.failed',
      error: { message: 'unexpected status 401 Unauthorized: not logged in' },
    });
    process.exit(1);
  }
  if (scenario === 'hang' || scenario === 'tree') {
    if (scenario === 'tree')
      spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: ['ignore', 'inherit', 'inherit'],
      });
    emit({
      type: 'item.completed',
      item: { id: 'i0', type: 'agent_message', text: 'working…' },
    });
    setInterval(() => {}, 1000);
    return;
  }
  emit({
    type: 'item.completed',
    item: { id: 'i0', type: 'error', message: 'Code Mode is unavailable' },
  });
  emit({
    type: 'item.completed',
    item: { id: 'i1', type: 'reasoning', text: 'thinking' },
  });
  emit({
    type: 'item.completed',
    item: {
      id: 'i2',
      type: 'agent_message',
      text: `# Tài liệu\n\nprompt bytes: ${Buffer.byteLength(prompt)}`,
    },
  });
  emit({
    type: 'turn.completed',
    usage: { input_tokens: 20, cached_input_tokens: 5, output_tokens: 9 },
  });
}

process.stdin.on('end', () => {
  if (argv[0] === 'exec') {
    codex();
    return;
  }
  const listed = argv.includes('--tools')
    ? (argv[argv.indexOf('--tools') + 1] ?? '').split(',').filter(Boolean)
    : ['Read', 'Write', 'Bash'];
  const tools = scenario === 'tools' ? ['Bash'] : listed;
  emit({
    type: 'system',
    subtype: 'init',
    model: 'fake',
    tools,
    mcp_servers: [],
  });
  if (scenario === 'hang' || scenario === 'tree') {
    // `tree`: a grandchild that holds stdout, like a tool subprocess would.
    if (scenario === 'tree')
      spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: ['ignore', 'inherit', 'inherit'],
      });
    emit({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'working…' }] },
    });
    setInterval(() => {}, 1000);
    return;
  }
  if (scenario === 'auth') {
    emit({
      type: 'result',
      subtype: 'success',
      is_error: true,
      result: 'Failed to authenticate: OAuth session expired',
      usage: { input_tokens: 0, output_tokens: 0 },
    });
    process.exit(1);
  }
  if (scenario === 'crash') {
    process.stderr.write('fatal: something broke\n');
    process.exit(3);
  }
  emit({
    type: 'assistant',
    message: {
      content: [
        {
          type: 'tool_use',
          name: scenario === 'bash-call' ? 'Bash' : 'Read',
          input: { file_path: 'source/ORDER.BAS' },
        },
      ],
    },
  });
  if (scenario === 'bash-call') {
    setInterval(() => {}, 1000);
    return;
  }
  // Partial messages: a text block, then the answer in a new block whose
  // first delta has no leading newline.
  const delta = (text: string) =>
    emit({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text },
      },
    });
  emit({ type: 'stream_event', event: { type: 'content_block_start' } });
  delta('Reading done.');
  emit({ type: 'stream_event', event: { type: 'content_block_start' } });
  delta('=== FILE: a.md ===\n# A\n=== END ');
  delta('FILE ===\n');
  // Split one multi-byte character across two writes.
  const text = `# Tài liệu\n\nprompt bytes: ${Buffer.byteLength(prompt)}`;
  const line = Buffer.from(
    `${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }] } })}\n`,
  );
  const cut = line.indexOf(Buffer.from('à')) + 1;
  process.stdout.write(line.subarray(0, cut));
  setTimeout(() => {
    process.stdout.write(line.subarray(cut));
    emit({
      type: 'result',
      subtype: 'success',
      is_error: false,
      result: scenario === 'invalid' ? '' : text,
      usage: { input_tokens: 10, cache_read_input_tokens: 5, output_tokens: 7 },
    });
  }, 20);
});
