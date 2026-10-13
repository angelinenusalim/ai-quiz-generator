import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { pptx, pdf } from './fixtures.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
  console.error('Live tests not executed: add a valid OPENAI_API_KEY to server/.env. No AI requests were made.');
  process.exit(2);
}
const app = createApp({ rateLimitMax: 30 });
const slides = await pptx();
const notes = await pdf();
const cases = [
  { name: 'Topic-only Operating Systems / Intermediate / 10 questions', topic: 'Operating Systems', count: 10, files: [] },
  { name: 'PPTX-only', topic: '', count: 5, files: [[slides, 'lecture.pptx']] },
  { name: 'PDF-only', topic: '', count: 5, files: [[notes, 'notes.pdf']] },
  { name: 'Combined PPTX and PDF', topic: '', count: 5, files: [[slides, 'lecture.pptx'], [notes, 'notes.pdf']] },
  { name: 'Leader Election focus with PPTX', topic: 'Leader Election', count: 5, files: [[slides, 'lecture.pptx']] },
];
let failed = false;
for (const scenario of cases) {
  try {
    const settings = { topic: scenario.topic, subject: 'cs', difficulty: 'intermediate', questionCount: scenario.count };
    let req = request(app).post('/api/generate');
    if (scenario.files.length) {
      for (const [key, value] of Object.entries(settings)) req = req.field(key, String(value));
      for (const [buffer, name] of scenario.files) req = req.attach('files', buffer, name);
    } else req = req.send(settings);
    const response = await req;
    assert.equal(response.status, 200, response.body.error?.message || 'Generation failed');
    assert.equal(response.body.quiz.questions.length, scenario.count);
    assert.equal(response.body.metadata.documents.length, scenario.files.length);
    console.log(`PASS: ${scenario.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL: ${scenario.name}: ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
