/**
 * Playwright diagnostic probe matrix for /diagnostic-headers-nav-fallback and
 * /diagnostic-headers-rewrite — see openspec/changes/diagnose-swa-rewrite-vs-fallback/.
 *
 * SAFETY-BY-DESIGN: tests generate a fresh diagnosticBearer + probeId per test,
 * use them only as request input, and attach ONLY the sanitized DiagnosticFacts
 * object returned by the route. The generated values are never logged, attached,
 * or otherwise persisted. A defense-in-depth string-search guard inside
 * assertCoreShape rejects any attachment that would contain them.
 *
 * Route modes (parameterized by URL path; each existing probe runs once per mode):
 *   - nav-fallback → /diagnostic-headers-nav-fallback
 *       reached via SWA navigationFallback (GET/HEAD/OPTIONS) and the
 *       auto-generated catch-all '*'-method rewrite (POST/PUT/PATCH/DELETE).
 *   - rewrite      → /diagnostic-headers-rewrite
 *       reached via an explicit per-path rewrite added through the existing
 *       customStaticWebAppConfig.routes adapter option, for every method.
 *
 * Probe matrix (16 probes total — 8 per route mode):
 *   1. get-auth, head-auth, post-auth-form, put-auth-json,
 *      patch-auth-json, delete-auth, options-auth   ← one auth probe per method
 *   2. get-baseline-no-auth                          ← one no-auth baseline
 *
 * PATCH and DELETE are tested directly — not sampled by proxy from POST/PUT.
 */

import { expect, test, type APIRequestContext, type TestInfo } from '@playwright/test';
import { randomBytes, randomUUID } from 'node:crypto';

type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS';

const ROUTE_MODES = [
	{ key: 'nav-fallback', path: '/diagnostic-headers-nav-fallback' },
	{ key: 'rewrite', path: '/diagnostic-headers-rewrite' }
] as const;
type RouteMode = (typeof ROUTE_MODES)[number];

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
		// Adapter-level pre-strip Authorization comparator. Test control header
		// only — the adapter never interprets its value as auth. Sent on every
		// probe (auth and baseline) so the comparator's right operand is
		// always present in the diagnostic surface; only the inbound
		// Authorization differs between probes. See
		// openspec/changes/strip-swa-authorization/specs/adapter-authorization-policy/spec.md.
		'x-test-workaround-authorization': bearer,
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
	await testInfo.attach(`${probeKey}.json`, {
		body: JSON.stringify(facts, null, 2),
		contentType: 'application/json'
	});
}

type AuthorizationOutcome =
	'preserved' | 'overwritten' | 'stripped' | 'custom-headers-not-reaching-app';

function classifyAuthorization(facts: Record<string, unknown>): AuthorizationOutcome {
	const auth = facts.authorizationPresent === true;
	const test = facts.testAuthorizationPresent === true;
	const equal = facts.authorizationEqualsTestAuthorization;
	if (!test) return 'custom-headers-not-reaching-app';
	if (!auth) return 'stripped';
	return equal === true ? 'preserved' : 'overwritten';
}

// ---------------------------------------------------------------------------
// Adapter-level pre-strip Authorization diagnostics. The adapter publishes
// its `AdapterTestWorkaroundsInfo` JSON on the `x-adapter-test-workarounds`
// response header (single transport header, namespaced payload) when
// `testWorkarounds` is enabled in the demo's adapter config. The `auth`
// namespace tells us what the adapter saw BEFORE stripping Authorization.
// ---------------------------------------------------------------------------

interface AuthWorkaroundInfo {
	rawAuthorizationPresent: boolean;
	testWorkaroundAuthorizationPresent: boolean;
	rawAuthorizationEqualsTestWorkaroundAuthorization: boolean | null;
	authorizationStripped: boolean;
}

/**
 * Read and parse the adapter's `x-adapter-test-workarounds` response header
 * and return the `auth` namespace, or `null` when the header is absent /
 * unparseable / missing the namespace. Never throws — diagnostic-headers
 * tests should still record the SvelteKit-level facts even if the adapter-
 * level header didn't ride along on the response (e.g. on `HEAD` where the
 * body is empty but headers still arrive).
 */
function readAuthWorkaroundInfo(
	response: Awaited<ReturnType<APIRequestContext['fetch']>>
): AuthWorkaroundInfo | null {
	const headers = response.headers();
	const raw = headers['x-adapter-test-workarounds'];
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as { auth?: AuthWorkaroundInfo };
		return parsed.auth ?? null;
	} catch {
		return null;
	}
}

// Mirrors the env-branching used by tests/demo/e2e/demo.test.ts so the four
// matrix cells of the auth workaround info can be asserted per-environment.
const isSwaCli = process.env.PUBLIC_SWA_CLI === 'true';
const isLiveAzure = process.env.CI === 'true' && !isSwaCli;

