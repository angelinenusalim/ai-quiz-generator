import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInWorker, processDocuments } from '../documents/index.js';
import { extractPdfPages } from '../documents/pdf.js';
import { selectMaterials, planQuestions } from '../documents/materials.js';
import { LIMITS, validateQuiz } from '../shared/quiz.js';
import { createQuizGenerator, buildInput } from '../openaiService.js';
import { longPdf, quizFixture, mockClient, completedResponse, studyText } from './fixtures.js';

const settings = { topic: '', subject: 'cs', difficulty: 'intermediate', questionCount: 5 };
test('180-page real PDF uses 18 batches, retains final page, and stays within worker budget', async () => {
  const document = await parseInWorker({ buffer: await longPdf(), originalname: 'long.pdf' });
  assert.equal(document.pageCount, 180);
  assert.equal(document.processing.batchCount, 18);
  assert.equal(document.sections.length, 180);
  assert.equal(document.sections.at(-1).sourceNumber, 180);
  assert.match(document.sections.at(-1).text, /Final concept: checkpoints/);
  assert.ok(document.characterCount > 80_000);
  assert.ok(document.processing.durationMs < LIMITS.pdfTimeoutMs);
  assert.ok(document.processing.peakHeapBytes < 224 * 1024 * 1024);
  console.log(`180-page PDF: ${document.characterCount} characters, ${document.processing.durationMs} ms, sampled worker heap ${(document.processing.peakHeapBytes / 1024 / 1024).toFixed(1)} MB`);
});
test('all PDF pages are visited in batches; blank/scanned pages warn and real text budgets fail', async () => {
  const calls = [];
  const parser = { getInfo: async () => ({ total: 161 }), getText: async ({ first, last }) => {
    calls.push([first, last]);
    return { pages: Array.from({ length: last - first + 1 }, (_, n) => ({ num: first + n, text: first + n === 80 ? '' : 'Read this page.' })) };
  } };
  const document = await extractPdfPages(parser);
  assert.equal(calls.length, 17);
  assert.deepEqual(calls.at(-1), [161, 161]);
  assert.match(document.warnings[0], /page 80.*scanned/);
  await assert.rejects(extractPdfPages(parser, { characterLimit: 20 }), e => e.code === 'DOCUMENT_TEXT_LIMIT' && /memory budget/.test(e.message));
});
test('long study sets select across every chunk, keep exact quotes and cap actual JSON context', async () => {
  const docs = await processDocuments([{ buffer: await longPdf(), originalname: 'long.pdf' }, { buffer: Buffer.from('# Markdown notes\n' + studyText), originalname: 'notes.md' }]);
  const selected = selectMaterials(docs);
  assert.ok(JSON.stringify(selected.map(({ fileName, sections }) => ({ fileName, sections }))).length <= LIMITS.contextCharacters);
  assert.equal(selected[0].selection.applied, true);
  assert.equal(selected[1].selection.applied, false);
  assert.ok(selected[0].selection.chunkCount >= 18);
  assert.equal(selected[0].sections[0].sourceNumber, 1);
  assert.equal(selected[0].sections.at(-1).sourceNumber, 180);
  for (const section of selected[0].sections) {
    const original = docs[0].sections.find(s => s.sectionId === section.sectionId || section.sectionId.startsWith(s.sectionId + 'p'));
    assert.ok(original.text.includes(section.text));
    assert.equal(original.sourceNumber, section.sourceNumber);
  }
  assert.deepEqual(new Set(selected[0].sections.map(s => s.coverageBand)), new Set(['beginning', 'middle', 'end']));
});
test('topic relevance examines late passages even when earlier material fills the context', () => {
  const sections = Array.from({ length: 240 }, (_, n) => ({ sectionId: `f1s${n + 1}`, sourceType: 'page', sourceNumber: n + 1, text: n === 213 ? 'LSTM forget gates decide which information to discard from the cell state. '.repeat(10) : studyText }));
  const docs = [{ fileName: 'lecture.pdf', sections, characterCount: sections.reduce((sum, s) => sum + s.text.length, 0) }];
  const selected = selectMaterials(docs, 'LSTM forget gates');
  assert.ok(selected[0].sections.some(s => s.sourceNumber === 214));
  assert.ok(buildInput(settings, selected).length < LIMITS.contextCharacters + 1000);
});
test('large-document generation makes one API call, validates excerpts and rejects prefix-only coverage', async () => {
  const docs = await processDocuments([{ buffer: await longPdf(), originalname: 'long.pdf' }]);
  let calls = 0;
  const generate = createQuizGenerator({ client: mockClient(async params => {
    calls++;
    const input = JSON.parse(params.input[0].content);
    const materials = input.studyMaterials;
    const quiz = quizFixture(settings, materials);
    assert.equal(input.questionPlan.length, settings.questionCount);
    assert.deepEqual(new Set(input.questionPlan.map(p => materials[0].sections.find(s => s.sectionId === p.sectionId).coverageBand)), new Set(['beginning', 'middle', 'end']));
    return completedResponse(quiz);
  }) });
  const result = await generate(settings, docs);
  assert.equal(calls, 1);
  assert.match(result.warnings[0], /All 180 pages were examined/);
  for (const q of result.quiz.questions) {
    const original = docs[0].sections.find(s => s.sourceNumber === q.sourceReference.sourceNumber);
    assert.ok(original.text.includes(q.sourceReference.sourceQuote));
  }
  const selected = selectMaterials(docs);
  const prefixQuiz = quizFixture(settings, selected);
  for (const question of prefixQuiz.questions) question.sourceReference = result.quiz.questions[0].sourceReference;
  assert.throws(() => validateQuiz(prefixQuiz, settings, selected), /beginning, middle, and end/);
});
test('cancelling a queued parser does not start it or block later documents', async () => {
  const controller = new AbortController();
  const first = parseInWorker({ buffer: await longPdf(), originalname: 'first.pdf' });
  const cancelled = parseInWorker({ buffer: Buffer.from('not a PDF'), originalname: 'cancelled.pdf' }, { signal: controller.signal });
  const third = parseInWorker({ buffer: Buffer.from(studyText), originalname: 'third.md' });
  controller.abort();
  await assert.rejects(cancelled, e => e.code === 'REQUEST_TIMEOUT');
  const documents = await Promise.all([first, third]);
  assert.equal(documents[0].pageCount, 180);
  assert.match(documents[1].sections[0].text, /replication/);
});

