import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import assert from 'node:assert/strict';
import { createApp } from '../app.js';
import { pptx, pdf, docx, longPdf, studyText } from './fixtures.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'your_openai_api_key_here') {
  console.error('Live tests not executed: add a valid OPENAI_API_KEY to server/.env. No AI requests were made.');
  process.exit(2);
}
const app = createApp({ rateLimitMax: 30 });
const slides = await pptx();
const notes = await pdf();
const longNotes = await longPdf();
const cases = [
  { name: 'Biology / Rabbit / no files', topic: 'Rabbit', subject: 'biology', difficulty: 'beginner', count: 10, files: [] },
  { name: 'Computer Science / Data Structures / no files', topic: 'Data Structures', subject: 'cs', count: 10, files: [] },
  { name: "Physics / Newton's Laws / no files", topic: "Newton's Laws", subject: 'physics', count: 10, files: [] },
  { name: 'Mathematics / Algebra / no files', topic: 'Algebra', subject: 'math', count: 10, files: [] },
  { name: 'Markdown-only', topic: '', count: 5, files: [[Buffer.from('# Study notes\n\n' + studyText), 'notes.md']] },
  { name: 'Topic-only Operating Systems / Intermediate / 10 questions', topic: 'Operating Systems', count: 10, files: [] },
  { name: 'PPTX-only', topic: '', count: 5, files: [[slides, 'lecture.pptx']] },
  { name: 'PDF-only', topic: '', count: 5, files: [[notes, 'notes.pdf']] },
  { name: 'Combined PPTX and PDF', topic: '', count: 5, files: [[slides, 'lecture.pptx'], [notes, 'notes.pdf']] },
  { name: '180-page PDF with beginning/middle/end coverage', topic: '', count: 5, files: [[longNotes, 'long-lecture.pdf']] },
  { name: 'DOCX and Markdown together', topic: '', count: 5, files: [[await docx(), 'notes.docx'], [Buffer.from('# Study notes\n\n' + studyText), 'notes.md']] },
  { name: 'Leader Election focus with PPTX', topic: 'Leader Election', count: 5, files: [[slides, 'lecture.pptx']] },
];
let failed = false;
for (const scenario of cases.filter(c => !process.env.LIVE_CASE_FILTER || c.name.includes(process.env.LIVE_CASE_FILTER))) {
  try {
    const settings = { topic: scenario.topic, subject: scenario.subject || 'cs', difficulty: scenario.difficulty || 'intermediate', questionCount: scenario.count };
    let req = request(app).post('/api/generate');
    if (scenario.files.length) {
      for (const [key, value] of Object.entries(settings)) req = req.field(key, String(value));
      for (const [buffer, name] of scenario.files) req = req.attach('files', buffer, name);
    } else req = req.send(settings);
    const response = await req;
    assert.equal(response.status, 200, response.body.error?.message || 'Generation failed');
    assert.equal(response.body.quiz.questions.length, scenario.count);
    assert.equal(response.body.metadata.documents.length, scenario.files.length);
    assert.equal(response.body.metadata.sourceMode, scenario.files.length ? 'materials' : 'topic');
    if (!scenario.files.length) assert.ok(response.body.quiz.questions.every(q => q.sourceReference === null));
    if (scenario.name.startsWith('180-page')) {
      assert.equal(response.body.metadata.documents[0].pageCount, 180);
      assert.equal(response.body.metadata.documents[0].selection.applied, true);
      const pages = response.body.quiz.questions.map(q => q.sourceReference.sourceNumber);
      assert.ok(pages.some(n => n <= 60) && pages.some(n => n > 60 && n <= 120) && pages.some(n => n > 120));
      console.log(`Long-PDF source pages: ${pages.join(', ')}`);
    }
    console.log(`PASS: ${scenario.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL: ${scenario.name}: ${error.message}`);
  }
}
if (failed) process.exitCode = 1;
