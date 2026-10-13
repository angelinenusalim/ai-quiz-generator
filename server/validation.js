import { SUBJECTS, DIFFICULTIES, QUESTION_COUNTS, LIMITS } from './shared/quiz.js';
import { AppError } from './errors.js';

export function validateSettings(body, files = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AppError(400, 'INVALID_INPUT', 'Send quiz settings as an object.');
  if (Object.keys(body).some(k => !['topic', 'subject', 'difficulty', 'questionCount'].includes(k))) throw new AppError(400, 'INVALID_INPUT', 'An unrecognized quiz setting was supplied.');
  const { topic = '', subject = 'general', difficulty = 'beginner', questionCount = 5 } = body;
  if (typeof topic !== 'string' || topic.length > LIMITS.topicCharacters) throw new AppError(400, 'INVALID_TOPIC', 'Use a topic of at most 300 characters.');
  if (typeof subject !== 'string' || !Object.hasOwn(SUBJECTS, subject)) throw new AppError(400, 'INVALID_SUBJECT', 'Choose a supported subject.');
  if (typeof difficulty !== 'string' || !Object.hasOwn(DIFFICULTIES, difficulty)) throw new AppError(400, 'INVALID_DIFFICULTY', 'Choose Beginner, Intermediate, or Advanced.');
  const count = typeof questionCount === 'string' && /^(5|10|15|20)$/.test(questionCount) ? Number(questionCount) : questionCount;
  if (!QUESTION_COUNTS.includes(count)) throw new AppError(400, 'INVALID_COUNT', 'Choose 5, 10, 15, or 20 questions.');
  if (!topic.trim() && files.length === 0) throw new AppError(400, 'MISSING_MATERIAL', 'Enter a topic or upload study materials.');
  return { topic: topic.trim(), subject, difficulty, questionCount: count };
}
