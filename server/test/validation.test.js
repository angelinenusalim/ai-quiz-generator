import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSettings } from '../validation.js';
import { validateQuiz, scoreQuiz } from '../shared/quiz.js';
import { quizFixture } from './fixtures.js';

const settings = { topic: 'Operating Systems', subject: 'cs', difficulty: 'intermediate', questionCount: 10 };
test('structured settings support topic, materials, and all question counts', () => {
  assert.deepEqual(validateSettings(settings), settings);
  assert.equal(validateSettings({ topic: '' }, [{}]).topic, '');
  for (const count of [5, 10, 15, 20]) assert.equal(validateSettings({ ...settings, questionCount: String(count) }).questionCount, count);
});
test('invalid settings fail with useful typed errors', () => {
  for (const body of [{}, { ...settings, topic: 1 }, { ...settings, topic: 'x'.repeat(301) }, { ...settings, subject: '__proto__' }, { ...settings, difficulty: 'expert' }, { ...settings, questionCount: 0 }, { ...settings, questionCount: true }, { ...settings, files: [] }, []]) {
    assert.throws(() => validateSettings(body), e => e.status === 400 && Boolean(e.code));
  }
});
test('quiz validator rejects incomplete questions, duplicates, bad answers, and mismatched settings', () => {
  const quiz = quizFixture(settings);
  assert.equal(validateQuiz(quiz, settings, []), quiz);
  const mutations = [
    q => q.questions.pop(), q => q.questions[1].id = 'q1', q => q.questions[0].correctAnswer = 'Z',
    q => q.questions[0].options.pop(), q => q.questions[0].options[1].id = 'A',
    q => q.questions[0].options[1].text = q.questions[0].options[0].text,
    q => q.questions[0].explanation = '', q => q.questions[1].question = q.questions[0].question,
    q => q.difficulty = 'beginner', q => q.questions[0].sourceReference = {},
  ];
  for (const mutate of mutations) { const copy = structuredClone(quiz); mutate(copy); assert.throws(() => validateQuiz(copy, settings, [])); }
});
test('grounded references must match a real section and supporting quote', () => {
  const documents = [{ fileName: 'lecture.pptx', sections: [{ sectionId: 'f1s1', sourceType: 'slide', sourceNumber: 5, text: 'Replication improves availability when nodes fail.' }] }];
  const quiz = quizFixture(settings, documents);
  validateQuiz(quiz, settings, documents);
  for (const [field, value] of [['fileName', 'fake.pdf'], ['sourceNumber', 12], ['sectionId', 'fake'], ['sourceQuote', 'This was never supplied.']]) {
    const copy = structuredClone(quiz); copy.questions[0].sourceReference[field] = value;
    assert.throws(() => validateQuiz(copy, settings, documents));
  }
  assert.throws(() => validateQuiz(quiz, settings, []));
});
test('every document must be covered without a narrowing topic', () => {
  const docs = ['a.txt', 'b.txt'].map((fileName, n) => ({ fileName, sections: [{ sectionId: `f${n}s1`, sourceType: 'section', sourceNumber: 1, text: 'A sufficiently long supporting quotation about replication.' }] }));
  const quiz = quizFixture({ ...settings, topic: '' }, docs.slice(0, 1));
  assert.throws(() => validateQuiz(quiz, { ...settings, topic: '' }, docs));
});
test('scoring is deterministic for all correct, wrong, partial, and unanswered', () => {
  const quiz = quizFixture(settings);
  const correct = Object.fromEntries(quiz.questions.map(q => [q.id, q.correctAnswer]));
  assert.deepEqual(scoreQuiz(quiz, correct), { correct: 10, incorrect: 0, unanswered: 0, total: 10, percentage: 100 });
  const wrong = Object.fromEntries(quiz.questions.map(q => [q.id, q.correctAnswer === 'A' ? 'B' : 'A']));
  assert.equal(scoreQuiz(quiz, wrong).percentage, 0);
  assert.deepEqual(scoreQuiz(quiz, { q1: 'A', q2: 'A' }), { correct: 1, incorrect: 1, unanswered: 8, total: 10, percentage: 10 });
  assert.deepEqual(scoreQuiz(quiz, {}), { correct: 0, incorrect: 0, unanswered: 10, total: 10, percentage: 0 });
});
