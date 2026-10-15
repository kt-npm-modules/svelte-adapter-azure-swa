import { expect, test } from '@playwright/test';

test.describe('Sentry Route', () => {
	test('should send sample errors to Sentry when button is pressed', async ({ page }) => {
		// Navigate to the Sentry route
		await page.goto('/sentry-example-page');
		// Sleep for 2 seconds to allow Sentry to load the error
		await page.waitForTimeout(2000);

		// Find and click the button to send sample errors using data-testid
		const sendErrorButton = await page.locator('[data-testid="throw"]');
		await sendErrorButton.click();

		// Wait until all network activity is complete
		await page.waitForLoadState('networkidle');

		// Verify that the error was sent (this could be checking for a success message or similar feedback)
		const successMessage = await page.locator('text=Sample error was sent to Sentry.');
		await expect(successMessage).toBeVisible();

		// Wait until all network activity is complete
		await page.waitForLoadState('networkidle');
	});
});
