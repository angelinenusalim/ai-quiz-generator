import { parentPort, workerData } from 'node:worker_threads';
import { parseDocument } from './parser.js';
import { AppError } from '../errors.js';

try {
  const document = await parseDocument(Buffer.from(workerData.buffer), workerData.fileName);
  parentPort.postMessage({ document });
} catch (error) {
  parentPort.postMessage({ error: {
    code: error instanceof AppError ? error.code : 'UNREADABLE_DOCUMENT',
    message: error instanceof AppError ? error.message : 'This file is corrupted, encrypted, or is not readable in its declared format. Export a fresh copy and try again.',
  } });
}
