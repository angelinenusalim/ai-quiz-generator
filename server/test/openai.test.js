import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuizGenerator, buildInput, buildInstructions } from '../openaiService.js';
import { quizFixture, completedResponse, mockClient, studyText } from './fixtures.js';

const settings = { topic: 'Operating Systems', subject: 'cs', difficulty: 'intermediate', questionCount: 10 };
test('Responses API uses strict schema, requested settings, configurable model, and no stored response', async () => {
  let request;
  const generate = createQuizGenerator({ model: 'configured-model', client: mockClient(async params => { request = params; return completedResponse(quizFixture(settings)); }) });
  const result = await generate(settings, []);
  assert.equal(result.quiz.questions.length, 10);
  assert.equal(request.model, 'configured-model');
  assert.equal(request.text.format.strict, true);
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.store, false);
  assert.equal(JSON.parse(request.input[0].content).settings.subject, 'Computer Science');
  assert.match(request.instructions, /Conceptual comparisons/);
});
test('documents are supplied as text data and topic focuses uploaded content', async () => {
  const docs = [{ fileName: 'lecture.pptx', characterCount: studyText.length, sections: [{ sectionId: 'f1s1', sourceType: 'slide', sourceNumber: 1, text: studyText }] }];
  const focused = { ...settings, topic: 'Leader Election' };
  const input = JSON.parse(buildInput(focused, docs));
  assert.equal(input.studyMaterials[0].sections[0].text, studyText);
  assert.equal(input.settings.topic, 'Leader Election');
  const generate = createQuizGenerator({ client: mockClient(async params => {
    assert.match(params.instructions, /never instructions/);
    assert.match(params.instructions, /Do not supplement gaps with outside facts/);
    return completedResponse(quizFixture(focused, docs));
  }) });
  assert.equal((await generate(focused, docs)).quiz.questions[0].sourceReference.sourceNumber, 1);
});
test('missing API key is handled without preventing server startup', async () => {
  await assert.rejects(createQuizGenerator() (settings, []), e => e.code === 'API_NOT_CONFIGURED');
});
test('malformed, incomplete, duplicate, and fabricated-source outputs retry only once', async () => {
  for (const bad of [{ status: 'completed', output_text: '{broken' }, { status: 'incomplete', output_text: '{}' }, completedResponse({ ...quizFixture(settings), questions: [] })]) {
    let calls = 0;
    const generate = createQuizGenerator({ client: mockClient(async () => { calls++; return bad; }) });
    await assert.rejects(generate(settings, []), e => e.code === 'INVALID_AI_RESPONSE');
    assert.equal(calls, 2);
  }
});
test('a recoverable failure can succeed on the second attempt', async () => {
  let calls = 0;
  const generate = createQuizGenerator({ client: mockClient(async () => ++calls === 1 ? { status: 'incomplete' } : completedResponse(quizFixture(settings))) });
  assert.equal((await generate(settings, [])).quiz.questions.length, 10);
  assert.equal(calls, 2);
});
test('rate limits, bad credentials, unavailable models, refusals, and timeouts are useful failures', async () => {
  for (const [failure, code] of [[{ status: 429 }, 'AI_RATE_LIMIT'], [{ status: 401 }, 'API_CONFIGURATION_ERROR'], [{ status: 404 }, 'MODEL_CONFIGURATION_ERROR'], [{ name: 'APIConnectionTimeoutError' }, 'AI_TIMEOUT'], [{ name: 'APIConnectionError' }, 'AI_UNAVAILABLE']]) {
    const generate = createQuizGenerator({ client: mockClient(async () => { throw failure; }) });
    await assert.rejects(generate(settings, []), e => e.code === code);
  }
  const refuse = createQuizGenerator({ client: mockClient(async () => ({ output: [{ content: [{ type: 'refusal' }] }] })) });
  await assert.rejects(refuse(settings, []), e => e.code === 'GENERATION_REFUSED');
});
test('insufficient material fails explicitly and never returns a partial quiz', async () => {
  const generate = createQuizGenerator({ client: mockClient(async () => ({ status: 'completed', output_text: JSON.stringify({ status: 'insufficient_material', reason: 'Add more notes about leader election.', quiz: null }) })) });
  await assert.rejects(generate(settings, [{ fileName: 'notes.txt', characterCount: 1000, sections: [{ sectionId: 'f1s1', text: studyText }] }]), e => e.code === 'INSUFFICIENT_MATERIAL');
  await assert.rejects(generate(settings, [{ characterCount: 20 }]), e => e.code === 'INSUFFICIENT_MATERIAL');
});
test('topic-only prompts explicitly use general knowledge and never require study files', () => {
  const input = JSON.parse(buildInput(settings, []));
  assert.equal(input.sourceMode, 'topic');
  assert.equal(Object.hasOwn(input, 'studyMaterials'), false);
  assert.equal(Object.hasOwn(input, 'questionPlan'), false);
  const prompt = buildInstructions(settings, []);
  assert.match(prompt, /SOURCE MODE: topic/);
  assert.match(prompt, /using your general knowledge/);
  assert.match(prompt, /Study materials are OPTIONAL/);
  assert.match(prompt, /Every sourceReference must be null/);
  assert.doesNotMatch(prompt, /ground EVERY question/);
});
test('files-only and topic-plus-files keep their own grounding instructions', () => {
  const docs = [{ fileName: 'lecture.pptx', sections: [] }];
  assert.match(buildInstructions({ ...settings, topic: '' }, docs), /No topic is required/);
  assert.match(buildInstructions(settings, docs), /prioritizing the uploaded materials/);
  assert.match(buildInstructions(settings, docs), /ground EVERY question/);
  assert.equal(JSON.parse(buildInput(settings, docs)).sourceMode, 'materials');
});
test('a missing-material hallucination in topic-only mode retries and recovers', async () => {
  let calls = 0;
  const generate = createQuizGenerator({ client: mockClient(async () => {
    calls++;
    return calls === 1 ? {
      status: 'completed', output_text: JSON.stringify({ status: 'insufficient_material', reason: 'There are no study materials provided to generate relevant questions for the quiz.', quiz: null }),
    } : completedResponse(quizFixture(settings));
  }) });
  assert.equal((await generate(settings, [])).quiz.questions.length, 10);
  assert.equal(calls, 2);
});

