import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
import AxeBuilder from '@axe-core/playwright';
import { quizFixture } from '../../server/test/fixtures.js';

const settings = { topic: 'Operating Systems', subject: 'cs', difficulty: 'intermediate', questionCount: 10 };
const payload = { quiz: quizFixture(settings), metadata: { sourceMode: 'topic', documents: [], warnings: [] } };
async function fillSettings(page) {
  await page.getByLabel(/Topic/).fill(settings.topic);
  await page.getByLabel('Subject', { exact: true }).selectOption(settings.subject);
  await page.getByLabel('Difficulty', { exact: true }).selectOption(settings.difficulty);
  await page.getByLabel('Questions', { exact: true }).selectOption('10');
}
test('real frontend talks to real backend through the Vite proxy', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  const config = await health.json();
  await page.goto('/');
  await fillSettings(page);
  if (!config.generationConfigured) {
    await page.getByRole('button', { name: /make my quiz/ }).click();
    await expect(page.getByRole('alert')).toContainText('OPENAI_API_KEY');
  }
});
test('browser quiz selection, submission, explanation, retry and return', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/generate', route => route.fulfill({ json: payload }));
  await page.goto('/');
  await fillSettings(page);
  await page.getByRole('button', { name: /make my quiz/ }).click();
  await expect(page.getByRole('heading', { name: 'Operating Systems', exact: true })).toBeFocused();
  await expect(page.getByText('Concept 1 supports reliable distributed operations.')).toHaveCount(0);
  const groups = page.getByRole('group');
  for (let n = 0; n < 10; n++) await groups.nth(n).getByRole('radio').nth(n % 4).check();
  await expect(page.getByText('10 of 10 answered')).toBeVisible();
  await page.getByRole('button', { name: 'check my answers' }).click();
  await expect(page.getByText('You scored 10 out of 10 (100%).')).toBeVisible();
  await expect(page.getByText('Concept 1 supports reliable distributed operations.')).toBeVisible();
  await expect(page.getByRole('radio').first()).toBeDisabled();
  await page.screenshot({ path: 'test-results/results-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Try this quiz again' }).first().click();
  await expect(page.getByText('0 of 10 answered')).toBeVisible();
  await page.getByRole('button', { name: 'back to the study corner' }).click();
  await expect(page.getByLabel(/Topic/)).toHaveValue('Operating Systems');
  expect(errors).toEqual([]);
});
for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 768, 1024], ['mobile', 375, 812], ['narrow', 320, 700]]) {
  test(`${name}: generator, long filenames, quiz and results fit the viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'your little study corner', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'browse my notes' })).toBeVisible();
    await page.locator('input[type=file]').setInputFiles({ name: 'Lecture_With_A_Very_Long_But_Valid_File_Name_For_Responsive_Layout_And_Upload_Testing.txt', mimeType: 'text/plain', buffer: Buffer.from('Study materials about operating systems.') });
    await expect(page.getByRole('button', { name: /Remove Lecture/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/generator-${name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'clear my notes' }).click();
    await fillSettings(page);
    await page.route('**/api/generate', route => route.fulfill({ json: payload }));
    await page.getByRole('button', { name: /make my quiz/ }).click();
    await expect(page.getByRole('radio')).toHaveCount(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'check my answers' }).click();
    await expect(page.getByText('You scored 0 out of 10 (0%).')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/results-${name}.png`, fullPage: true });
  });
}
test('keyboard navigation reaches labeled controls, upload and quiz answers', async ({ page }) => {
  await page.route('**/api/generate', route => route.fulfill({ json: payload }));
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Subject', { exact: true })).toBeFocused();
  await fillSettings(page);
  await page.getByRole('button', { name: /make my quiz/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Operating Systems', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('radio').first()).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio').nth(1)).toBeChecked();
});
test('generator, quiz and results have no automated WCAG A/AA violations', async ({ page }) => {
  await page.route('**/api/generate', route => route.fulfill({ json: payload }));
  await page.goto('/');
  const audit = async () => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations).toEqual([]);
  };
  await audit();
  await fillSettings(page);
  await page.getByRole('button', { name: /make my quiz/ }).click();
  await expect(page.getByRole('radio')).toHaveCount(40);
  await audit();
  await page.getByRole('button', { name: 'check my answers' }).click();
  await expect(page.getByText('You scored 0 out of 10 (0%).')).toBeVisible();
  await audit();
});
test('original artwork, bunny favicon and emoji-free copy load without blocking controls', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('your little study corner | AI Quiz Generator');
  await expect(page.getByRole('heading', { name: 'your little study corner', exact: true })).toBeVisible();
  await expect(page.getByText(/Studying from a topic/)).toBeVisible();
  const imageSources = await page.locator('img').evaluateAll(images => images.map(image => ({ src: image.getAttribute('src'), loaded: image.complete && image.naturalWidth > 0 })));
  expect(imageSources.every(image => image.loaded)).toBe(true);
  expect(imageSources.every(image => image.src.startsWith('/decor/'))).toBe(true);
  for (const name of ['favicon.ico', 'favicon-32.png', 'favicon-192.png', 'apple-touch-icon.png']) {
    const response = await request.get(`/${name}`);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toMatch(/image/);
    expect((await response.body()).length).toBeGreaterThan(100);
  }
  const copy = await page.locator('body').innerText();
  expect(/\p{Extended_Pictographic}|\p{Regional_Indicator}|[\uFE0F\u20E3]/u.test(copy)).toBe(false);
  for (const button of await page.locator('button').all()) {
    await button.scrollIntoViewIfNeeded();
    expect(await button.evaluate(element => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return hit === element || element.contains(hit);
    })).toBe(true);
  }
});

test('long-PDF selection notes and full supporting passages fit on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const longPayload = structuredClone(payload);
  longPayload.metadata = { sourceMode: 'materials', documents: [{ fileName: 'long-lecture.pdf', pageCount: 180 }], warnings: ['long-lecture.pdf: All 180 pages were examined locally. The quiz uses selected passages from across the document; it does not test every page or concept.'] };
  longPayload.quiz.questions[0].sourceReference = { sectionId: 'f1s180', fileName: 'long-lecture.pdf', sourceType: 'page', sourceNumber: 180, sourceQuote: 'Checkpoints save application state and reduce recovery work. '.repeat(20).trim() };
  await page.route('**/api/generate', route => route.fulfill({ json: longPayload }));
  await page.goto('/');
  await fillSettings(page);
  await page.locator('input[type="file"]').setInputFiles({ name: 'long-lecture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF- test upload') });
  await page.getByRole('button', { name: 'make my quiz' }).click();
  await page.getByText('Study material notes (1)', { exact: true }).click();
  await expect(page.getByText(/All 180 pages were examined locally/)).toBeVisible();
  await expect(page.getByText('Source: long-lecture.pdf, page 180')).toBeVisible();
  await page.getByRole('button', { name: 'check my answers' }).click();
  await expect(page.locator('blockquote')).toHaveText(`“${longPayload.quiz.questions[0].sourceReference.sourceQuote}”`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
