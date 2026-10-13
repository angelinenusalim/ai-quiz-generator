import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, cp, symlink } from 'node:fs/promises';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { loadEnvironment } from '../environment.js';
import { createQuizGenerator } from '../openaiService.js';
import { completedResponse, quizFixture } from './fixtures.js';

test('Railway runtime variables take precedence over both dotenv file locations', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'quiz-env-'));
  const serverDirectory = path.join(directory, 'server');
  try {
    await mkdir(serverDirectory);
    await writeFile(path.join(directory, '.env'), 'OPENAI_API_KEY=root-test-value\nOPENAI_MODEL=root-model\n');
    await writeFile(path.join(serverDirectory, '.env'), 'OPENAI_API_KEY=server-test-value\nOPENAI_MODEL=server-model\n');
    const env = { OPENAI_API_KEY: 'railway-test-value', OPENAI_MODEL: 'railway-model' };
    loadEnvironment({ env, cwd: directory, serverDirectory });
    assert.equal(env.OPENAI_API_KEY, 'railway-test-value');
    assert.equal(env.OPENAI_MODEL, 'railway-model');
    const local = {};
    loadEnvironment({ env: local, cwd: directory, serverDirectory });
    assert.equal(local.OPENAI_API_KEY, 'server-test-value');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('the original cwd/.env location still works when server/.env does not exist', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'quiz-env-'));
  try {
    await writeFile(path.join(directory, '.env'), 'OPENAI_API_KEY=cwd-test-value\n');
    const env = {};
    loadEnvironment({ env, cwd: directory, serverDirectory: path.join(directory, 'server') });
    assert.equal(env.OPENAI_API_KEY, 'cwd-test-value');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('the real OpenAI SDK initializes with an injected runtime key and sends a structured request', async () => {
  const settings = { topic: 'Operating Systems', subject: 'cs', difficulty: 'intermediate', questionCount: 5 };
  const originalFetch = globalThis.fetch;
  let called = false;
  try {
    globalThis.fetch = async (url, options) => {
      called = true;
      assert.equal(String(url), 'https://api.openai.com/v1/responses');
      // Deliberately non-secret test token. Never print real authorization headers.
      assert.equal(new Headers(options.headers).get('authorization'), 'Bearer injected-test-token');
      const body = JSON.parse(options.body);
      assert.equal(body.text.format.strict, true);
      const completed = completedResponse(quizFixture(settings));
      return new Response(JSON.stringify({
        id: 'test_response', ...completed,
        output: [{ type: 'message', id: 'test_message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: completed.output_text, annotations: [] }] }],
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const generate = createQuizGenerator({ apiKey: 'injected-test-token' });
    assert.equal((await generate(settings, [])).quiz.questions.length, 5);
    assert.ok(called);
  } finally { globalThis.fetch = originalFetch; }
});
test('a Railway deployment containing only server/ can load the production app and document parsers', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'quiz-railway-package-'));
  const serverDirectory = fileURLToPath(new URL('..', import.meta.url));
  try {
    for (const name of ['package.json', 'index.js', 'environment.js', 'app.js', 'errors.js', 'openaiService.js', 'uploads.js', 'validation.js', 'documents', 'shared']) {
      await cp(path.join(serverDirectory, name), path.join(directory, name), { recursive: true });
    }
    await symlink(path.join(serverDirectory, 'node_modules'), path.join(directory, 'node_modules'), 'dir');
    const script = `import { createApp } from './app.js';
      import { parseInWorker } from './documents/index.js';
      createApp({env: {}});
      const doc = await parseInWorker({originalname: 'notes.txt', buffer: Buffer.from('Replication improves availability.')});
      if (doc.sections[0].text !== 'Replication improves availability.') throw new Error('Extraction failed');
      console.log('server-only deployment loads and extracts documents');`;
    await writeFile(path.join(directory, 'deploy-check.mjs'), script);
    const { stdout } = await promisify(execFile)(process.execPath, ['deploy-check.mjs'], { cwd: directory });
    assert.match(stdout, /server-only deployment loads/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
