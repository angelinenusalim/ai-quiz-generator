import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { upload } from './uploads.js';
import { validateSettings } from './validation.js';
import { processDocuments } from './documents/index.js';
import { createQuizGenerator } from './openaiService.js';
import { AppError } from './errors.js';
import { LIMITS } from './shared/quiz.js';

export function createApp({ env = process.env, generate, processFiles = processDocuments, rateLimitMax = 10, requestTimeoutMs = 180_000 } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(env.TRUST_PROXY_HOPS));
  app.use(helmet());
  app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  const allowedOrigins = (env.ALLOWED_ORIGINS || 'https://ai-quiz-generator-angeline.netlify.app,http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => s.trim()).filter(Boolean);
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'This website origin is not allowed by the quiz server.'));
    }, methods: ['GET', 'POST'], credentials: false,
  }));
  app.get('/', (req, res) => res.json({ service: 'AI Quiz Generator', health: '/api/health' }));
  app.get('/api/health', (req, res) => res.json({ status: 'ok', generationConfigured: Boolean(env.OPENAI_API_KEY || generate), limits: LIMITS }));
  const generator = generate || createQuizGenerator({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL || 'gpt-4o-mini' });
  const limiter = rateLimit({
    windowMs: 10 * 60 * 1000, limit: rateLimitMax, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { error: { code: 'RATE_LIMIT', message: 'You have made too many quiz requests. Wait a few minutes before trying again.' } },
  });
  let activeRequests = 0;
  app.post('/api/generate', limiter, (req, res, next) => {
    if (activeRequests >= 3) return next(new AppError(429, 'SERVER_BUSY', 'The quiz server is busy. Please try again shortly.'));
    if (Number(req.headers['content-length']) > LIMITS.totalBytes + 16_384) {
      // Drain rejected input without buffering it before completing the response.
      // Otherwise a client still writing a large body can see ECONNRESET instead of 413.
      const error = new AppError(413, 'UPLOAD_TOO_LARGE', 'Upload at most 25 MB in total.');
      let finished = false;
      const reject = () => {
        if (finished) return;
        finished = true;
        clearTimeout(drainTimer);
        if (!res.destroyed) next(error);
      };
      const drainTimer = setTimeout(reject, 5000);
      req.once('end', reject);
      req.once('aborted', () => { finished = true; clearTimeout(drainTimer); });
      req.resume();
      return;
    }
    activeRequests++;
    const controller = new AbortController();
    req.quizSignal = controller.signal;
    const timer = setTimeout(() => {
      controller.abort();
      if (!res.headersSent) res.status(504).json({ error: { code: 'REQUEST_TIMEOUT', message: 'The request took too long. Please retry with a smaller study set.' } });
    }, requestTimeoutMs);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeRequests--;
      clearTimeout(timer);
      controller.abort();
      for (const file of req.files || []) delete file.buffer;
    };
    res.once('close', release);
    res.once('finish', release);
    req.once('aborted', release);
    next();
  }, (req, res, next) => {
    if (req.is('multipart/form-data')) upload(req, res, next);
    else if (req.is('application/json')) express.json({ limit: '8kb' })(req, res, next);
    else next(new AppError(415, 'INVALID_CONTENT_TYPE', 'Send JSON settings or a multipart form with study files.'));
  }, async (req, res, next) => {
    try {
      if (req.quizSignal.aborted) return;
      const files = req.files || [];
      const settings = validateSettings(req.body, files);
      const documents = await processFiles(files, { signal: req.quizSignal });
      const { quiz, warnings } = await generator(settings, documents, { signal: req.quizSignal });
      if (req.quizSignal.aborted || res.headersSent) return;
      res.json({ quiz, metadata: {
        sourceMode: documents.length ? 'materials' : 'topic', questionCount: quiz.questions.length,
        documents: documents.map(d => ({ fileName: d.fileName, characterCount: d.characterCount, sectionCount: d.sections.length })),
        warnings: [...documents.flatMap(d => d.warnings.map(w => `${d.fileName}: ${w}`)), ...warnings],
      } });
    } catch (error) {
      if (req.quizSignal.aborted || res.writableEnded) return;
      next(error);
    }
  });
  app.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'This API endpoint does not exist.' } }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 10 MB or smaller.' : 'Upload at most 5 files using the files field and four quiz settings.';
      error = new AppError(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, error.code, message);
    } else if (error.type === 'entity.too.large') error = new AppError(413, 'REQUEST_TOO_LARGE', 'Quiz settings exceed the request size limit.');
    else if (error.type === 'entity.parse.failed') error = new AppError(400, 'INVALID_JSON', 'The request contains invalid JSON.');
    const known = error instanceof AppError;
    // Only codes: no request bodies, filenames, model responses, API credentials, or stack traces.
    if (!known) console.error('Quiz request failed: INTERNAL_ERROR');
    res.status(known ? error.status : 500).json({ error: {
      code: known ? error.code : 'INTERNAL_ERROR',
      message: known ? error.message : 'The server could not complete this request. Please retry.',
      ...(known && error.details ? { details: error.details } : {}),
    } });
  });
  return app;
}
