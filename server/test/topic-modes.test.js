import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../app.js';
import { createQuizGenerator } from '../openaiService.js';
import { SUBJECTS } from '../shared/quiz.js';
import { completedResponse, mockClient, quizFixture, studyText } from './fixtures.js';

const topics = [['biology', 'Rabbit'], ['cs', 'Data Structures'], ['physics', "Newton's Laws"], ['math', 'Algebra']];
for (const [subject, topic] of topics) test(`${subject}: ${topic} reaches the API without any document processing`, async () => {
  const settings = { topic, subject, difficulty: 'beginner', questionCount: 5 };
  let calls = 0;
  const generate = createQuizGenerator({ client: mockClient(async params => {
    calls++;
    const input = JSON.parse(params.input[0].content);
    assert.equal(input.sourceMode, 'topic');
    assert.equal(input.settings.subject, SUBJECTS[subject]);
    assert.equal(Object.hasOwn(input, 'studyMaterials'), false);
    assert.equal(Object.hasOwn(input, 'questionPlan'), false);
    assert.deepEqual(params.text.format.schema.properties.status.enum, ['ready', 'unsupported_topic']);
    assert.match(params.instructions, /general knowledge and established facts/);
    assert.doesNotMatch(params.instructions, /ground EVERY question|assigned to it/);
    return completedResponse(quizFixture(settings));
  }) });
  const app = createApp({ generate, processFiles: () => { throw new Error('Topic-only requests must bypass document processing.'); } });
  const response = await request(app).post('/api/generate').send(settings).expect(200);
  assert.equal(calls, 1);
  assert.equal(response.body.metadata.sourceMode, 'topic');
  assert.equal(response.body.quiz.questions.length, 5);
  assert.ok(response.body.quiz.questions.every(q => q.options.length === 4 && q.explanation && q.sourceReference === null));
  const health = await request(app).get('/api/health').expect(200);
  assert.equal(health.body.generationVersion, 'topic-modes-v2');
});