/**
 * Per-probe core assertion: status 200, expected method echoed, the four core
 * comparator keys present, and the safety-by-design string-search guard that
 * neither the test's diagnosticBearer nor probeId appear anywhere in the
 * serialized facts.
 *
 * After the strip-swa-authorization adapter fix is in effect with default
 * options, the SvelteKit-level diagnostic facts MUST report Authorization
 * absent on every probe (auth and baseline) on both routes in both
 * environments — the adapter strips Authorization before SvelteKit sees it.
 * x-test-authorization / probe-id controls remain present.
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
	// SvelteKit-level expectations under the default adapter policy.
	// authorizationPresent is false because the adapter stripped Authorization
	// before constructing the SvelteKit Request. authorizationEqualsTest...
	// is null because the comparator's left operand is absent.
	expect(facts.authorizationPresent).toBe(false);
	expect(facts.testAuthorizationPresent).toBe(true);
	expect(facts.authorizationEqualsTestAuthorization).toBe(null);
	const serialized = JSON.stringify(facts);
	expect(serialized).not.toContain(controls.diagnosticBearer);
	expect(serialized).not.toContain(controls.probeId);
}

/**
 * Assert the adapter-level `auth` namespace against the four matrix cells:
 *
 *   Auth probe + isSwaCli:    (true, true, true,  true)
 *   Auth probe + isLiveAzure: (true, true, false, true)
 *   Baseline   + isSwaCli:    (false, true, null, false)
 *   Baseline   + isLiveAzure: (true, true, false, true)
 *
 * The whole point of this change is that x-adapter-test-workarounds.auth
 * exposes sanitized pre-strip Authorization behaviour; if that header /
 * namespace is missing, the test SHALL fail. The assertion is strict on
 * every method including HEAD — local evidence shows HEAD does carry the
 * response header on SWA CLI, so a method-specific exception is not
 * justified at this point. If a future real-Azure CI run demonstrates
 * that HEAD responses strip this header in production, surface that as a
 * deliberate failure and add a narrow method-specific exception here with
 * the evidence cited.
 *
 * The `auth` namespace SHALL NOT contain raw header values — only booleans
 * and the tri-state. The string-search guard rejects the test's bearer if
 * it ever leaks in.
 */
function assertAuthWorkaroundCell(
	auth: AuthWorkaroundInfo | null,
	probeKind: 'auth' | 'baseline',
	_method: HttpMethod,
	controls: ControlValues
): void {
	expect(auth, 'x-adapter-test-workarounds.auth must be present and parseable').not.toBeNull();
	if (auth === null) return; // satisfies TS — expect.not.toBeNull above already failed
	// Belt-and-braces safety: the namespace must be booleans-only.
	const serialized = JSON.stringify(auth);
	expect(serialized).not.toContain(controls.diagnosticBearer);
	expect(serialized).not.toContain(controls.probeId);

	if (probeKind === 'auth') {
		if (isSwaCli) {
			expect(auth).toEqual({
				rawAuthorizationPresent: true,
				testWorkaroundAuthorizationPresent: true,
				rawAuthorizationEqualsTestWorkaroundAuthorization: true,
				authorizationStripped: true
			});
		} else if (isLiveAzure) {
			expect(auth).toEqual({
				rawAuthorizationPresent: true,
				testWorkaroundAuthorizationPresent: true,
				rawAuthorizationEqualsTestWorkaroundAuthorization: false,
				authorizationStripped: true
			});
		}
	} else {
		if (isSwaCli) {
			expect(auth).toEqual({
				rawAuthorizationPresent: false,
				testWorkaroundAuthorizationPresent: true,
				rawAuthorizationEqualsTestWorkaroundAuthorization: null,
				authorizationStripped: false
			});
		} else if (isLiveAzure) {
			expect(auth).toEqual({
				rawAuthorizationPresent: true,
				testWorkaroundAuthorizationPresent: true,
				rawAuthorizationEqualsTestWorkaroundAuthorization: false,
				authorizationStripped: true
			});
		}
	}
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
	path: string,
	method: HttpMethod,
	headers: Record<string, string>,
	body?: string
): Promise<Awaited<ReturnType<APIRequestContext['fetch']>>> {
	const headersWithOrigin: Record<string, string> = { Origin: resolveOrigin(testInfo), ...headers };
	return request.fetch(path, { method, headers: headersWithOrigin, data: body });
}

