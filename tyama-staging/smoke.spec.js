const { test, expect } = require('@playwright/test');

const ROOT = 'https://serkovichhhh-spec.github.io/pavutyna-workflow/tyama-staging/';
const DEMO_Q = 'f48eb9af4412a67861d20118e5ad5f16fb71';
const DEMO_SCREEN = '1b606782c7dcacab78c974b5af1faf9afdd4';

async function openWithRetry(page, url, expectedText) {
  let last;
  for (let i = 0; i < 12; i++) {
    try {
      await page.goto(url + (url.includes('?') ? '&' : '?') + 'smoke=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 20000 });
      await expect(page.getByText(expectedText, { exact: false })).toBeVisible({ timeout: 8000 });
      return;
    } catch (e) {
      last = e;
      await page.waitForTimeout(10000);
    }
  }
  throw last;
}

test('TYAMA staging core screens render', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await openWithRetry(page, ROOT, 'Відкрити демо-подію');
  await page.getByRole('button', { name: 'Відкрити демо-подію' }).click();
  await expect(page.getByText('Ваші події')).toBeVisible();
  await expect(page.getByText('Весілля Марти та Андрія')).toBeVisible();

  await page.getByRole('button', { name: 'Відкрити подію' }).first().click();
  await expect(page.getByRole('button', { name: 'Анкета' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Event Kit' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Live' })).toBeVisible();

  const q = await context.newPage();
  const qErrors = [];
  q.on('pageerror', e => qErrors.push(String(e)));
  await openWithRetry(q, ROOT + '#/q/' + DEMO_Q, 'Надіслати відповіді');
  await expect(q.locator('form')).toBeVisible();

  const screen = await context.newPage();
  const screenErrors = [];
  screen.on('pageerror', e => screenErrors.push(String(e)));
  await openWithRetry(screen, ROOT + '#/screen/' + DEMO_SCREEN, 'Екран готовий');

  expect(errors, 'Host page JS errors').toEqual([]);
  expect(qErrors, 'Questionnaire JS errors').toEqual([]);
  expect(screenErrors, 'Public Screen JS errors').toEqual([]);
});
