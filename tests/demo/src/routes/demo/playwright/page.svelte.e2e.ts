import { expect, test } from '@playwright/test';

test('has expected h1', async ({ page }) => {
	const response = await page.request.get('/demo/playwright');
	expect(response.status()).toBe(200);
	expect(await response.text()).toContain('Playwright e2e test demo');
	await page.goto('/demo/playwright');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Playwright e2e test demo');
});