async function runAuthProbe(options: {
	probeKey: string;
	method: HttpMethod;
	routeMode: RouteMode;
	request: APIRequestContext;
	testInfo: TestInfo;
	extraHeaders?: Record<string, string>;
	body?: string;
}): Promise<void> {
	const { probeKey, method, routeMode, request, testInfo, extraHeaders, body } = options;
	const controls = freshControls();
	const headers = controlHeaders(controls, { authorization: true, extra: extraHeaders });
	const response = await fetchWithMethod(request, testInfo, routeMode.path, method, headers, body);
	expect(response.status()).toBe(200);
	const facts = await getFacts(response, method);
	assertCoreShape(facts, method, controls);
	const auth = readAuthWorkaroundInfo(response);
	assertAuthWorkaroundCell(auth, 'auth', method, controls);
	await attachFacts(testInfo, `${routeMode.key}/${probeKey}`, facts);
	const outcome = classifyAuthorization(facts);
	testInfo.annotations.push({
		type: 'authorization-outcome',
		description: `${routeMode.key} ${method} ${probeKey}: ${outcome}`
	});
}

async function runForwardedProbe(options: {
	probeKey: string;
	routeMode: RouteMode;
	request: APIRequestContext;
	testInfo: TestInfo;
	extraHeaders?: Record<string, string>;
}): Promise<void> {
	const { probeKey, routeMode, request, testInfo, extraHeaders } = options;
	const controls = freshControls();
	const headers = controlHeaders(controls, { authorization: false, extra: extraHeaders });
	const response = await fetchWithMethod(request, testInfo, routeMode.path, 'GET', headers);
	expect(response.status()).toBe(200);
	const facts = await getFacts(response, 'GET');
	assertCoreShape(facts, 'GET', controls);
	const auth = readAuthWorkaroundInfo(response);
	assertAuthWorkaroundCell(auth, 'baseline', 'GET', controls);
	await attachFacts(testInfo, `${routeMode.key}/${probeKey}`, facts);
}

// ---------------------------------------------------------------------------
// Auth probes — one per adapter-supported HTTP method, per route mode, tested
// directly. PATCH and DELETE are NOT sampled by proxy from POST/PUT.
// ---------------------------------------------------------------------------

for (const routeMode of ROUTE_MODES) {
	test.describe(`diagnostic-headers / ${routeMode.key} / auth probes`, () => {
		test(`${routeMode.key} get-auth — GET with Authorization`, async ({ request }, testInfo) => {
			await runAuthProbe({ probeKey: 'get-auth', method: 'GET', routeMode, request, testInfo });
		});

		test(`${routeMode.key} head-auth — HEAD with Authorization`, async ({ request }, testInfo) => {
			await runAuthProbe({ probeKey: 'head-auth', method: 'HEAD', routeMode, request, testInfo });
		});

		test(`${routeMode.key} post-auth-form — POST with Authorization + form body`, async ({
			request
		}, testInfo) => {
			await runAuthProbe({
				probeKey: 'post-auth-form',
				method: 'POST',
				routeMode,
				request,
				testInfo,
				extraHeaders: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: 'foo=bar'
			});
		});

		test(`${routeMode.key} put-auth-json — PUT with Authorization + JSON body`, async ({
			request
		}, testInfo) => {
			await runAuthProbe({
				probeKey: 'put-auth-json',
				method: 'PUT',
				routeMode,
				request,
				testInfo,
				extraHeaders: { 'Content-Type': 'application/json' },
				body: '{"foo":"bar"}'
			});
		});

		test(`${routeMode.key} patch-auth-json — PATCH with Authorization + JSON body (direct)`, async ({
			request
		}, testInfo) => {
			await runAuthProbe({
				probeKey: 'patch-auth-json',
				method: 'PATCH',
				routeMode,
				request,
				testInfo,
				extraHeaders: { 'Content-Type': 'application/json' },
				body: '{"foo":"bar"}'
			});
		});

		test(`${routeMode.key} delete-auth — DELETE with Authorization (direct)`, async ({
			request
		}, testInfo) => {
			await runAuthProbe({
				probeKey: 'delete-auth',
				method: 'DELETE',
				routeMode,
				request,
				testInfo
			});
		});

		test(`${routeMode.key} options-auth — OPTIONS with Authorization`, async ({
			request
		}, testInfo) => {
			await runAuthProbe({
				probeKey: 'options-auth',
				method: 'OPTIONS',
				routeMode,
				request,
				testInfo
			});
		});
	});

	// -------------------------------------------------------------------------
	// Forwarded-header probes (additional, GET-only). Per-mode no-auth baseline.
	// -------------------------------------------------------------------------

	test.describe(`diagnostic-headers / ${routeMode.key} / forwarded probes`, () => {
		test(`${routeMode.key} get-baseline-no-auth — GET, no Authorization`, async ({
			request
		}, testInfo) => {
			await runForwardedProbe({
				probeKey: 'get-baseline-no-auth',
				routeMode,
				request,
				testInfo
			});
		});
	});
}
