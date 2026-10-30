import { expect, test } from '@playwright/test';

test('the home page lists the sample plans and opens one', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Choose a PDF file')).toBeAttached();
  // Held-out plans are among the samples, marked as such.
  await expect(page.getByRole('link', { name: /Yazoo Pass.*Not used for tuning|Not used for tuning.*Yazoo Pass/ })).toBeVisible();
  await page.getByRole('link', { name: /Broken Pumpkin/ }).first().click();
  await expect(page).toHaveURL(/\/report\/sample-broken-pumpkin-2019/);
  await expect(page.getByRole('region', { name: 'Plan at a glance' })).toBeVisible();
});

test('the accuracy page shows the scores per plan and how they are measured', async ({ page }) => {
  await page.goto('/accuracy');
  await expect(page.getByRole('heading', { name: 'Accuracy', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'By plan', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Buttahatchee 2004' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'West Boley 2007' })).toBeVisible();
  await expect(page.getByText('Held-out plans', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'How it is measured' })).toBeVisible();
});

test('the how-it-works page explains the pipeline', async ({ page }) => {
  await page.goto('/how-it-works');
  await expect(page.getByRole('heading', { name: 'Hundreds of pages, a few at a time' })).toBeVisible();
});
