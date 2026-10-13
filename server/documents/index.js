import { Worker } from 'node:worker_threads';
import { LIMITS } from '../shared/quiz.js';
import { AppError } from '../errors.js';

export function parseInWorker(file, { signal, timeoutMs = 15_000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AppError(408, 'REQUEST_TIMEOUT', 'The request was cancelled or timed out.'));
    const worker = new Worker(new URL('./worker.js', import.meta.url), {
      workerData: { buffer: file.buffer, fileName: file.originalname },
      resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32 },
      stdout: true, stderr: true,
    });
    // Parser diagnostics can contain document text. Discard them.
    worker.stdout.resume();
    worker.stderr.resume();
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      void worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new AppError(408, 'REQUEST_TIMEOUT', 'The request was cancelled or timed out.'));
    const timer = setTimeout(() => finish(new AppError(422, 'DOCUMENT_TIMEOUT', 'Reading this file took too long. Split it into smaller files and try again.')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    worker.on('message', result => result.error ? finish(new AppError(422, result.error.code, result.error.message)) : finish(null, result.document));
    worker.on('error', () => finish(new AppError(422, 'UNREADABLE_DOCUMENT', 'This file could not be safely processed. Export a fresh copy and try again.')));
    worker.on('exit', () => { if (!settled) finish(new AppError(422, 'UNREADABLE_DOCUMENT', 'Document processing stopped unexpectedly.')); });
  });
}

export async function processDocuments(files, { signal, parse = parseInWorker } = {}) {
  const documents = [];
  const failures = [];
  const names = new Set();
  for (const [index, file] of files.entries()) {
    if (names.has(file.originalname)) throw new AppError(400, 'DUPLICATE_FILENAME', 'Each uploaded file must have a different name. Rename duplicates before uploading.');
    names.add(file.originalname);
    try {
      const document = await parse(file, { signal });
      document.sections = document.sections.map((section, n) => ({ ...section, sectionId: `f${index + 1}s${n + 1}` }));
      documents.push(document);
    } catch (error) {
      if (signal?.aborted) throw error;
      failures.push({ fileName: file.originalname, code: error.code || 'UNREADABLE_DOCUMENT', message: error.message });
    } finally { delete file.buffer; }
  }
  if (failures.length) throw new AppError(422, 'DOCUMENT_PROCESSING_FAILED', 'Some files could not be read. No quiz was generated. Remove or replace the failed files, then retry the whole batch.', {
    failedFiles: failures, processedFiles: documents.map(d => d.fileName),
  });
  if (documents.reduce((sum, d) => sum + d.characterCount, 0) > LIMITS.textCharacters || documents.reduce((sum, d) => sum + d.sections.length, 0) > LIMITS.sections) {
    throw new AppError(422, 'MATERIAL_LIMIT', 'This study set exceeds 80,000 extracted characters or 1,000 sections in total. Upload a smaller set; nothing has been truncated.');
  }
  return documents;
}
