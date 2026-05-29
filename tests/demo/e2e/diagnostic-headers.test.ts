/**
 * Playwright diagnostic probe matrix for /diagnostic-headers — see
 * openspec/changes/forwarded-headers-diagnostics/specs/demo-diagnostics/spec.md.
 *
 * SAFETY-BY-DESIGN: tests generate a fresh diagnosticBearer + probeId per test,
 * use them only as request input, and attach ONLY the sanitized DiagnosticFacts
 * object returned by the route. The generated values are never logged, attached,
 * or otherwise persisted. A defense-in-depth string-search guard inside
 * assertCoreShape rejects any attachment that would contain them.
 *
 * Probe matrix:
 *   1. get-auth, head-auth, post-auth-form, put-auth-json,
 *      patch-auth-json, delete-auth, options-auth   ← one auth probe per method
 *   2. get-baseline-no-auth, get-baseline-no-auth-repeat, get-spoof-forwarded
 *
 * PATCH and DELETE are tested directly — not sampled by proxy from POST/PUT.
 */

import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';

type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

const PROBE_PATH = '/diagnostic-headers';

interface ControlValues {
	diagnosticBearer: string;
	probeId: string;
}

function freshControls(): ControlValues {
	return {
		diagnosticBearer: randomBytes(32).toString('base64url'),
		probeId: randomUUID()
	};
}

interface ControlHeaderOptions {
	authorization: boolean;
	extra?: Record<string, string>;
}

function controlHeaders(
	controls: ControlValues,
	options: ControlHeaderOptions
): Record<string, string> {
	const bearer = `Bearer ${controls.diagnosticBearer}`;
	const out: Record<string, string> = {
		'x-test-authorization': bearer,
		'x-test-probe-id': controls.probeId,
		'x-test-expected-probe-id': controls.probeId
	};
	if (options.authorization) out['Authorization'] = bearer;
	if (options.extra) Object.assign(out, options.extra);
	return out;
}

/**
 * Decode the sanitized DiagnosticFacts from the channel appropriate to the
 * method: response headers for HEAD, response body for everything else.
 */
async function getFacts(
	response: Awaited<ReturnType<APIRequestContext['fetch']>>,
	method: HttpMethod
): Promise<Record<string, unknown>> {
	if (method === 'HEAD') {
		const responseHeaders = response.headers();
		const facts: Record<string, unknown> = {};
		for (const [name, value] of Object.entries(responseHeaders)) {
			if (!name.startsWith('x-diag-')) continue;
			const key = kebabToCamel(name.slice('x-diag-'.length));
			facts[key] = decodeFactValue(value);
		}
		return facts;
	}
	return (await response.json()) as Record<string, unknown>;
}

function decodeFactValue(raw: string): unknown {
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	if (raw === 'null') return null;
	return raw;
}

