import { validateQuiz } from '../../../server/shared/quiz.js';
import { resolveApiBaseUrl } from './apiConfig.js';

export async function requestQuiz(settings, files, { signal, onStage = () => {} } = {}) {
  const baseUrl = resolveApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 190_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
  let body;
  const headers = {};
  if (files.length) {
    body = new FormData();
    Object.entries(settings).forEach(([key, value]) => body.append(key, String(value)));
    files.forEach(file => body.append('files', file));
  } else {
    body = JSON.stringify(settings);
    headers['Content-Type'] = 'application/json';
  }
  onStage(files.length ? 'Reading your notes and putting the quiz together...' : 'Putting your quiz together...');
  try {
    const response = await fetch(`${baseUrl}/api/generate`, { method: 'POST', headers, body, signal: requestSignal });
    let data;
    try { data = await response.json(); }
    catch { throw new Error('The quiz server is unavailable or returned an unreadable response. Make sure the backend is running and try again.'); }
    if (!response.ok) {
      const error = new Error(typeof data.error?.message === 'string' ? data.error.message : `The quiz server rejected the request (${response.status}). Please retry.`);
      error.details = data.error?.details;
      throw error;
    }
    if (typeof data.quiz === 'string') {
      throw new Error('Your Railway backend is responding, but it still runs the previous quiz API. Deploy the updated server to Railway, then retry. Your existing API key can stay unchanged.');
    }
    onStage('Checking your questions and source references...');
    validateQuiz(data.quiz, settings);
    if (!data.metadata || !Array.isArray(data.metadata.documents) || !Array.isArray(data.metadata.warnings)) throw new Error('The quiz server returned incomplete quiz metadata. Please retry.');
    return data;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.signal.aborted) throw new Error('The request timed out. Try fewer questions or a smaller study set.');
    if (error instanceof TypeError) throw new Error('Cannot reach the quiz server. Check your connection and make sure the backend is running.');
    throw error;
  } finally { clearTimeout(timer); }
}
