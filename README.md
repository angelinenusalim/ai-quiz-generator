# AI Quiz Generator

A cozy pink study companion built with React 19, Vite, Node.js, Express, and OpenAI. The original illustrated background, Poppins/Nunito typography, subjects, and difficulty choices are preserved.

Generate quizzes from a topic, study materials, or both. Choose 5, 10, 15, or 20 questions; answer accessible radio options; submit for a deterministic score and explanations; retry the same questions or generate a new set. Settings and selected files remain available until the page is refreshed. Answers are shown after submission, and unanswered questions count against the score.

## Requirements and installation

Use **Node.js 22.20+** (or a newer supported LTS) and npm. From the repository root:

```sh
npm ci --prefix server
npm ci --prefix client
cp server/.env.example server/.env
cp client/.env.example client/.env
```

For the existing Railway deployment, **keep the current `OPENAI_API_KEY` in Railway unchanged**. Railway injects it into the backend process; no committed `.env` file or new API key is required. For a separately running local backend, supply that existing credential through the server environment or ignored `server/.env`. Never put the key in client files or a `VITE_` variable. Neither environment files nor uploaded materials are committed.

If npm reports a cache permission error, use `npm ci --prefix server --cache /tmp/quiz-npm-cache` and the equivalent client command.

## Run locally

Run these commands in separate terminals, from the repository root:

```sh
npm run dev --prefix server
```

```sh
VITE_API_BASE_URL=/ npm run dev --prefix client
```

Open `http://localhost:5173`. The explicit `VITE_API_BASE_URL=/` uses Vite's local `/api` proxy to port 8080. Without this override, the frontend uses the **original Railway backend**, including in a Netlify build. The backend also starts without a local key so health and configuration errors remain available. A Railway-only secret is not automatically available to an unrelated local process.

### Environment variables

| Variable | Location | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Server | Required for actual AI generation; never exposed to the browser. |
| `OPENAI_MODEL` | Server | Defaults to `gpt-4o-mini`; choose a model supporting Responses API strict JSON Schema output. |
| `PORT` | Server | Backend port, default `8080`. Adjust the Vite proxy if changing it locally. |
| `ALLOWED_ORIGINS` | Server | Comma-separated exact frontend origins; defaults to `https://ai-quiz-generator-angeline.netlify.app` and localhost/127.0.0.1 on port 5173. An explicit value replaces those defaults. |
| `TRUST_PROXY_HOPS` | Server | Optional number of trusted reverse proxies for correct rate limiting. Only configure for a known hosting topology. |
| `VITE_API_BASE_URL` | Client | Optional public backend origin without `/api`. Empty/unset uses `https://divine-achievement-production-5191.up.railway.app`, as the original frontend did. Set `/` explicitly for same-origin/local proxy use. Applied at build time. |

The server uses platform-injected environment variables first. Local `server/.env` and the original working-directory `.env` are supported as fallbacks, with `override: false`; neither can overwrite Railway's key.

## Study materials and limits

| Format | Extracted content and references |
| --- | --- |
| `.pptx` | Text from slides in actual presentation order, including tables and available speaker notes. References use slide numbers. |
| `.pdf` | Selectable text in page order. References use page numbers. |
| `.docx` | Paragraphs and table-cell text in document order. References use extracted section numbers, not Word page numbers. |
| `.txt`, `.md` | UTF-8 or BOM-marked UTF-16 text; headings and paragraph breaks preserved. References use extracted section numbers. |

- Up to **5 files**, **10 MB per file**, **25 MB total**.
- Up to **80,000 extracted characters and 1,000 sections per study set**.
- PPTX: up to **200 slides**; PDF: up to **150 pages**.
- Office archives: up to **40 MB expanded**, **2,000 entries**, **5 MB per XML part**. Encrypted archives and XML entity declarations are rejected.
- Topic length: **300 characters**. Each file must have a unique name, at most 150 characters.
- Each parser runs in a worker with a **15-second timeout** and bounded JavaScript heap. Requests time out after **180 seconds**; AI calls after **60 seconds**. There are at most two AI attempts.
- Generation is limited to **10 requests per 10 minutes per client IP**, and **3 simultaneous requests per server instance**.

