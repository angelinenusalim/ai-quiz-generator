# Verification — October 12, 2026

## Final results

| Check | Result |
| --- | --- |
| `npm test --prefix server` | **46 passed, 0 failed**. Real document extraction; OpenAI responses mocked. |
| `npm test --prefix client` | **11 passed, 0 failed**. Component interaction and API boundary tests. |
| `npm run test:e2e --prefix client` | **9 passed, 0 failed** in Chromium. Real frontend and backend start and connect through the Vite proxy; successful quiz responses intercepted only inside tests. |
| `npm run lint --prefix server` | Passed, including shared quiz validation/scoring. |
| `npm run lint --prefix client` | Passed. |
| `npm run build --prefix client` | Passed with Vite 8.3.4. |
| `npm audit --prefix server` / `npm audit --prefix client` | Passed: **0 reported vulnerabilities** in either application. |
| Automated WCAG 2 A/AA and 2.1 AA checks | No axe violations in generator, active quiz, and submitted results. This is not a complete accessibility certification. |
| Responsive layouts | Browser assertions passed at 1440, 768, 375, and 320 px; no horizontal overflow for long filenames, quiz options, or results. Desktop and mobile screenshots were visually reviewed. |
| Live OpenAI smoke suite | **5 passed, 0 failed**, using existing Railway credentials supplied to the process by `railway run`. Topic-only, PPTX-only, PDF-only, combined materials, and a topic-focused lecture quiz all returned validated quizzes. |

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

## Earlier OpenAI routing regression investigation

The original frontend and the existing deployed Netlify bundle both call `https://divine-achievement-production-5191.up.railway.app/api/generate`. The recent default `/api` route instead reached the local backend, whose health endpoint reported `generationConfigured: false`. That local process has no Railway environment variables. This is the observed cause of the missing-key error.

A real quiz-generation request to the existing Railway endpoint returned **HTTP 200 with a nonempty quiz**. The production OpenAI integration remains functional; no key needs to be replaced. At that time, Railway served the original API: `/` returns its old server message, `/api/health` returns 404, and `/api/generate` returns Markdown text rather than the new quiz object. The live Netlify HTML/bundle also remains the original version.

The fix restores the original Railway URL as the frontend default, with an optional public URL override and an explicit `/` local-proxy mode. CORS allows `https://ai-quiz-generator-angeline.netlify.app` by default. Server configuration preserves platform-injected variables and supports both `server/.env` and the original working-directory `.env`, without overriding runtime credentials. The quiz contract moved under `server/shared/` so a Railway deployment with Root Directory `/server` is self-contained.

Added tests cover environment precedence, the old dotenv location, real SDK initialization with a deliberately non-secret test token and mocked HTTP transport, default API routing, Netlify CORS, legacy API detection, and an isolated server-only deployment with actual text extraction. The resulting totals are **42 backend tests, 10 frontend tests, and 8 browser tests passed**, plus lint and production build. No design or quiz behavior was changed.

At that time, the Railway CLI was **unauthenticated and unlinked**. Private platform settings and live deployment of the updated backend could not be verified or changed. No production credentials were read, copied, logged, or committed. Deploy the updated Railway backend first, retaining its current key, then deploy the Netlify frontend. If existing `ALLOWED_ORIGINS` overrides omit the Netlify URL, add that exact origin. If Netlify already overrides `VITE_API_BASE_URL` to a local endpoint, change it to the original Railway origin and rebuild.

## Topic-only fix and original-artwork update

The existing request validation already permits topic-only, files-only, and combined inputs. The AI prompt did not make the topic-only knowledge source explicit and could incorrectly return an insufficient-material response. Generation now supplies a trusted source mode and separate instructions: topic-only uses general knowledge with null source references; documents-only infers the topic from the files; combined mode focuses on the entered topic while grounding questions in the documents. A spurious missing-material response in topic mode is rejected and retried once. Real document insufficiency remains an explicit failure rather than prompting invented facts.

The exact reported error is covered by a regression test that first returns the incorrect model response and then a valid quiz. The full API suite covers all three modes with real document extraction, and frontend tests cover the corresponding JSON/multipart form submissions, scoring, explanations, retry, and reset.

The user's original `quiz_decor.zip` supplies both bunnies, the bow, cherries, books, and original illustrated quiz label. The ZIP itself is untouched. Prepared assets preserve colors and proportions; only blank canvas is trimmed, the images are resized, and edge-connected pure-white exterior canvas becomes transparent. Original white bunny fur and book pages remain. The ZIP does not contain cake or strawberry art, so its own bow-tied cherries supply the sweet accent. The existing background and fonts remain.

The resting bunny supplies the transparent PNG/ICO favicon and Apple touch icon. Browser checks confirmed every decoration loads, all favicon endpoints return images, decorations do not block visible buttons, no authored UI emojis appear, and all layouts fit desktop/tablet/mobile/narrow viewports. Playful headings/buttons were updated while subject, question count, scoring, source references, and error instructions remain clear. Generated quiz copy is also checked for emoji characters.

The Railway session became available for this follow-up, and the linked service/domain was confirmed. Live tests ran the updated **local code** with the existing Railway environment variables supplied directly to the process; no credential file was created and no secret value was printed or committed:

```sh
railway run --service divine-achievement --environment production npm run test:live --prefix server
```

All five live scenarios passed: Operating Systems / Computer Science / Intermediate / 10 questions, PPTX-only, PDF-only, combined PPTX/PDF, and Leader Election with PPTX. The returned questions passed strict schema, answer/count checks, real section/quote verification, and the emoji check. These tests confirm actual OpenAI generation, not mock responses. Semantic correctness of every AI answer is not automatically guaranteed.

