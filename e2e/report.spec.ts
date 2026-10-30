import { expect, test } from '@playwright/test';

// A sample report opens from precomputed results, so these flows need no model calls.

test('a scanned sample opens with the plan diagram, the charts and their tables', async ({ page }) => {
  await page.goto('/report/sample-buttahatchee-2004');
  await expect(page.getByRole('heading', { name: /Buttahatchee River Watershed Plan/ })).toBeVisible();

  const glance = page.getByRole('region', { name: 'Plan at a glance' });
  await expect(glance).toBeVisible();
  await expect(glance.getByRole('button', { name: /^Activities: \d+/ })).toBeVisible();

  const map = page.getByRole('region', { name: 'Where the plan says it' });
  await expect(map.getByRole('img', { name: /Items per page for each category over 108 pages/ })).toBeVisible();
  await expect(map.getByText('Scanned page, read')).toBeVisible();
  await map.getByRole('radio', { name: 'Table' }).click();
  await expect(map.getByRole('cell', { name: 'p. 21', exact: true })).toBeVisible();

  for (const title of ['Reduction targets', 'Who carries out the activities', 'Implementation timeline']) {
    await expect(page.getByRole('region', { name: title })).toBeVisible();
  }
});

test('a step of the plan diagram opens its category, and an item opens its evidence', async ({ page }) => {
  await page.goto('/report/sample-buttahatchee-2004');
  await page.getByRole('region', { name: 'Plan at a glance' }).getByRole('button', { name: /^Activities: \d+/ }).click();
  await expect(page.getByRole('tab', { name: /Implementation/, selected: true })).toBeVisible();

  const row = page.getByRole('row', { name: /Fix failing septic systems/ }).first();
  await row.getByRole('button', { name: 'Show evidence' }).click();
  await page.getByRole('button', { name: 'Show on page' }).first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(/Fix failing septic systems/).first()).toBeVisible();
  await expect(sheet.getByText(/Page 21/).first()).toBeVisible();
});

test('the quality tab lists what the checks rejected', async ({ page }) => {
  await page.goto('/report/sample-buttahatchee-2004?tab=quality');
  await expect(page.getByRole('heading', { name: 'Rejected by the checks' })).toBeVisible();
  await expect(page.getByText('Scanned pages read')).toBeVisible();
});