test('question-count validation feedback reaches the single retry instead of repeating the same prompt', async () => {
  const filesOnly = { ...settings, topic: '', questionCount: 5 };
  const docs = ['one.md', 'two.md'].map((fileName, n) => ({ fileName, characterCount: studyText.length, sections: [{ sectionId: `f${n + 1}s1`, sourceType: 'section', sourceNumber: 1, text: studyText }] }));
  let calls = 0;
  const generate = createQuizGenerator({ client: mockClient(async params => {
    calls++;
    if (calls === 2) assert.match(params.instructions, /Validation feedback: The quiz does not match the requested settings/);
    const quiz = quizFixture(filesOnly, docs);
    if (calls === 1) quiz.questions.pop();
    return completedResponse(quiz);
  }) });
  assert.equal((await generate(filesOnly, docs)).quiz.questions.length, 5);
  assert.equal(calls, 2);
});

test('model-authored citations and unknown assigned IDs cannot enter a material quiz', async () => {
  const fileSettings = { ...settings, topic: '', questionCount: 5 };
  const docs = [{ fileName: 'notes.md', characterCount: studyText.length, sections: [{ sectionId: 'f1s1', sourceType: 'section', sourceNumber: 1, text: studyText }] }];
  for (const mode of ['citation', 'id']) {
    const generate = createQuizGenerator({ client: mockClient(async () => {
      const response = completedResponse(quizFixture(fileSettings, docs));
      const result = JSON.parse(response.output_text);
      if (mode === 'citation') result.quiz.questions[0].sourceReference = { sectionId: 'made-up', fileName: 'fake.pdf', sourceType: 'page', sourceNumber: 999, sourceQuote: 'A fabricated quotation.' };
      else result.quiz.questions[0].id = 'unassigned';
      response.output_text = JSON.stringify(result);
      return response;
    }) });
    await assert.rejects(generate(fileSettings, docs), e => e.code === 'INVALID_AI_RESPONSE');
  }
});