Files remain in memory only; no upload directory or permanent storage is created. Buffers are released after processing and workers are terminated. Extracted text is sent to OpenAI, with `store: false` on the Responses request; provider data policies still apply. The application does not log document text or API responses.

Image-only/scanned PDFs and images in slides are **not OCR'd**. Blank slides/pages in mixed documents produce visible warnings; completely unreadable files fail. Password-protected and corrupted files fail with file-specific errors. Embedded charts, equations rendered as images, and SmartArt content outside slide text may not be extracted. The app does not claim these were read.

If any file fails, **the entire batch is rejected**. The error identifies failed and successfully read filenames. Remove or replace failed files and retry. Large documents are rejected explicitly; text is never silently truncated. All supported text is split into labeled sections and supplied in one bounded AI context, avoiding extra summarization calls.

## Generation and grounding

The server uses the [OpenAI Responses API with strict structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), then validates both the schema and application rules. It requires the exact question count, unique question IDs, distinct options and question text, a valid answer letter, and the selected subject/difficulty. Incomplete and invalid output cannot become a successful quiz; recoverable failures get one retry.

Uploaded content is JSON-encoded as untrusted study data, separate from application instructions. The AI must ground every document-based question in supplied text. Every citation is checked against an actual section, including its filename, slide/page/section number, and a verbatim supporting quotation. Without a topic, every uploaded document must be cited at least once; with a narrowing topic, files that were read but not cited are disclosed. A minimum-text check and the model's explicit insufficient-material response prevent partial quizzes being treated as complete.

These checks establish structural correctness and citation existence. They cannot guarantee semantic correctness of every generated answer or that a quotation fully supports an explanation. Review AI questions before using them for high-stakes assessment.

## API

`GET /api/health` returns liveness, `generationConfigured`, and upload limits. Liveness succeeds even if a key is missing; it does not verify credentials or available API credit.

`POST /api/generate` accepts JSON for topic-only generation:

```json
{"topic":"Operating Systems","subject":"cs","difficulty":"intermediate","questionCount":10}
```

For uploads, send `multipart/form-data` with the same four fields and repeated `files` fields. A blank topic is allowed with files. Subjects are `general`, `math`, `cs`, `physics`, `biology`, `chemistry`, `english`, `mandarin`, `geography`, `psychology`, and `history`; difficulty is `beginner`, `intermediate`, or `advanced`.

Success returns `{ quiz, metadata }`. `quiz` contains a title, subject, difficulty, and structured questions with A–D options, correct answers, explanations, and nullable source references. Metadata identifies processed documents, extraction counts, and warnings. The browser hides answer keys until submission; this is a practice tool, not a secured exam platform.

Failures use `{ "error": { "code": "...", "message": "...", "details": {} } }`, with appropriate 400/413/415/422/429/502/503/504 status codes. Details are optional and include file-specific failures when relevant. No stack traces are returned.

## Tests and build

From the repository root:

```sh
npm test --prefix server
npm test --prefix client
npm run lint --prefix server
npm run lint --prefix client
npm run build --prefix client
npm audit --prefix server
npm audit --prefix client
```

Backend tests use Node's test runner, Supertest, genuine generated PPTX/PDF/DOCX fixtures, and mocked OpenAI responses. Frontend tests use Vitest and Testing Library. Mocks are confined to tests; the running app always uses real document extraction and OpenAI generation.

Install the browser once, then run Playwright:

```sh
cd client
npx playwright install chromium
npm run test:e2e
```

Stop a running frontend on port 5173 first. Browser tests start the real frontend/backend with an explicit local API override, check their proxy connection and missing-key behavior, and use intercepted quiz responses for deterministic scoring/retry tests. They verify layouts at 1440, 768, 375, and 320 pixels, keyboard interaction, and accessibility. Screenshots and failure traces go to ignored `client/test-results/`.

Live OpenAI smoke tests (use actual API credit):

```sh
npm run test:live --prefix server
```