test('small document fragmentation preserves all text and each quote fits the public contract', () => {
  const text = '# Markdown heading\n\n' + studyText.repeat(4);
  const docs = [{ fileName: 'small.md', characterCount: text.length, sections: [{ sectionId: 'f1s1', sourceType: 'section', sourceNumber: 1, text }] }];
  const selected = selectMaterials(docs);
  assert.equal(selected[0].selection.applied, false);
  assert.equal(selected[0].sections.map(s => s.text).join(''), text);
  assert.ok(selected[0].sections.every(s => s.text.length <= 1500 && s.sourceNumber === 1));
  assert.equal(new Set(selected[0].sections.map(s => s.sectionId)).size, selected[0].sections.length);
});
test('a topic plan reuses relevant passages before unrelated unused passages', () => {
  const docs = [{ fileName: 'notes.md', selection: { applied: false }, sections: [
    { sectionId: 'f1s1', text: 'LSTM forget gates decide which information to discard from the cell state.' },
    { sectionId: 'f1s2', text: studyText },
  ] }];
  const plan = planQuestions({ ...settings, topic: 'LSTM forget gates' }, docs);
  assert.equal(plan.length, 5);
  assert.ok(plan.every(p => p.sectionId === 'f1s1'));
});

test('a short multi-file quiz balances document bands across the study set', () => {
  const docs = [1, 2].map(n => ({ fileName: `${n}.pdf`, selection: { applied: true }, sections: ['beginning', 'middle', 'end'].map((coverageBand, index) => ({ sectionId: `f${n}s${index + 1}`, coverageBand, text: studyText })) }));
  const plan = planQuestions(settings, docs);
  assert.equal(plan.length, 5);
  assert.equal(new Set(plan.map(p => p.fileName)).size, 2);
  assert.deepEqual(new Set(plan.map(p => docs.find(d => d.fileName === p.fileName).sections.find(s => s.sectionId === p.sectionId).coverageBand)), new Set(['beginning', 'middle', 'end']));
});
