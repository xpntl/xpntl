import { expect, test } from '@playwright/test';

test.describe('xpntl smoke', () => {
  test('signup page renders core fields', async ({ page }) => {
    await page.goto('/signup');

    await expect(page.getByRole('heading', { name: /create workspace/i })).toBeVisible();
    await expect(page.getByLabel(/workspace name/i)).toBeVisible();
    await expect(page.getByLabel(/workspace slug/i)).toBeVisible();
    await expect(page.getByLabel(/workspace key/i)).toBeVisible();
    await expect(page.getByLabel(/^email$/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create workspace/i })).toBeVisible();
  });
});