This covers Operating Systems with 10 questions, PPTX-only, PDF-only, mixed materials, and a Leader Election focus. It refuses to run without a configured key. Inspect generated educational quality separately: automated checks validate structure and references, not every fact.

See [VERIFICATION.md](VERIFICATION.md) for the tests actually executed in this implementation and the remaining live verification gap.

## Deployment

The backend is self-contained in `server/`, including `server/shared/quiz.js`. **Keep an existing Railway Root Directory of `/server`** if that is how the service is configured; there is no need to change it to the repository root. Netlify should retain the repository checkout for its React build, since the client imports the same pure JavaScript contract from `server/shared/quiz.js`.

Backend, including Railway:

```sh
npm ci --prefix server --omit=dev
npm start --prefix server
```

Configure the server environment and let the host provide `PORT`. Set `ALLOWED_ORIGINS` to your frontend's exact HTTPS origin. If behind a known proxy, set `TRUST_PROXY_HOPS` to its hop count. Limit ingress to 25 MB plus multipart overhead and allow 190-second upstream requests where the platform supports them. Platform timeouts may be shorter; reduce material size/question count for those hosts. Memory usage is bounded per request, but provision enough for three document workers and uploaded buffers.

Frontend:

```sh
npm ci --prefix client
npm run build --prefix client
```

Serve `client/dist` on Netlify. The original Railway URL is now the default, so **no new Netlify environment variable is required** for the existing service. If `VITE_API_BASE_URL` is already set to `/`, localhost, or another endpoint, change it to `https://divine-achievement-production-5191.up.railway.app` and rebuild. Keep OpenAI credentials only on Railway. For intentional same-origin hosting, set `VITE_API_BASE_URL=/` and reverse-proxy `/api` to the backend. Vite's development proxy is not included in production. No hosted deployment is changed automatically by this repository edit.

If Railway's Root Directory is `/server`, use `npm ci --omit=dev` and `npm start` there. Keep the existing `OPENAI_API_KEY` variable on the backend service. Deploy the updated backend before the updated frontend: the old deployed server returns Markdown text, while the updated client requires structured quiz objects.

The rate limiter and concurrent-request cap are in-memory per process. For multiple replicas, use an infrastructure-level shared rate limit and appropriate spend caps on the API account. There is no authentication, database, or permanent file storage.

## Troubleshooting

- **Cannot reach the server:** start both processes, check `/api/health`, verify the frontend API origin and allowed CORS origin. If Vite picked another port, free 5173 or add that exact origin.
- **API not configured / credentials / model error:** edit the server's environment and restart it; verify model access and API billing. Do not add credentials to the frontend.
- **Rate or usage limit:** wait for the limit window; check the OpenAI account's quota and billing if errors persist.
- **No readable text:** export a text-based PDF/PPTX, or OCR scanned material before upload.
- **Not enough material:** add more relevant notes, remove an overly narrow topic, or choose fewer questions.
- **Too much material / timeout:** split readings into smaller study sets. Limits are explicit; oversized text is not used partially.
- **File type error:** use modern `.pptx`/`.docx`; legacy `.ppt`/`.doc` formats are not supported. Export them using your office application.
- **Browser test cannot bind a socket:** grant the test process local networking permission in restricted environments.

## Significant implementation files

`server/shared/quiz.js` holds constants, the strict schema, semantic validation, and scoring. `server/app.js` contains API routing and request lifecycle handling; `server/openaiService.js` handles generation; `server/uploads.js` handles bounded multipart input; `server/documents/` contains parsers and worker management. The client uses `App.jsx`, `components/FileUpload.jsx`, `components/QuizQuestion.jsx`, `components/QuizResults.jsx`, and `services/api.js`.

Runtime additions: Multer, pdf-parse, fast-xml-parser, yauzl, Ajv, Helmet, and express-rate-limit. OpenAI, Express, and dotenv were updated. Vite's old alias was replaced with a supported Vite release. Test dependencies include Supertest, JSZip, pdf-lib, Vitest, jsdom, Testing Library, Playwright, and axe. React Markdown was removed because quiz rendering now uses structured objects and escaped React text.
