# Verification — October 12, 2026

## Final results

| Check | Result |
| --- | --- |
| `npm test --prefix server` | **42 passed, 0 failed**. Real document extraction; OpenAI responses mocked. |
| `npm test --prefix client` | **10 passed, 0 failed**. Component interaction and API boundary tests. |
| `npm run test:e2e --prefix client` | **8 passed, 0 failed** in Chromium. Real frontend and backend start and connect through the Vite proxy; successful quiz responses intercepted only inside tests. |
| `npm run lint --prefix server` | Passed, including shared quiz validation/scoring. |
| `npm run lint --prefix client` | Passed. |
| `npm run build --prefix client` | Passed with Vite 8.3.4. |
| `npm audit --prefix server` / `npm audit --prefix client` | Passed: **0 reported vulnerabilities** in either application. |
| Automated WCAG 2 A/AA and 2.1 AA checks | No axe violations in generator, active quiz, and submitted results. This is not a complete accessibility certification. |
| Responsive layouts | Browser assertions passed at 1440, 768, 375, and 320 px; no horizontal overflow for long filenames, quiz options, or results. Desktop and mobile screenshots were visually reviewed. |
| Live OpenAI smoke suite | **Not executed**: `OPENAI_API_KEY` is unavailable. The script exited with its documented configuration status before making any AI requests. |

The browser test verified the genuine missing-key error through the frontend/backend connection. All production code uses actual parsers and the OpenAI API; there are no mock quizzes or fake processing paths in the running application.

## Covered flows

- Topic-only Operating Systems, Computer Science, Intermediate, 10 questions: structured request and exact valid question count with a mocked AI response.
- PPTX-only, PDF-only, DOCX, TXT, and Markdown: actual extraction, no required topic, real source metadata carried to the generation service.
- PPTX/PDF combined and Leader Election topic plus materials: both sources are passed to the model, and settings remain separate from text data.
- All four question counts and all three difficulty levels: API contract and corresponding complexity instructions. Five valid files are accepted and represented in a five-question fixture quiz.
- PPTX presentation order that differs from slide filenames, speaker notes, PDF page order, DOCX paragraphs/tables, UTF-8/UTF-16, Unicode filenames, and unique section IDs.
- Scoring for all correct, all incorrect, partial, and unanswered responses; answer locking, explanation display, progress, retry, regeneration, and return to settings.
- Unsupported/MIME-mismatched/oversized/duplicate/corrupted/empty uploads, image-only PDF, malformed XML/entities, expanded ZIP limits, extracted text volume limits, worker timeout, and buffer cleanup.
- Missing credentials, AI rate limits, API authentication/model errors, refusal, incomplete/malformed AI output, fabricated citations, one bounded retry, network errors, cancellation, duplicate request prevention, request timeout, CORS, and request rate limiting.
- Keyboard access to form controls and quiz radios, focus management, long filenames, and responsive result cards.

## Issues found during verification and resolved

The initial backend integration run was blocked by sandbox restrictions on localhost sockets; it was rerun successfully with local networking allowed. A boundary test exposed an intermittent connection reset when rejecting an oversized body before the client finished sending it. The server now drains rejected input without buffering, with a bounded drain timeout, so it can return its structured 413 response.

Dependency audits initially reported frontend build/test vulnerabilities. The obsolete Vite alias and vulnerable test tooling were upgraded, and safe transitive fixes were applied. Both package lockfiles reflect the installed versions. Generated server dependencies and Finder metadata were removed from Git tracking while keeping local files intact.

## OpenAI routing regression follow-up

The original frontend and the existing deployed Netlify bundle both call `https://divine-achievement-production-5191.up.railway.app/api/generate`. The recent default `/api` route instead reached the local backend, whose health endpoint reported `generationConfigured: false`. That local process has no Railway environment variables. This is the observed cause of the missing-key error.

A real quiz-generation request to the existing Railway endpoint returned **HTTP 200 with a nonempty quiz**. The production OpenAI integration remains functional; no key needs to be replaced. Railway still serves the original API: `/` returns its old server message, `/api/health` returns 404, and `/api/generate` returns Markdown text rather than the new quiz object. The live Netlify HTML/bundle also remains the original version.

The fix restores the original Railway URL as the frontend default, with an optional public URL override and an explicit `/` local-proxy mode. CORS allows `https://ai-quiz-generator-angeline.netlify.app` by default. Server configuration preserves platform-injected variables and supports both `server/.env` and the original working-directory `.env`, without overriding runtime credentials. The quiz contract moved under `server/shared/` so a Railway deployment with Root Directory `/server` is self-contained.

Added tests cover environment precedence, the old dotenv location, real SDK initialization with a deliberately non-secret test token and mocked HTTP transport, default API routing, Netlify CORS, legacy API detection, and an isolated server-only deployment with actual text extraction. The resulting totals are **42 backend tests, 10 frontend tests, and 8 browser tests passed**, plus lint and production build. No design or quiz behavior was changed.

The Railway CLI is installed but **unauthenticated and unlinked**. Private platform settings and live deployment of the updated backend could not be verified or changed. No production credentials were read, copied, logged, or committed. Deploy the updated Railway backend first, retaining its current key, then deploy the Netlify frontend. If existing `ALLOWED_ORIGINS` overrides omit the Netlify URL, add that exact origin. If Netlify already overrides `VITE_API_BASE_URL` to a local endpoint, change it to the original Railway origin and rebuild.

## Still requires live verification

After configuring `server/.env`, run:

```sh
npm run test:live --prefix server
```

This performs real OpenAI requests for topic-only, PPTX-only, PDF-only, combined materials, and a narrowing topic. The existing deployed legacy backend has verified live model access. Until this suite runs against the updated backend with its existing Railway credentials, **the new structured API integration, educational relevance, source grounding quality, difficulty appropriateness, and latency remain unverified**. Automated fixtures demonstrate extraction and the API contract; they do not prove the model's semantic behavior.

No hosted deployment was changed. Scanned/image-only material requires OCR before upload; legacy `.ppt`/`.doc` is unsupported. Files beyond the documented limits are rejected rather than truncated. Citation existence and supporting quotations are validated, but semantic answer correctness cannot be guaranteed by schema validation.

## Browser artifacts

Screenshots are generated in ignored `client/test-results/` for the generator and results at each tested width. In this environment Chromium was installed under `/private/tmp/quiz-playwright-browsers`, so the executed browser command was:

```sh
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/quiz-playwright-browsers npm run test:e2e --prefix client
```

For a normal setup, `cd client && npx playwright install chromium` followed by `npm run test:e2e` uses Playwright's default browser cache.