The final automated totals are **46 backend tests, 11 frontend tests, and 9 Chromium browser tests passed**, with lint and production build passing. The supplied design files introduced no dependency or architecture changes. Netlify frontend/Railway backend routing, the existing API key, and deployment conventions remain intact. Hosted services have not been redeployed by this task; publish the changed backend and frontend through the existing deployment workflow.

The refreshed local preview uses the updated backend with Railway credentials in process memory, a localhost-only CORS override, and `VITE_API_BASE_URL=/` on the frontend. Those overrides are local to the running processes and do not change Railway variables or Netlify configuration. Production still defaults to the original Railway URL.

Scanned/image-only material still requires OCR before upload; legacy `.ppt`/`.doc` is unsupported. Files beyond documented limits are rejected rather than truncated.

## Long-PDF processing and calmer copy

The reported 150-page restriction was an explicit application check, not a limitation of the installed PDF parser. Removing it alone would still have left the 80,000-character study-set rejection and the full-document model input. PDFs now use `PDFParse.getInfo({parsePageInfo:false})` followed by ten-page `getText` batches; the parser releases each page’s resources. Original page numbers are preserved and the parser is destroyed afterward.

Extraction budgets are now 1,000,000 characters per file, 2,000,000 per set, and 10,000 readable sections. PDF extraction is allowed 45 seconds, other formats retain 15 seconds, and the set has a 60-second reading budget. A global parser queue allows one worker per instance, waits at most ten seconds, and awaits termination before releasing the slot. The worker retains its 192 MB old-generation and 32 MB young-generation JavaScript heap caps. Memory exhaustion, elapsed-time limits, scanned/blank pages, corrupt documents, and text-budget failures have specific explanations. Abort and queued-cancellation cleanup are tested.

All extracted sections are examined locally. Small materials fit in full; long materials are scored in chunks using informative terms, explanatory cues, and topic relevance. Exact passages are selected with early/late anchors, all three document bands, and stratified chunk coverage within a 64,000-character JSON study-material budget shared fairly across files. This heuristic is not an exhaustive semantic summary. Visible study-material notes disclose passage/chunk counts and that the quiz does not test every page or concept. Source validation uses only passages actually supplied to the model, with unique passage IDs, original page numbers, and verbatim quotes. Small source sections over 1,500 characters are split without losing text. Without a topic, excerpted documents must cite all three bands whenever the requested count permits at least three questions per file. No per-chunk AI calls are made; the normal generation path is one call, with one bounded retry. The retry includes static validation feedback for incomplete or invalid questions. Live tests initially exposed unreliable model-authored citations and file coverage. The final implementation assigns each question ID to a source passage before generation and requires the AI to write from that assignment. The server attaches the original citation metadata and exact passage itself; the model cannot fabricate a citation or omit a file by selecting a different source. Tests reject model-authored citations and unknown assigned IDs. Topic plans reuse relevant passages before using unrelated content.

A genuine generated 180-page PDF contained **186,848 extracted characters**. The final unit-test run read all 180 pages in 18 batches, including the last-page checkpoint concept, in about **0.2 seconds** of extraction time; sampled worker JavaScript heap peaked at about **29 MB**. The complete test including fixture construction/worker startup took about 0.8 seconds. The earlier denser fixture contained 265,028 characters and also passed. These are local measurements, not a claim about the actual lecture PDF or peak native/Railway memory. Text selection is checked against its JSON budget, exact source content, later-page topic relevance, all document bands, and a single mocked API call. The suite also covers real small PDF, PPTX, DOCX, TXT, Markdown, and multiple-file parsing through the HTTP API.

The copy uses ordinary instructions and gentle headings such as “What are we studying today?”, “Let’s check that”, and “Here’s how you did”. Forced slang, the repeated “little” phrases, the old footer slogan, and authored em dashes were removed. Scores explicitly state correct/total/percentage. The CSS, fonts, pink background, and custom artwork were not changed in this follow-up. Desktop/tablet/mobile/narrow screenshots, button hit checks, favicon/art loads, scoring/retry/focus, and automated WCAG checks passed.

The final automated totals for this follow-up are **57 backend tests, 11 frontend tests, and 10 browser tests passed**, with both lint commands, production build, and `git diff --check` passing.

All seven live scenarios passed against the updated local backend using existing Railway credentials injected only into process memory: topic-only, PPTX, small PDF, mixed PPTX/PDF, the 180-page PDF, combined DOCX/Markdown, and a Leader Election focus. The long quiz cited pages **11, 100, 121, 21, and 31**, covering all three thirds. No hosted deployment or secret was changed. These are real API calls, not mocked generation. The exact citations are deterministic assignments; educational accuracy still requires reviewing the generated question against its assigned source.

The actual `Lecture 8_ RNNs and LSTMs.pdf` was not attached, so it was not tested. Native PDF allocations are outside V8 worker heap caps, and the updated code has not been deployed to Railway. Resource guards and local benchmarks reduce risk but cannot guarantee memory usage for every PDF or hosting plan. The existing 10 MB per-file / 25 MB aggregate upload limits remain. Scanned/image-only content still needs OCR.

Deploy the updated Railway backend first and then the Netlify frontend through the existing workflow. This follow-up needs no new API key, environment variable, or change to the service roots. It does not alter Railway secrets or Netlify settings.

## Browser artifacts

Screenshots are generated in ignored `client/test-results/` for the generator and results at each tested width. In this environment Chromium was installed under `/private/tmp/quiz-playwright-browsers`, so the executed browser command was:

```sh
PLAYWRIGHT_BROWSERS_PATH=/private/tmp/quiz-playwright-browsers npm run test:e2e --prefix client
```

For a normal setup, `cd client && npx playwright install chromium` followed by `npm run test:e2e` uses Playwright's default browser cache.
