import { expect, test } from '@playwright/test';

test('triggers a real unhandled client error from the Sentry page', async ({ page }) => {
	await page.goto('/adapter/sentry');
	const error = page.waitForEvent('pageerror');
	await page.getByRole('button', { name: 'Trigger client error' }).click();
	expect((await error).message).toBe('Adapter demo: client error');
	await expect(page.getByTestId('client-status')).toContainText('Client error triggered');
});

test('triggers the server error endpoint and displays its HTTP status', async ({ page }) => {
	await page.goto('/adapter/sentry');
	const response = page.waitForResponse((r) => r.url().endsWith('/adapter/sentry/error'));
	await page.getByRole('button', { name: 'Trigger server error' }).click();
	expect((await response).status()).toBe(500);
	await expect(page.getByTestId('server-status')).toContainText('Server response: 500');
	await expect(page.getByRole('button', { name: 'Trigger server error' })).toBeEnabled();
});
