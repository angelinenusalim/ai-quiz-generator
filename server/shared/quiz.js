export const SUBJECTS = {
  general: 'General Knowledge', math: 'Mathematics', cs: 'Computer Science',
  physics: 'Physics', biology: 'Biology', chemistry: 'Chemistry', english: 'English',
  mandarin: 'Mandarin', geography: 'Geography', psychology: 'Psychology', history: 'History',
};
export const DIFFICULTIES = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
export const QUESTION_COUNTS = [5, 10, 15, 20];
export const LIMITS = {
  files: 5, fileBytes: 10 * 1024 * 1024, totalBytes: 25 * 1024 * 1024,
  textCharacters: 2_000_000, documentTextCharacters: 1_000_000, sections: 10_000,
  contextCharacters: 64_000, pdfBatchPages: 10, pdfTimeoutMs: 45_000,
  materialTimeoutMs: 60_000, topicCharacters: 300,
};
export const FILE_TYPES = {
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  txt: ['text/plain'], md: ['text/markdown', 'text/x-markdown', 'text/plain'],
};
export const extensionOf = (name) => name.split('.').pop().toLowerCase();
export const normalizeText = (text) => text.replace(/\s+/gu, ' ').trim();
export const containsEmoji = (text) => /\p{Extended_Pictographic}|\p{Regional_Indicator}|[\uFE0F\u20E3]/u.test(text);

const string = { type: 'string' };
const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const quizSchema = object({
  title: string, subject: { type: 'string', enum: Object.values(SUBJECTS) },
  difficulty: { type: 'string', enum: Object.keys(DIFFICULTIES) },
  questions: { type: 'array', minItems: 0, maxItems: 20, items: object({
    id: string, question: string, type: { type: 'string', enum: ['multiple_choice'] },
    options: { type: 'array', minItems: 4, maxItems: 4, items: object({ id: { type: 'string', enum: ['A', 'B', 'C', 'D'] }, text: string }) },
    correctAnswer: { type: 'string', enum: ['A', 'B', 'C', 'D'] }, explanation: string,
    sourceReference: { anyOf: [object({
      sectionId: string, fileName: string, sourceType: { type: 'string', enum: ['slide', 'page', 'section'] },
      sourceNumber: { type: 'integer', minimum: 1 }, sourceQuote: string,
    }), { type: 'null' }] },
  }) },
});
export const generationSchema = object({
  status: { type: 'string', enum: ['ready', 'insufficient_material'] },
  reason: { anyOf: [string, { type: 'null' }] },
  quiz: { anyOf: [quizSchema, { type: 'null' }] },
});

// Also used at the browser boundary; answers never depend on Markdown parsing.
export function validateQuiz(quiz, settings, documents) {
  const nonempty = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
  if (!quiz || !nonempty(quiz.title, 200) || quiz.subject !== SUBJECTS[settings.subject] ||
      quiz.difficulty !== settings.difficulty || !Array.isArray(quiz.questions) || quiz.questions.length !== settings.questionCount) {
    throw new Error('The quiz does not match the requested settings.');
  }
  const ids = new Set();
  if (containsEmoji(quiz.title)) throw new Error('The quiz contains emoji characters.');
  const questions = new Set();
  const sources = documents && new Map(documents.flatMap(d => d.sections.map(s => [s.sectionId, { ...s, fileName: d.fileName }])));
  const usedFiles = new Set();
  const usedBands = new Set();
  for (const q of quiz.questions) {
    if (!nonempty(q.id, 40) || ids.has(q.id) || !nonempty(q.question, 2000) || q.type !== 'multiple_choice' ||
        !nonempty(q.explanation, 3000) || !Array.isArray(q.options) || q.options.length !== 4) throw new Error('The quiz contains an invalid question.');
    ids.add(q.id);
    const normalized = normalizeText(q.question).toLowerCase();
    if (questions.has(normalized)) throw new Error('The quiz repeats a question.');
    questions.add(normalized);
    const optionIds = new Set(q.options.map(o => o.id));
    if (optionIds.size !== 4 || !['A', 'B', 'C', 'D'].every(id => optionIds.has(id)) || !optionIds.has(q.correctAnswer) ||
        !q.options.every(o => nonempty(o.text, 1500)) || new Set(q.options.map(o => normalizeText(o.text).toLowerCase())).size !== 4) {
      throw new Error('The quiz contains invalid answer options.');
    }
    if ([q.question, q.explanation, ...q.options.map(o => o.text)].some(containsEmoji)) throw new Error('The quiz contains emoji characters.');
    if (q.sourceReference !== null) {
      const r = q.sourceReference;
      if (!r || !nonempty(r.fileName, 150) || !nonempty(r.sectionId, 60) || !['slide', 'page', 'section'].includes(r.sourceType) ||
          !Number.isInteger(r.sourceNumber) || r.sourceNumber < 1 || !nonempty(r.sourceQuote, 1500)) throw new Error('The quiz contains an invalid source reference.');
    }
    if (sources) {
      if (sources.size === 0 && q.sourceReference !== null) throw new Error('A topic-only quiz cannot cite a document.');
      if (sources.size > 0) {
        const r = q.sourceReference;
        const source = r && sources.get(r.sectionId);
        if (!source || r.fileName !== source.fileName || r.sourceNumber !== source.sourceNumber || r.sourceType !== source.sourceType ||
            normalizeText(r.sourceQuote).length < 15 || !normalizeText(source.text).includes(normalizeText(r.sourceQuote))) {
          throw new Error('The quiz cites material that was not supplied.');
        }
        usedFiles.add(r.fileName);
        if (source.coverageBand) usedBands.add(`${r.fileName}:${source.coverageBand}`);
      }
    }
  }
  if (documents?.length && !settings.topic && documents.some(d => !usedFiles.has(d.fileName))) {
    throw new Error('The quiz must cover every uploaded document.');
  }
  if (documents?.length && !settings.topic && settings.questionCount >= documents.length * 3) {
    for (const d of documents.filter(d => d.selection?.applied)) {
      for (const band of new Set(d.sections.map(s => s.coverageBand))) {
        if (!usedBands.has(`${d.fileName}:${band}`)) throw new Error('The quiz must cover the beginning, middle, and end of excerpted material.');
      }
    }
  }
  return quiz;
}

export function scoreQuiz(quiz, answers) {
  const total = quiz.questions.length;
  const correct = quiz.questions.filter(q => answers[q.id] === q.correctAnswer).length;
  const unanswered = quiz.questions.filter(q => !answers[q.id]).length;
  return { total, correct, incorrect: total - correct - unanswered, unanswered, percentage: Math.round(correct / total * 100) };
}