function kebabToCamel(name: string): string {
	return name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

async function attachFacts(
	testInfo: TestInfo,
	probeKey: string,
	facts: Record<string, unknown>
): Promise<void> {
	await testInfo.attach(`diagnostic-headers/${probeKey}.json`, {
		body: JSON.stringify(facts, null, 2),
		contentType: 'application/json'
	});
}

type AuthorizationOutcome =
	| 'preserved'
	| 'overwritten'
	| 'stripped'
	| 'custom-headers-not-reaching-app';

function classifyAuthorization(facts: Record<string, unknown>): AuthorizationOutcome {
	const auth = facts.authorizationPresent === true;
	const test = facts.testAuthorizationPresent === true;
	const equal = facts.authorizationEqualsTestAuthorization;
	if (!test) return 'custom-headers-not-reaching-app';
	if (!auth) return 'stripped';
	return equal === true ? 'preserved' : 'overwritten';
}

/**
 * Per-probe core assertion: status 200, expected method echoed, the four core
 * comparator keys present, and the safety-by-design string-search guard that
 * neither the test's diagnosticBearer nor probeId appear anywhere in the
 * serialized facts.
 */
function assertCoreShape(
	facts: Record<string, unknown>,
	expectedMethod: HttpMethod,
	controls: ControlValues
): void {
	expect(facts.method).toBe(expectedMethod);
	for (const key of [
		'authorizationPresent',
		'testAuthorizationPresent',
		'authorizationEqualsTestAuthorization',
		'testProbeIdPresent'
	] as const) {
		expect(facts).toHaveProperty(key);
	}
	const serialized = JSON.stringify(facts);
	expect(serialized).not.toContain(controls.diagnosticBearer);
	expect(serialized).not.toContain(controls.probeId);
}

function resolveOrigin(testInfo: TestInfo): string {
	// Use the same baseURL Playwright resolves request.fetch against, so
	// SvelteKit's CSRF check (which blocks cross-site form posts) sees a
	// matching Origin. Origin is non-secret and is what a same-origin
	// browser fetch would send anyway.
	const baseURL = testInfo.project.use.baseURL;
	if (!baseURL) throw new Error('Playwright baseURL is not configured');
	return new URL(baseURL).origin;
}

async function fetchWithMethod(
	request: APIRequestContext,
	testInfo: TestInfo,
	method: HttpMethod,
	headers: Record<string, string>,
	body?: string
): Promise<Awaited<ReturnType<APIRequestContext['fetch']>>> {
	const headersWithOrigin: Record<string, string> = { Origin: resolveOrigin(testInfo), ...headers };
	return request.fetch(PROBE_PATH, { method, headers: headersWithOrigin, data: body });
}

async function runAuthProbe(options: {
	probeKey: string;
	method: HttpMethod;
	request: APIRequestContext;
	testInfo: TestInfo;
	extraHeaders?: Record<string, string>;
	body?: string;
}): Promise<void> {
	const { probeKey, method, request, testInfo, extraHeaders, body } = options;
	const controls = freshControls();
	const headers = controlHeaders(controls, { authorization: true, extra: extraHeaders });
	const response = await fetchWithMethod(request, testInfo, method, headers, body);
	expect(response.status()).toBe(200);
	const facts = await getFacts(response, method);
	assertCoreShape(facts, method, controls);
	await attachFacts(testInfo, probeKey, facts);
	const outcome = classifyAuthorization(facts);
	testInfo.annotations.push({
		type: 'authorization-outcome',
		description: `${method} ${probeKey}: ${outcome}`
	});
}

async function runForwardedProbe(options: {
	probeKey: string;
	request: APIRequestContext;
	testInfo: TestInfo;
	extraHeaders?: Record<string, string>;
}): Promise<void> {
	const { probeKey, request, testInfo, extraHeaders } = options;
	const controls = freshControls();
	const headers = controlHeaders(controls, { authorization: false, extra: extraHeaders });
	const response = await fetchWithMethod(request, testInfo, 'GET', headers);
	expect(response.status()).toBe(200);
	const facts = await getFacts(response, 'GET');
	assertCoreShape(facts, 'GET', controls);
	await attachFacts(testInfo, probeKey, facts);
}

// ---------------------------------------------------------------------------
// Auth probes — one per adapter-supported HTTP method, tested directly.
// PATCH and DELETE are NOT sampled by proxy from POST/PUT.
// ---------------------------------------------------------------------------

test.describe('diagnostic-headers / auth probes', () => {
	test('get-auth — GET with Authorization', async ({ request }, testInfo) => {
		await runAuthProbe({ probeKey: 'get-auth', method: 'GET', request, testInfo });
	});

	test('head-auth — HEAD with Authorization', async ({ request }, testInfo) => {
		await runAuthProbe({ probeKey: 'head-auth', method: 'HEAD', request, testInfo });
	});

	test('post-auth-form — POST with Authorization + form body', async ({ request }, testInfo) => {
		await runAuthProbe({
			probeKey: 'post-auth-form',
			method: 'POST',
			request,
			testInfo,
			extraHeaders: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: 'foo=bar'
		});
	});

	test('put-auth-json — PUT with Authorization + JSON body', async ({ request }, testInfo) => {
		await runAuthProbe({
			probeKey: 'put-auth-json',
			method: 'PUT',
			request,
			testInfo,
			extraHeaders: { 'Content-Type': 'application/json' },
			body: '{"foo":"bar"}'
		});
	});

	test('patch-auth-json — PATCH with Authorization + JSON body (direct)', async ({
		request
	}, testInfo) => {
		await runAuthProbe({
			probeKey: 'patch-auth-json',
			method: 'PATCH',
			request,
			testInfo,
			extraHeaders: { 'Content-Type': 'application/json' },
			body: '{"foo":"bar"}'
		});
	});

	test('delete-auth — DELETE with Authorization (direct)', async ({ request }, testInfo) => {
		await runAuthProbe({ probeKey: 'delete-auth', method: 'DELETE', request, testInfo });
	});

	test('options-auth — OPTIONS with Authorization', async ({ request }, testInfo) => {
		await runAuthProbe({ probeKey: 'options-auth', method: 'OPTIONS', request, testInfo });
	});
});

// ---------------------------------------------------------------------------
// Forwarded-header probes (additional, GET-only).
// ---------------------------------------------------------------------------

test.describe('diagnostic-headers / forwarded probes', () => {
	test('get-baseline-no-auth — GET, no Authorization', async ({ request }, testInfo) => {
		await runForwardedProbe({ probeKey: 'get-baseline-no-auth', request, testInfo });
	});

	test('get-baseline-no-auth-repeat — second baseline run, fresh values', async ({
		request
	}, testInfo) => {
		await runForwardedProbe({ probeKey: 'get-baseline-no-auth-repeat', request, testInfo });
	});

	test('get-spoof-forwarded — GET with spoofed X-Forwarded-* headers', async ({
		request
	}, testInfo) => {
		await runForwardedProbe({
			probeKey: 'get-spoof-forwarded',
			request,
			testInfo,
			extraHeaders: {
				'X-Forwarded-Host': 'evil.example',
				'X-Forwarded-Proto': 'gopher'
			}
		});
	});
});
