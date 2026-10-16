/**
 * Sanitized diagnostic facts for the /diagnostic-headers probe.
 *
 * SAFETY-BY-DESIGN: this module emits ONLY booleans, short closed-enum strings,
 * scheme tokens computed by a fail-closed regex, and non-secret server-generated
 * identifiers. No raw header value, raw cookie, raw client principal, raw token,
 * or full URL with host/query is ever returned.
 *
 * See openspec/changes/forwarded-headers-diagnostics/specs/demo-diagnostics/spec.md
 * for the contract.
 */

import { Buffer } from 'node:buffer';
import { randomUUID, timingSafeEqual } from 'node:crypto';

export type RequestUrlHostKind = 'public' | 'internal-azure-functions' | 'localhost' | 'unknown';

export interface DiagnosticFacts {
	method: string;
	requestUrlProtocol: string;
	requestUrlHostKind: RequestUrlHostKind;
	requestUrlPathname: string;

	authorizationPresent: boolean;
	testAuthorizationPresent: boolean;
	authorizationScheme: string | null;
	testAuthorizationScheme: string | null;
	authorizationLooksBearer: boolean;
	testAuthorizationLooksBearer: boolean;
	authorizationEqualsTestAuthorization: boolean | null;

	testProbeIdPresent: boolean;
	testProbeIdMatchesExpected: boolean | null;

	hostPresent: boolean;
	hostLooksInternalAzureFunctionsHost: boolean;
	xMsOriginalUrlPresent: boolean;
	xMsOriginalUrlLooksAbsolute: boolean;
	xMsOriginalUrlHostEqualsUrlHost: boolean | null;
	xForwardedHostPresent: boolean;
	xForwardedProtoPresent: boolean;
	xForwardedForPresent: boolean;
	xMsClientPrincipalPresent: boolean;

	timestamp: string;
	requestId: string;
}

/**
 * Subset of the SvelteKit `RequestEvent` we need. Kept as a structural type
 * so the helper is unit-testable without constructing a real RequestEvent.
 */
export interface DiagnoseEventLike {
	request: { method: string; headers: Headers };
	url: URL;
}

/**
 * RFC 9110 §11.1 challenge-shaped scheme name: a 1–16 char token built from
 * the limited "scheme" alphabet, followed by whitespace and at least one
 * credential byte. Anchored to start of value, no leading whitespace allowed.
 *
 * Examples that match: "Bearer abc", "Basic dXNlcjpwYXNz", "Digest …".
 * Examples that DO NOT match: "SECRET_WITHOUT_SCHEME" (no whitespace),
 * "Bearer " (no credential), "   Bearer abc" (leading whitespace),
 * "MyVeryLongCustomSchemeName abc" (>16 char token), "Foo:bar abc"
 * (`:` is outside the allowed scheme alphabet).
 */
const SCHEME_REGEX = /^([A-Za-z][A-Za-z0-9+\-.]{0,15})\s+\S/;

/**
 * Extract the auth scheme token from a header value, fail-closed.
 *
 * Returns the lowercased scheme name only when the value matches the strict
 * RFC-shape regex above. Otherwise returns null. NEVER returns a substring of
 * a malformed value (a "substring before first whitespace" fallback would
 * leak the first 16 chars of `SECRET_WITHOUT_SCHEME`).
 */
export function extractAuthScheme(value: string | null): string | null {
	if (value == null) return null;
	const match = SCHEME_REGEX.exec(value);
	if (!match) return null;
	return match[1].toLowerCase();
}

/**
 * Constant-time equality on two strings. Returns null if either argument is
 * absent (matches the spec's tri-state for `authorizationEqualsTestAuthorization`
 * and `testProbeIdMatchesExpected`).
 */
function safeEquals(a: string | null, b: string | null): boolean | null {
	if (a == null || b == null) return null;
	const bufA = Buffer.from(a, 'utf8');
	const bufB = Buffer.from(b, 'utf8');
	// Length check first — timingSafeEqual requires equal-length buffers.
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}

const AZURE_FUNCTIONS_HOST_REGEX = /\.azurewebsites\.net$/i;
const ABSOLUTE_URL_REGEX = /^https?:\/\//i;