const settings = { topic: 'Rabbit', subject: 'biology', difficulty: 'beginner', questionCount: 5 };
const insufficient = { status: 'completed', output_text: JSON.stringify({ status: 'insufficient_material', reason: "There is not enough relevant information available to generate a quiz on the topic of 'Rabbit' in Biology.", quiz: null }) };
test('the exact Rabbit refusal is retried using topic instructions, then accepted when valid', async () => {
  let calls = 0;
  const generate = createQuizGenerator({ client: mockClient(async params => {
    if (++calls === 1) return insufficient;
    assert.match(params.instructions, /Validation feedback: Topic-only generation must not require uploaded materials/);
    assert.match(params.instructions, /without files or source checks/);
    assert.equal(JSON.parse(params.input[0].content).settings.topic, 'Rabbit');
    return completedResponse(quizFixture(settings));
  }) });
  const response = await request(createApp({ generate })).post('/api/generate').send(settings).expect(200);
  assert.equal(response.body.quiz.subject, 'Biology');
  assert.equal(calls, 2);
});
test('repeated model material demands produce a validation cause, never a source-insufficiency error', async () => {
  const generate = createQuizGenerator({ client: mockClient(async () => insufficient) });
  const response = await request(createApp({ generate })).post('/api/generate').send(settings).expect(502);
  assert.equal(response.body.error.code, 'INVALID_AI_RESPONSE');
  assert.deepEqual(response.body.error.details, { sourceMode: 'topic', attempts: 2, cause: 'UNEXPECTED_MATERIAL_REQUIREMENT' });
  assert.doesNotMatch(response.body.error.message, /not enough relevant|smaller study set/);
});
test('an unverifiable topic has a separate structured clarification error', async () => {
  const generate = createQuizGenerator({ client: mockClient(async () => ({ status: 'completed', output_text: JSON.stringify({ status: 'unsupported_topic', reason: 'Please explain which organism or concept this name refers to.', quiz: null }) })) });
  const response = await request(createApp({ generate })).post('/api/generate').send({ ...settings, topic: 'Xyzzy nonexistent organism 123' }).expect(422);
  assert.equal(response.body.error.code, 'TOPIC_UNCLEAR');
  assert.equal(response.body.error.details.cause, 'UNVERIFIABLE_TOPIC');
});
test('a document demand mislabeled as unsupported_topic is still rejected and retried', async () => {
  let calls = 0;
  const generate = createQuizGenerator({ client: mockClient(async () => {
    if (++calls === 1) return { status: 'completed', output_text: JSON.stringify({ status: 'unsupported_topic', reason: 'No study materials were provided. Please upload notes.', quiz: null }) };
    return completedResponse(quizFixture(settings));
  }) });
  await request(createApp({ generate })).post('/api/generate').send(settings).expect(200);
  assert.equal(calls, 2);
});
test('unrelated uploaded content remains source-grounded and can report genuine insufficiency', async () => {
  const generate = createQuizGenerator({ client: mockClient(async params => {
    const input = JSON.parse(params.input[0].content);
    assert.equal(input.sourceMode, 'materials');
    assert.deepEqual(params.text.format.schema.properties.status.enum, ['ready', 'insufficient_material']);
    assert.match(params.instructions, /Do not supplement gaps with outside facts/);
    return { status: 'completed', output_text: JSON.stringify({ status: 'insufficient_material', reason: 'These notes cover distributed systems rather than rabbit biology. Upload relevant notes or generate from the topic alone.', quiz: null }) };
  }) });
  const response = await request(createApp({ generate })).post('/api/generate')
    .field('topic', 'Rabbit').field('subject', 'biology').field('difficulty', 'beginner').field('questionCount', '5')
    .attach('files', Buffer.from(studyText), 'systems.md').expect(422);
  assert.equal(response.body.error.code, 'INSUFFICIENT_MATERIAL');
  assert.match(response.body.error.message, /rather than rabbit biology/);
});
test('malformed output, short quizzes, wrong options and absent explanations keep distinct safe diagnostics', async () => {
  const cases = [
    [{ status: 'completed', output_text: '{broken' }, 'INVALID_JSON'],
    [{ status: 'incomplete', output_text: '{}' }, 'INCOMPLETE_RESPONSE'],
    [completedResponse({ ...quizFixture(settings), questions: [] }), 'QUIZ_VALIDATION_FAILED'],
  ];
  for (const mutate of [q => { q.options.pop(); }, q => { q.correctAnswer = 'E'; }, q => { q.explanation = ''; }]) {
    const quiz = quizFixture(settings); mutate(quiz.questions[0]);
    cases.push([completedResponse(quiz), quiz.questions[0].explanation ? 'INVALID_SCHEMA' : 'QUIZ_VALIDATION_FAILED']);
  }
  for (const [output, cause] of cases) {
    const generate = createQuizGenerator({ client: mockClient(async () => output) });
    const response = await request(createApp({ generate })).post('/api/generate').send(settings).expect(502);
    assert.equal(response.body.error.code, 'INVALID_AI_RESPONSE');
    assert.equal(response.body.error.details.cause, cause);
    assert.doesNotMatch(JSON.stringify(response.body), /\{broken|stack|OPENAI_API_KEY/);
  }
});
test('provider failures and quota errors are not reported as missing source information', async () => {
  for (const [failure, code, status] of [[{ status: 429 }, 'AI_RATE_LIMIT', 429], [{ status: 429, code: 'insufficient_quota' }, 'AI_QUOTA_EXCEEDED', 429], [{ status: 500 }, 'AI_UNAVAILABLE', 502], [{ status: 401 }, 'API_CONFIGURATION_ERROR', 503]]) {
    const generate = createQuizGenerator({ client: mockClient(async () => { throw failure; }) });
    const response = await request(createApp({ generate })).post('/api/generate').send(settings).expect(status);
    assert.equal(response.body.error.code, code);
    assert.doesNotMatch(response.body.error.message, /not enough relevant|study materials/);
  }
});
