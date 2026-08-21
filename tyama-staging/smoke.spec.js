const { test, expect } = require('@playwright/test');

const ROOT = 'https://serkovichhhh-spec.github.io/pavutyna-workflow/tyama-staging/';
const DEMO_Q = 'f48eb9af4412a67861d20118e5ad5f16fb71';
const DEMO_SCREEN = '1b606782c7dcacab78c974b5af1faf9afdd4';

function bust(url) {
  const [beforeHash, hash = ''] = url.split('#');
  const join = beforeHash.includes('?') ? '&' : '?';
  return beforeHash + join + 'smoke=' + Date.now() + (hash ? '#' + hash : '');
}

async function openWithRetry(page, url, expectedText) {
  let last;
  for (let i = 0; i < 12; i++) {
    try {
      await page.goto(bust(url), { waitUntil: 'domcontentloaded', timeout: 20000 });
      await expect(page.getByText(expectedText, { exact: false })).toBeVisible({ timeout: 8000 });
      return;
    } catch (e) {
      last = e;
      await page.waitForTimeout(10000);
    }
  }
  throw last;
}

async function login(page) {
  await openWithRetry(page, ROOT, 'Відкрити демо-подію');
  await page.getByRole('button', { name: 'Відкрити демо-подію' }).click();
  await expect(page.getByText('Ваші події')).toBeVisible();
}

test('TYAMA staging core flow renders and Live controls Public Screen', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await login(page);
  await expect(page.getByText('Весілля Марти та Андрія')).toBeVisible();
  await page.getByRole('button', { name: 'Відкрити подію' }).first().click();
  await expect(page.getByRole('button', { name: 'Event Kit' })).toBeVisible();

  await page.getByRole('button', { name: 'Event Kit' }).click();
  await expect(page.getByText('Редагувати матеріал').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Не використовувати' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Прибрати' }).first()).toBeVisible();

  const q = await context.newPage();
  const qErrors = [];
  q.on('pageerror', e => qErrors.push(String(e)));
  await openWithRetry(q, ROOT + '#/q/' + DEMO_Q, 'Надіслати відповіді');
  await expect(q.locator('form')).toBeVisible();

  const screen = await context.newPage();
  const screenErrors = [];
  screen.on('pageerror', e => screenErrors.push(String(e)));
  await openWithRetry(screen, ROOT + '#/screen/' + DEMO_SCREEN, 'Екран готовий');

  await page.getByRole('button', { name: 'Live' }).click();
  const show = page.getByRole('button', { name: 'Показати' }).first();
  await expect(show).toBeVisible();
  await show.click();
  await expect(screen.getByText('Екран готовий')).not.toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: 'Очистити екран' }).click();
  await expect(screen.getByText('Екран готовий')).toBeVisible({ timeout: 5000 });

  expect(errors, 'Host page JS errors').toEqual([]);
  expect(qErrors, 'Questionnaire JS errors').toEqual([]);
  expect(screenErrors, 'Public Screen JS errors').toEqual([]);
});

test('TYAMA clean event end-to-end acceptance', async ({ page, context }) => {
  test.setTimeout(180000);
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  await login(page);

  const stamp = Date.now();
  const eventName = `Acceptance ${stamp}`;
  const guestName = `Smoke Guest ${stamp}`;
  page.once('dialog', async dialog => dialog.accept(eventName));
  await page.getByRole('button', { name: 'Нова подія' }).click();
  await expect(page.getByRole('heading', { name: eventName })).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Анкета' }).click();
  const publicLink = page.getByRole('link', { name: 'Відкрити public questionnaire' });
  await expect(publicLink).toBeVisible();
  const href = await publicLink.getAttribute('href');
  expect(href).toContain('#/q/');

  const respondent = await context.newPage();
  const respondentErrors = [];
  respondent.on('pageerror', e => respondentErrors.push(String(e)));
  await respondent.goto(href, { waitUntil: 'domcontentloaded' });
  await expect(respondent.getByRole('button', { name: 'Надіслати відповіді' })).toBeVisible();

  const inputs = respondent.locator('form input');
  const textareas = respondent.locator('form textarea');
  const selects = respondent.locator('form select');
  for (let i = 0; i < await inputs.count(); i++) {
    await inputs.nth(i).fill(i === 0 ? guestName : `Тестова відповідь ${i + 1}`);
  }
  for (let i = 0; i < await textareas.count(); i++) {
    await textareas.nth(i).fill(`Жива тестова історія ${stamp} — деталь для Event Kit ${i + 1}`);
  }
  for (let i = 0; i < await selects.count(); i++) {
    const opts = await selects.nth(i).locator('option').allTextContents();
    const value = opts.find(x => x && !/^ні$/i.test(x)) || opts.find(Boolean);
    if (value) await selects.nth(i).selectOption({ label: value });
  }

  await respondent.getByRole('button', { name: 'Надіслати відповіді' }).click();
  await expect(respondent.getByText('Дякуємо. Контекст збережено.')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Відповіді' }).click();
  await expect(page.getByText(guestName)).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Event Kit' }).click();
  await expect(page.locator('[data-kit-id]').first()).toBeVisible({ timeout: 10000 });
  const firstCard = page.locator('[data-kit-id]').first();
  await firstCard.locator('select[data-priv]').selectOption('public_allowed');
  const approve = firstCard.getByRole('button', { name: 'Відібрати' });
  if (await approve.count()) await approve.click();

  await page.getByRole('button', { name: 'Репетиція' }).click();
  const ready = page.getByRole('button', { name: 'Готово' }).first();
  await expect(ready).toBeVisible({ timeout: 10000 });
  await ready.click();
  await expect(ready).toHaveText(/Готово/);

  await page.getByRole('button', { name: 'Live' }).click();
  const publicScreenLink = page.getByRole('link', { name: 'Відкрити Public Screen' });
  await expect(publicScreenLink).toBeVisible();
  const screenHref = await publicScreenLink.getAttribute('href');
  expect(screenHref).toContain('#/screen/');

  const publicScreen = await context.newPage();
  const screenErrors = [];
  publicScreen.on('pageerror', e => screenErrors.push(String(e)));
  await publicScreen.goto(screenHref, { waitUntil: 'domcontentloaded' });
  await expect(publicScreen.getByText('Екран готовий')).toBeVisible({ timeout: 10000 });

  const show = page.getByRole('button', { name: 'Показати' }).first();
  await expect(show).toBeVisible({ timeout: 10000 });
  await show.click();
  await expect(publicScreen.getByText('Екран готовий')).not.toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: 'Очистити екран' }).click();
  await expect(publicScreen.getByText('Екран готовий')).toBeVisible({ timeout: 5000 });

  expect(errors, 'Host JS errors').toEqual([]);
  expect(respondentErrors, 'Respondent JS errors').toEqual([]);
  expect(screenErrors, 'Public Screen JS errors').toEqual([]);
});
