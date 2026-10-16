import { expect, test } from '@playwright/test';
import { hasAzureAdapter, isLiveAzure } from './environment';

for (const [path, heading] of [
	['/', 'SvelteKit app'],
	['/about', 'About this app'],
	['/sverdle/how-to-play', 'How to play Sverdle'],
	['/adapter', 'Azure SWA adapter scenarios']
]) {
	test(`renders ${path} on direct load`, async ({ page, request }) => {
		const response = await request.get(path);
		expect(response.status()).toBe(200);
		expect(await response.text()).toContain(heading);
		await page.goto(path);
		await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
	});
}

test('navigates between scaffold and adapter pages', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: 'Adapter', exact: true }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Azure SWA adapter scenarios');
	await page.getByRole('link', { name: 'Platform and authentication' }).click();
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Adapter platform');
});

test('submits Sverdle guess and keeps the game cookie', async ({ page, context }) => {
	await page.goto('/sverdle');
	const firstInput = page.locator('input[name=guess]').first();
	await page.getByRole('button', { name: /^a(?: |$)/ }).click();
	for (const letter of ['z', 'u', 'r', 'e'])
		await page.getByRole('button', { name: new RegExp(`^${letter}(?: |$)`) }).click();
	const submitted = page.waitForResponse(
		(r) => r.request().method() === 'POST' && r.url().includes('/sverdle')
	);
	await page.getByRole('button', { name: 'enter', exact: true }).click();
	expect((await submitted).status()).toBe(200);
	await expect(firstInput).toHaveValue('a');
	await expect(firstInput).toBeDisabled();
	expect((await context.cookies()).some((c) => c.name === 'sverdle')).toBe(true);
	await page.reload();
	await expect(page.locator('input[name=guess]').first()).toHaveValue('a');
	await expect(page.locator('input[name=guess]').first()).toBeDisabled();
});

test('platform load exposes consistent facts and fresh invocation IDs', async ({ page }) => {
	await page.goto('/adapter/platform');
	const facts = JSON.parse((await page.getByTestId('platform-facts').textContent())!);
	expect(facts.userPresent).toBe(facts.clientPrincipalPresent);
	expect(facts.clientAddressPresent).toBe(true);
	expect(facts.invocationId).toBeTruthy();
	await page.reload();
	const next = JSON.parse((await page.getByTestId('platform-facts').textContent())!);
	expect(next.invocationId).not.toBe(facts.invocationId);
});

for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']) {
	test(`serves ${method} endpoint`, async ({ request, baseURL }) => {
		const response = await request.fetch('/adapter/methods', {
			method,
			headers: { origin: new URL(baseURL!).origin }
		});
		expect(response.status()).toBe(200);
		if (method === 'HEAD') {
			expect(await response.text()).toBe('');
			expect(response.headers()['x-method']).toBe('HEAD');
		} else expect(await response.json()).toEqual({ method, body: '' });
	});
}

for (const [contentType, body] of [
	['application/json', '{"name":"Azure"}'],
	['application/x-www-form-urlencoded', 'name=Azure']
]) {
	test(`preserves ${contentType} body`, async ({ request, baseURL }) => {
		const response = await request.post('/adapter/methods', {
			headers: { 'content-type': contentType, origin: new URL(baseURL!).origin },
			data: body
		});
		expect(response.status()).toBe(200);
		expect(await response.json()).toEqual({ method: 'POST', body });
	});
}

test('empty POST via native fetch', async ({ baseURL }) => {
	const response = await fetch(`${baseURL}/adapter/methods`, {
		method: 'POST',
		headers: { 'content-length': '0', origin: new URL(baseURL!).origin }
	});
	expect(response.status).toBe(200);
	expect(await response.json()).toEqual({ method: 'POST', body: '' });
	if (hasAzureAdapter) {
		const info = JSON.parse(response.headers.get('x-adapter-test-workarounds')!);
		expect(info.emptyFormContentTypeStrip.emptyPostWorkaround).toBe(false);
	}
});

test('empty POST via Playwright request', async ({ request, baseURL }) => {
	const response = await request.post('/adapter/methods', {
		headers: { 'content-length': '0', origin: new URL(baseURL!).origin }
	});
	expect(response.status()).toBe(200);
	expect(await response.json()).toEqual({ method: 'POST', body: '' });
	if (hasAzureAdapter) {
		const info = JSON.parse(response.headers()['x-adapter-test-workarounds']);
		expect(info.emptyFormContentTypeStrip.emptyPostWorkaround).toBe(false);
	}
});

test('submits empty form through the page action', async ({ page }) => {
	await page.goto('/adapter/empty-post-form');
	await page.getByRole('button', { name: 'Submit empty POST' }).click();
	await expect(page.locator('#empty-post-success')).toHaveText('success');
	await expect(page.locator('#workarounds-info-marker')).toHaveText(String(hasAzureAdapter));
	await expect(page.locator('#empty-post-workaround-marker')).toHaveText(String(isLiveAzure));
});

test('imports pg Client through the Node/CommonJS build', async ({ request }) => {
	const response = await request.get('/adapter/pg-smoke');
	expect(response.status()).toBe(200);
	expect(await response.text()).toBe('function');
});

test('custom Azure Function handles query and JSON independently of Kit', async ({ request }) => {
	test.skip(!hasAzureAdapter, 'The custom Function runs under SWA/Azure, not Vite preview');
	const get = await request.get('/api/HelloWorld?name=Azure');
	expect(get.status()).toBe(200);
	expect(await get.text()).toBe('Hello, Azure.');
	const post = await request.post('/api/HelloWorld', { data: { name: 'Kit' } });
	expect(post.status()).toBe(200);
	expect(await post.text()).toBe('Hello, Kit.');
});
