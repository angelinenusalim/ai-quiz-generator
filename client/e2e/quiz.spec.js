import { test, expect } from '@playwright/test';
import { Buffer } from 'node:buffer';
import AxeBuilder from '@axe-core/playwright';
import { quizFixture } from '../../server/test/fixtures.js';

const settings = { topic: 'Operating Systems', subject: 'cs', difficulty: 'intermediate', questionCount: 10 };
const payload = { quiz: quizFixture(settings), metadata: { sourceMode: 'topic', documents: [], warnings: [] } };
async function fillSettings(page) {
  await page.getByLabel(/Topic/).fill(settings.topic);
  await page.getByLabel('Subject', { exact: true }).selectOption(settings.subject);
  await page.getByLabel('Level', { exact: true }).selectOption(settings.difficulty);
  await page.getByLabel('Questions', { exact: true }).selectOption('10');
}
test('real frontend talks to real backend through the Vite proxy', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  const config = await health.json();
  await page.goto('/');
  await fillSettings(page);
  if (!config.generationConfigured) {
    await page.getByRole('button', { name: /Generate Quiz/ }).click();
    await expect(page.getByRole('alert')).toContainText('OPENAI_API_KEY');
  }
});
test('browser quiz selection, submission, explanation, retry and return', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/generate', route => route.fulfill({ json: payload }));
  await page.goto('/');
  await fillSettings(page);
  await page.getByRole('button', { name: /Generate Quiz/ }).click();
  await expect(page.getByRole('heading', { name: 'Operating Systems', exact: true })).toBeFocused();
  await expect(page.getByText('Concept 1 supports reliable distributed operations.')).toHaveCount(0);
  const groups = page.getByRole('group');
  for (let n = 0; n < 10; n++) await groups.nth(n).getByRole('radio').nth(n % 4).check();
  await expect(page.getByText('10 of 10 answered')).toBeVisible();
  await page.getByRole('button', { name: 'Submit Quiz' }).click();
  await expect(page.getByRole('heading', { name: 'You scored 10/10 — 100%!' })).toBeVisible();
  await expect(page.getByText('Concept 1 supports reliable distributed operations.')).toBeVisible();
  await expect(page.getByRole('radio').first()).toBeDisabled();
  await page.screenshot({ path: 'test-results/results-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Retry same quiz' }).first().click();
  await expect(page.getByText('0 of 10 answered')).toBeVisible();
  await page.getByRole('button', { name: 'Return to generator' }).click();
  await expect(page.getByLabel(/Topic/)).toHaveValue('Operating Systems');
  expect(errors).toEqual([]);
});
for (const [name, width, height] of [['desktop', 1440, 1000], ['tablet', 768, 1024], ['mobile', 375, 812], ['narrow', 320, 700]]) {
  test(`${name}: generator, long filenames, quiz and results fit the viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'AI Quiz Generator', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Browse files' })).toBeVisible();
    await page.locator('input[type=file]').setInputFiles({ name: 'Lecture_With_A_Very_Long_But_Valid_File_Name_For_Responsive_Layout_And_Upload_Testing.txt', mimeType: 'text/plain', buffer: Buffer.from('Study materials about operating systems.') });
    await expect(page.getByRole('button', { name: /Remove Lecture/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/generator-${name}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Clear all files' }).click();
    await fillSettings(page);
    await page.route('**/api/generate', route => route.fulfill({ json: payload }));
    await page.getByRole('button', { name: /Generate Quiz/ }).click();
    await expect(page.getByRole('radio')).toHaveCount(40);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Submit Quiz' }).click();
    await expect(page.getByRole('heading', { name: 'You scored 0/10 — 0%!' })).toBeVisible();
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
  await page.getByRole('button', { name: /Generate Quiz/ }).focus();
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
  await page.getByRole('button', { name: /Generate Quiz/ }).click();
  await expect(page.getByRole('radio')).toHaveCount(40);
  await audit();
  await page.getByRole('button', { name: 'Submit Quiz' }).click();
  await expect(page.getByRole('heading', { name: 'You scored 0/10 — 0%!' })).toBeVisible();
  await audit();
});