function classifyHostKind(url: URL): RequestUrlHostKind {
	const host = url.hostname;
	if (!host) return 'unknown';
	if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return 'localhost';
	if (AZURE_FUNCTIONS_HOST_REGEX.test(host)) return 'internal-azure-functions';
	// Anything else with a dot looks like a real DNS name — treat as public.
	if (host.includes('.')) return 'public';
	return 'unknown';
}

function hostLooksInternal(rawHostHeader: string | null): boolean {
	if (rawHostHeader == null) return false;
	// Strip any port; the regex must match the bare hostname.
	const hostOnly = rawHostHeader.split(':')[0];
	return AZURE_FUNCTIONS_HOST_REGEX.test(hostOnly);
}

function compareXMsOriginalUrlHost(
	rawXMsOriginalUrl: string | null,
	eventUrl: URL
): boolean | null {
	if (rawXMsOriginalUrl == null) return null;
	let parsed: URL;
	try {
		parsed = new URL(rawXMsOriginalUrl);
	} catch {
		return null;
	}
	// Case-insensitive host compare. Hosts in URL objects are already lowercased,
	// but be explicit for clarity.
	return parsed.hostname.toLowerCase() === eventUrl.hostname.toLowerCase();
}

/**
 * Build the sanitized DiagnosticFacts for a request. Pure: no I/O, no logging.
 */
export function diagnose(event: DiagnoseEventLike): DiagnosticFacts {
	const headers = event.request.headers;

	const authorization = headers.get('authorization');
	const testAuthorization = headers.get('x-test-authorization');
	const probeId = headers.get('x-test-probe-id');
	const expectedProbeId = headers.get('x-test-expected-probe-id');
	const hostHeader = headers.get('host');
	const xMsOriginalUrl = headers.get('x-ms-original-url');

	const authorizationScheme = extractAuthScheme(authorization);
	const testAuthorizationScheme = extractAuthScheme(testAuthorization);

	return {
		method: event.request.method,
		requestUrlProtocol: event.url.protocol,
		requestUrlHostKind: classifyHostKind(event.url),
		requestUrlPathname: event.url.pathname,

		authorizationPresent: authorization != null,
		testAuthorizationPresent: testAuthorization != null,
		authorizationScheme,
		testAuthorizationScheme,
		authorizationLooksBearer: authorizationScheme === 'bearer',
		testAuthorizationLooksBearer: testAuthorizationScheme === 'bearer',
		authorizationEqualsTestAuthorization: safeEquals(authorization, testAuthorization),

		testProbeIdPresent: probeId != null,
		testProbeIdMatchesExpected: safeEquals(probeId, expectedProbeId),

		hostPresent: hostHeader != null,
		hostLooksInternalAzureFunctionsHost: hostLooksInternal(hostHeader),
		xMsOriginalUrlPresent: xMsOriginalUrl != null,
		xMsOriginalUrlLooksAbsolute: xMsOriginalUrl != null && ABSOLUTE_URL_REGEX.test(xMsOriginalUrl),
		xMsOriginalUrlHostEqualsUrlHost: compareXMsOriginalUrlHost(xMsOriginalUrl, event.url),
		xForwardedHostPresent: headers.get('x-forwarded-host') != null,
		xForwardedProtoPresent: headers.get('x-forwarded-proto') != null,
		xForwardedForPresent: headers.get('x-forwarded-for') != null,
		xMsClientPrincipalPresent: headers.get('x-ms-client-principal') != null,

		timestamp: new Date().toISOString(),
		requestId: randomUUID()
	};
}

/**
 * Serialize DiagnosticFacts as `x-diag-<kebab-case-key>` headers for the HEAD
 * delivery channel. Booleans → `"true"`/`"false"`; nulls → `"null"`; strings
 * passed through (already constrained to closed enums or short non-secret
 * tokens by `diagnose`).
 *
 * Values are bounded in size by the type system (longest is `requestId` at
 * 36 chars), so total response-header weight stays well under any reasonable
 * proxy limit.
 */
export function factsToDiagHeaders(facts: DiagnosticFacts): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [key, value] of Object.entries(facts)) {
		out[`x-diag-${camelToKebab(key)}`] = encodeFactValue(value);
	}
	return out;
}

function encodeFactValue(value: unknown): string {
	if (value === null) return 'null';
	if (value === true) return 'true';
	if (value === false) return 'false';
	return String(value);
}

function camelToKebab(name: string): string {
	return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
