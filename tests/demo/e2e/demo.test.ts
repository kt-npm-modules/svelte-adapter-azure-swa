import assert from 'node:assert';
import { expect, test } from './baseFixtures';

test('home page has expected h1', async ({ page }) => {
	await page.goto('/', { waitUntil: 'networkidle', timeout: 60000 });
	await expect(page.locator('h1')).toBeVisible();
});

test('about page has expected h1', async ({ page }) => {
	await page.goto('/about', { waitUntil: 'networkidle', timeout: 60000 });
	expect(await page.textContent('h1')).toBe('About this app');
});

test('submits sverdle guess', async ({ page }) => {
	await page.goto('/sverdle', { waitUntil: 'networkidle', timeout: 60000 });
	// wait for the sveltekit to run hydration
	// Otherwise the test will fail
	// await page.waitForTimeout(2000);
	await page.waitForLoadState('domcontentloaded');
	await page.waitForLoadState('networkidle');

	const input = page.locator('input[name=guess]').first();
	await expect(input).not.toBeDisabled({ timeout: 60000 });
	await input.focus();

	await page.keyboard.type('AZURE');
	await page.keyboard.press('Enter');

	await expect(input).toHaveValue('a');
	await expect(input).toBeDisabled({ timeout: 60000 });
});

test('can call custom API azure function', async ({ request }) => {
	const response = await request.post('/api/HelloWorld', {
		data: {
			name: 'Geoff'
		}
	});
	expect(response.ok()).toBeTruthy();
});

for (const verb of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
	test(`can call ${verb} method on server endpoint`, async ({ request }) => {
		const response = await request.fetch(`/methods/`, {
			method: verb
		});
		expect(response.ok()).toBeTruthy();
		expect(await response.text()).toContain(verb.toLowerCase());
	});
}

test(`POST empty-body edge case currently does not expose workaround marker`, async ({
	request
}) => {
	const verb = 'POST';
	const response = await request.fetch(`/methods/`, {
		method: verb,
		headers: {
			'content-length': '0'
		}
	});
	expect(response.ok()).toBeTruthy();
	expect(await response.text()).toContain(verb.toLowerCase());
	const workaroundHeaderStr = response.headers()['x-adapter-test-workarounds'];
	assert(workaroundHeaderStr, 'workaround header must be present');
	const workaroundHeader = JSON.parse(workaroundHeaderStr);
	expect(workaroundHeader).toBeDefined();
	expect(workaroundHeader.emptyPostWorkaround).toBe(false);
});

test('POST empty-body edge case currently does not expose workaround marker via native fetch', async () => {
	const baseURL = test.info().project.use.baseURL;
	assert(baseURL, 'baseURL must be defined in test configuration');
	const response = await fetch(`${baseURL}/methods/`, {
		method: 'POST',
		headers: {
			'content-length': '0'
		}
	});

	expect(response.ok).toBeTruthy();
	expect(await response.text()).toContain('post');
	const workaroundHeaderStr = response.headers.get('x-adapter-test-workarounds');
	assert(workaroundHeaderStr, 'workaround header must be present');
	const workaroundHeader = JSON.parse(workaroundHeaderStr);
	expect(workaroundHeader).toBeDefined();
	expect(workaroundHeader.emptyPostWorkaround).toBe(false);
});

test('empty form submit via page action', async ({ page }) => {
	await page.goto('/empty-post-form');
	await page.click('#empty-post-submit');

	await expect(page.locator('#empty-post-success')).toHaveText('success');
	await expect(page.locator('#empty-post-workaround-marker')).toHaveText('false');
});
