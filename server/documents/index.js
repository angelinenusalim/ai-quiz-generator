import { Worker } from 'node:worker_threads';
import { LIMITS } from '../shared/quiz.js';
import { AppError } from '../errors.js';

let parserActive = false;
const waiting = [];
function acquireParser(signal) {
  return new Promise((resolve, reject) => {
    const release = () => { parserActive = false; waiting.shift()?.(); };
    const start = () => { cleanup(); parserActive = true; resolve(release); };
    const fail = error => { const index = waiting.indexOf(start); if (index >= 0) waiting.splice(index, 1); cleanup(); reject(error); };
    const abort = () => fail(new AppError(408, 'REQUEST_TIMEOUT', 'Reading the files was cancelled or timed out.'));
    const timer = setTimeout(() => fail(new AppError(429, 'PARSER_BUSY', 'The server is reading another document. Please try again shortly.')), 10_000);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    if (signal?.aborted) return abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (parserActive) waiting.push(start); else start();
  });
}

export async function parseInWorker(file, { signal, timeoutMs = file.originalname.toLowerCase().endsWith('.pdf') ? LIMITS.pdfTimeoutMs : 15_000 } = {}) {
  const release = await acquireParser(signal);
  try { return await new Promise((resolve, reject) => {
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
    const finish = async (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      await worker.terminate();
      if (error) reject(error); else resolve(result);
    };
    const abort = () => finish(new AppError(408, 'REQUEST_TIMEOUT', 'The request was cancelled or timed out.'));
    const timer = setTimeout(() => finish(new AppError(422, 'DOCUMENT_TIMEOUT', `Reading this file exceeded the ${Math.round(timeoutMs / 1000)}-second processing budget. Split it into smaller files and try again.`)), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    worker.on('message', result => result.error ? finish(new AppError(422, result.error.code, result.error.message)) : finish(null, result.document));
    worker.on('error', error => finish(error.code === 'ERR_WORKER_OUT_OF_MEMORY'
      ? new AppError(422, 'DOCUMENT_MEMORY_LIMIT', 'Reading this file exceeded the parser’s memory budget. Split it into chapters or export a smaller copy and try again.')
      : new AppError(422, 'UNREADABLE_DOCUMENT', 'This file could not be safely processed. Export a fresh copy and try again.')));
    worker.on('exit', () => { if (!settled) finish(new AppError(422, 'UNREADABLE_DOCUMENT', 'Document processing stopped unexpectedly.')); });
  }); } finally { release(); }
}

export async function processDocuments(files, { signal, parse = parseInWorker } = {}) {
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), LIMITS.materialTimeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  try {
    const documents = [];
    const failures = [];
    const names = new Set();
    for (const [index, file] of files.entries()) {
      if (names.has(file.originalname)) throw new AppError(400, 'DUPLICATE_FILENAME', 'Each uploaded file must have a different name. Rename duplicates before uploading.');
      names.add(file.originalname);
      try {
        const document = await parse(file, { signal: combinedSignal });
        document.sections = document.sections.map((section, n) => ({ ...section, sectionId: `f${index + 1}s${n + 1}` }));
        documents.push(document);
      } catch (error) {
        if (signal?.aborted) throw error;
        if (deadline.signal.aborted) throw new AppError(422, 'MATERIAL_TIMEOUT', 'Reading this study set exceeded the 60-second processing budget. Split it into smaller sets and try again.');
        failures.push({ fileName: file.originalname, code: error.code || 'UNREADABLE_DOCUMENT', message: error.message });
      } finally { delete file.buffer; }
    }
    if (failures.length) throw new AppError(422, 'DOCUMENT_PROCESSING_FAILED', 'We couldn’t read the files listed below. Replace or remove them and try again.', {
      failedFiles: failures, processedFiles: documents.map(d => d.fileName),
    });
    if (documents.reduce((sum, d) => sum + d.characterCount, 0) > LIMITS.textCharacters || documents.reduce((sum, d) => sum + d.sections.length, 0) > LIMITS.sections) {
      throw new AppError(422, 'MATERIAL_LIMIT', 'This study set exceeds 2,000,000 extracted characters or 10,000 sections. Split it into smaller sets; nothing has been truncated.');
    }
    return documents;
  } finally { clearTimeout(timer); for (const file of files) delete file.buffer; }
}
