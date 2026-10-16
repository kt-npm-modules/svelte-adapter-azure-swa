import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { waitForSentryEvent } from './helpers/sentry-api';

const token = process.env.SENTRY_AUTH_TOKEN;
const release = process.env.PUBLIC_SENTRY_RELEASE;
const environment = process.env.PUBLIC_SENTRY_ENVIRONMENT;
if (!token || !release || !environment) {
	throw new Error('Sentry E2E requires a token and the tested build release/environment.');
}
const settings = { token };
const build = { release, environment };
test.setTimeout(120_000);

test('client button throws and its exact event reaches Sentry', async ({ page }) => {
	const run = randomUUID().replaceAll('-', '');
	await page.goto(`/adapter/sentry?sentry_test_run=${run}`);
	const error = page.waitForEvent('pageerror');
	await page.getByRole('button', { name: 'Trigger client error' }).click();
	expect((await error).message).toBe('Adapter demo: client error');
	await expect(page.getByTestId('client-status')).toContainText('Client error triggered');
	await expect(page.locator('html')).toHaveAttribute('data-sentry-event-id', /^[a-f0-9]{32}$/i);
	const eventId = (await page.locator('html').getAttribute('data-sentry-event-id'))!;
	await waitForSentryEvent({ eventId, run, side: 'client', ...build }, settings);
});

test('server button returns 500 and its exact event reaches Sentry', async ({ page }) => {
	const run = randomUUID().replaceAll('-', '');
	await page.goto(`/adapter/sentry?sentry_test_run=${run}`);
	const received = page.waitForResponse((r) => r.url().endsWith('/adapter/sentry/error'));
	await page.getByRole('button', { name: 'Trigger server error' }).click();
	const response = await received;
	expect(response.status()).toBe(500);
	await expect(page.getByTestId('server-status')).toContainText('Server response: 500');
	await expect(page.getByRole('button', { name: 'Trigger server error' })).toBeEnabled();
	const eventId = response.headers()['x-adapter-sentry-event-id'];
	expect(eventId).toMatch(/^[a-f0-9]{32}$/i);
	await waitForSentryEvent({ eventId, run, side: 'server', ...build }, settings);
});
