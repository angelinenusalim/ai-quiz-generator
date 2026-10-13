import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { createQuizGenerator } from '../openaiService.js';
import { SUBJECTS } from '../shared/quiz.js';
import { completedResponse, quizFixture, mockClient, pptx, pdf, docx, studyText } from './fixtures.js';

const settings = { topic: 'Operating Systems', subject: 'cs', difficulty: 'intermediate', questionCount: 10 };
function appWithMock(options = {}) {
  const calls = [];
  const generate = createQuizGenerator({ client: mockClient(async params => {
    calls.push(params);
    const input = JSON.parse(params.input[0].content);
    const original = { ...input.settings, subject: Object.keys(SUBJECTS).find(id => SUBJECTS[id] === input.settings.subject) };
    return completedResponse(quizFixture(original, input.studyMaterials));
  }) });
  return { app: createApp({ generate, ...options }), calls };
}
const multipartSettings = (req, overrides = {}) => Object.entries({ ...settings, ...overrides }).reduce((r, [key, value]) => r.field(key, String(value)), req);

test('health endpoint works when generation is not configured', async () => {
  const app = createApp({ env: {} });
  const health = await request(app).get('/api/health').expect(200);
  assert.equal(health.body.generationConfigured, false);
  const result = await request(app).post('/api/generate').send(settings).expect(503);
  assert.equal(result.body.error.code, 'API_NOT_CONFIGURED');
});
test('topic-only API generates exactly 10 structured questions with distinct settings', async () => {
  const { app, calls } = appWithMock();
  const response = await request(app).post('/api/generate').send(settings).expect(200);
  assert.equal(response.body.quiz.questions.length, 10);
  assert.ok(response.body.quiz.questions.every(q => q.options.length === 4));
  assert.equal(response.body.metadata.sourceMode, 'topic');
  assert.equal(calls.length, 1);
});
test('the API respects all question counts and all difficulty levels', async () => {
  const { app } = appWithMock({ rateLimitMax: 30 });
  for (const questionCount of [5, 10, 15, 20]) {
    for (const difficulty of ['beginner', 'intermediate', 'advanced']) {
      const response = await request(app).post('/api/generate').send({ ...settings, questionCount, difficulty }).expect(200);
      assert.equal(response.body.quiz.questions.length, questionCount);
      assert.equal(response.body.quiz.difficulty, difficulty);
    }
  }
});
test('five valid files can be uploaded and each is represented in a five-question quiz', async () => {
  const { app } = appWithMock();
  let req = multipartSettings(request(app).post('/api/generate'), { topic: '', questionCount: 5 });
  for (let n = 0; n < 5; n++) req = req.attach('files', Buffer.from(studyText), `lecture-${n}.txt`);
  const response = await req.expect(200);
  assert.equal(response.body.metadata.documents.length, 5);
  assert.equal(new Set(response.body.quiz.questions.map(q => q.sourceReference.fileName)).size, 5);
});
test('Unicode filenames are preserved in metadata and citations', async () => {
  const { app } = appWithMock();
  const response = await multipartSettings(request(app).post('/api/generate'), { topic: '', questionCount: 5 }).attach('files', Buffer.from(studyText), '讲义.txt').expect(200);
  assert.equal(response.body.metadata.documents[0].fileName, '讲义.txt');
  assert.equal(response.body.quiz.questions[0].sourceReference.fileName, '讲义.txt');
});
test('PPTX-only, PDF-only, DOCX, TXT and MD requests use real extracted text and accurate references', async () => {
  const cases = [[await pptx(), 'lecture.pptx'], [await pdf(), 'notes.pdf'], [await docx(), 'notes.docx'], [Buffer.from(studyText), 'notes.txt'], [Buffer.from('# Notes\n\n' + studyText), 'notes.md']];
  for (const [buffer, fileName] of cases) {
    const { app, calls } = appWithMock();
    const response = await multipartSettings(request(app).post('/api/generate'), { topic: '', questionCount: 5 }).attach('files', buffer, { filename: fileName }).expect(200);
    assert.equal(response.body.quiz.questions.length, 5);
    assert.equal(response.body.metadata.documents[0].fileName, fileName);
    const materials = JSON.parse(calls[0].input[0].content).studyMaterials;
    assert.match(materials[0].sections[0].text, /Distributed systems/);
    assert.equal(response.body.quiz.questions[0].sourceReference.fileName, fileName);
  }
});
test('multiple materials and a narrowing topic are carried to the AI, with both files processed', async () => {
  for (const topic of ['', 'Leader Election']) {
    const { app, calls } = appWithMock();
    const response = await multipartSettings(request(app).post('/api/generate'), { topic }).attach('files', await pptx(), 'lecture.pptx').attach('files', await pdf(), 'notes.pdf').expect(200);
    assert.equal(response.body.metadata.documents.length, 2);
    const input = JSON.parse(calls[0].input[0].content);
    assert.equal(input.studyMaterials.length, 2);
    assert.equal(input.settings.topic, topic);
    assert.equal(new Set(response.body.quiz.questions.map(q => q.sourceReference.fileName)).size, 2);
  }
});
test('invalid settings, JSON, origins and formats do not reach OpenAI', async () => {
  const { app, calls } = appWithMock();
  await request(app).post('/api/generate').send({}).expect(400);
  await request(app).post('/api/generate').send({ ...settings, questionCount: 7 }).expect(400);
  await request(app).post('/api/generate').set('Content-Type', 'application/json').send('{broken').expect(400);
  await request(app).post('/api/generate').set('Origin', 'https://untrusted.example').send(settings).expect(403);
  await request(app).post('/api/generate').set('Origin', 'http://localhost:5173').send(settings).expect(200);
  await request(app).post('/api/generate').send('text').expect(415);
  await multipartSettings(request(app).post('/api/generate')).attach('files', Buffer.from('binary'), 'program.exe').expect(415);
  await multipartSettings(request(app).post('/api/generate')).attach('files', Buffer.from(studyText), { filename: 'notes.pdf', contentType: 'image/png' }).expect(415);
  assert.equal(calls.length, 1);
});
test('the existing Netlify frontend is allowed by default while unrelated origins are rejected', async () => {
  const { app } = appWithMock();
  const origin = 'https://ai-quiz-generator-angeline.netlify.app';
  const response = await request(app).post('/api/generate').set('Origin', origin).send(settings).expect(200);
  assert.equal(response.headers['access-control-allow-origin'], origin);
  await request(app).options('/api/generate').set('Origin', origin).set('Access-Control-Request-Method', 'POST').expect(204);
  await request(app).post('/api/generate').set('Origin', 'https://another-site.netlify.app').send(settings).expect(403);
});
test('upload count, per-file size, total size and duplicate names are bounded', async () => {
  const { app } = appWithMock({ rateLimitMax: 30 });
  await multipartSettings(request(app).post('/api/generate')).attach('files', Buffer.alloc(10 * 1024 * 1024 + 1, 65), 'huge.txt').expect(413);
  let tooMany = multipartSettings(request(app).post('/api/generate'));
  for (let i = 0; i < 6; i++) tooMany = tooMany.attach('files', Buffer.from(studyText), `${i}.txt`);
  await tooMany.expect(400);
  await multipartSettings(request(app).post('/api/generate')).attach('files', Buffer.from(studyText), 'same.txt').attach('files', Buffer.from(studyText), 'same.txt').expect(400);
  let tooLarge = multipartSettings(request(app).post('/api/generate'));
  for (let i = 0; i < 3; i++) tooLarge = tooLarge.attach('files', Buffer.alloc(9 * 1024 * 1024, 65), `${i}.txt`);
  await tooLarge.expect(413);
});
test('corrupt batch returns file-specific failures, successful names, and no stack traces', async () => {
  const { app, calls } = appWithMock();
  const response = await multipartSettings(request(app).post('/api/generate')).attach('files', Buffer.from(studyText), 'good.txt').attach('files', Buffer.from('corrupt'), 'bad.pptx').expect(422);
  assert.equal(response.body.error.details.failedFiles[0].fileName, 'bad.pptx');
  assert.deepEqual(response.body.error.details.processedFiles, ['good.txt']);
  assert.equal(calls.length, 0);
  assert.equal(response.body.error.stack, undefined);
});
test('rate limiter rejects repeated requests', async () => {
  const { app } = appWithMock({ rateLimitMax: 1 });
  await request(app).post('/api/generate').send(settings).expect(200);
  const response = await request(app).post('/api/generate').send(settings).expect(429);
  assert.equal(response.body.error.code, 'RATE_LIMIT');
});
test('overall request timeout cancels generator and returns a structured failure', async () => {
  let aborted = false;
  const app = createApp({ requestTimeoutMs: 30, generate: async (settings, documents, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
  }) });
  const response = await request(app).post('/api/generate').send(settings).expect(504);
  assert.equal(response.body.error.code, 'REQUEST_TIMEOUT');
  assert.ok(aborted);
});
