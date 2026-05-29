import { describe, expect, it } from 'vitest';
import {
	type DiagnoseEventLike,
	diagnose,
	extractAuthScheme,
	factsToDiagHeaders
} from './diagnose';

function buildEvent(
	rawHeaders: Record<string, string>,
	url = 'https://example.com/diagnostic-headers',
	method = 'GET'
): DiagnoseEventLike {
	const headers = new Headers();
	for (const [k, v] of Object.entries(rawHeaders)) headers.set(k, v);
	return { request: { method, headers }, url: new URL(url) };
}

describe('extractAuthScheme — fail-closed scheme extraction (Decision 14)', () => {
	it('returns "bearer" for a well-formed Bearer header', () => {
		expect(extractAuthScheme('Bearer abc.def.ghi')).toBe('bearer');
	});

	it('returns "basic" for a well-formed Basic header', () => {
		expect(extractAuthScheme('Basic dXNlcjpwYXNz')).toBe('basic');
	});

	it('returns "bearer" for a lowercased scheme', () => {
		expect(extractAuthScheme('bearer abc')).toBe('bearer');
	});

	it('returns "digest" for a Digest header', () => {
		expect(extractAuthScheme('Digest username="alice"')).toBe('digest');
	});

	it('returns null for a malformed value with no whitespace (the canonical leak case)', () => {
		expect(extractAuthScheme('SECRET_WITHOUT_SCHEME')).toBeNull();
	});

	it('returns null for a value that is just a scheme name with no credential', () => {
		expect(extractAuthScheme('Bearer ')).toBeNull();
	});

	it('returns null for a value with leading whitespace before the scheme', () => {
		expect(extractAuthScheme('   Bearer abc')).toBeNull();
	});

	it('returns null for a scheme token longer than 16 characters', () => {
		expect(extractAuthScheme('MyVeryLongCustomSchemeName abc')).toBeNull();
	});

	it('returns null when the token contains characters outside the scheme alphabet', () => {
		// `:` is not in [A-Za-z0-9+\-.]
		expect(extractAuthScheme('Foo:bar abc')).toBeNull();
	});

	it('returns null for a null/absent header', () => {
		expect(extractAuthScheme(null)).toBeNull();
	});

	it('returns null for an empty string', () => {
		expect(extractAuthScheme('')).toBeNull();
	});
});

describe('diagnose — sanitized facts only (no raw secrets ever)', () => {
	it('reports the request method verbatim', () => {
		for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const) {
			const facts = diagnose(buildEvent({}, 'https://example.com/diagnostic-headers', method));
			expect(facts.method).toBe(method);
		}
	});

	it('classifies an internal Azure Functions host', () => {
		const facts = diagnose(buildEvent({}, 'https://abc-def.azurewebsites.net/x'));
		expect(facts.requestUrlHostKind).toBe('internal-azure-functions');
	});

	it('classifies a public host', () => {
		const facts = diagnose(buildEvent({}, 'https://example.com/x'));
		expect(facts.requestUrlHostKind).toBe('public');
	});

	it('classifies localhost', () => {
		const facts = diagnose(buildEvent({}, 'http://localhost/x'));
		expect(facts.requestUrlHostKind).toBe('localhost');
	});

	it('classifies 127.0.0.1 as localhost', () => {
		const facts = diagnose(buildEvent({}, 'http://127.0.0.1/x'));
		expect(facts.requestUrlHostKind).toBe('localhost');
	});

	it('does NOT echo the URL host or query string', () => {
		const facts = diagnose(
			buildEvent({}, 'https://abc-secret-deployment-id.azurewebsites.net/x?token=leak')
		);
		const serialized = JSON.stringify(facts);
		expect(serialized).not.toContain('abc-secret-deployment-id');
		expect(serialized).not.toContain('token=leak');
		expect(serialized).not.toContain('?token');
		expect(facts.requestUrlPathname).toBe('/x');
	});

	it('emits "preserved"-shaped facts when Authorization equals x-test-authorization', () => {
		const bearer = 'Bearer abc-def-ghi-secret';
		const facts = diagnose(buildEvent({ authorization: bearer, 'x-test-authorization': bearer }));
		expect(facts.authorizationPresent).toBe(true);
		expect(facts.testAuthorizationPresent).toBe(true);
		expect(facts.authorizationEqualsTestAuthorization).toBe(true);
		expect(facts.authorizationLooksBearer).toBe(true);
		expect(facts.testAuthorizationLooksBearer).toBe(true);
	});

	it('emits "overwritten"-shaped facts when Authorization differs from x-test-authorization', () => {
		const facts = diagnose(
			buildEvent({
				authorization: 'Bearer something-else',
				'x-test-authorization': 'Bearer original'
			})
		);
		expect(facts.authorizationPresent).toBe(true);
		expect(facts.testAuthorizationPresent).toBe(true);
		expect(facts.authorizationEqualsTestAuthorization).toBe(false);
	});

	it('emits "stripped"-shaped facts when Authorization absent but x-test-authorization present', () => {
		const facts = diagnose(buildEvent({ 'x-test-authorization': 'Bearer original' }));
		expect(facts.authorizationPresent).toBe(false);
		expect(facts.testAuthorizationPresent).toBe(true);
		expect(facts.authorizationEqualsTestAuthorization).toBeNull();
	});

	it('emits "custom-headers-not-reaching-app"-shaped facts when x-test-authorization absent', () => {
		const facts = diagnose(buildEvent({ authorization: 'Bearer something' }));
		expect(facts.testAuthorizationPresent).toBe(false);
		expect(facts.authorizationEqualsTestAuthorization).toBeNull();
	});

	it('reports probe-id match without leaking the probe id', () => {
		const probeId = 'fc8b1234-5678-90ab-cdef-1234567890ab';
		const facts = diagnose(
			buildEvent({ 'x-test-probe-id': probeId, 'x-test-expected-probe-id': probeId })
		);
		expect(facts.testProbeIdPresent).toBe(true);
		expect(facts.testProbeIdMatchesExpected).toBe(true);
		expect(JSON.stringify(facts)).not.toContain(probeId);
	});

	it('reports probe-id mismatch as false', () => {
		const facts = diagnose(
			buildEvent({
				'x-test-probe-id': 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
				'x-test-expected-probe-id': 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
			})
		);
		expect(facts.testProbeIdPresent).toBe(true);
		expect(facts.testProbeIdMatchesExpected).toBe(false);
	});

	it('reports null when the expected probe id is absent', () => {
		const facts = diagnose(buildEvent({ 'x-test-probe-id': 'abc' }));
		expect(facts.testProbeIdPresent).toBe(true);
		expect(facts.testProbeIdMatchesExpected).toBeNull();
	});

	it('classifies the host header as internal Azure Functions when applicable', () => {
		const facts = diagnose(buildEvent({ host: 'abc-def-1234.azurewebsites.net:443' }));
		expect(facts.hostPresent).toBe(true);
		expect(facts.hostLooksInternalAzureFunctionsHost).toBe(true);
	});

	it('emits xMsOriginalUrl host-equals boolean only', () => {
		const facts = diagnose(
			buildEvent(
				{ 'x-ms-original-url': 'https://example.com/some/path' },
				'https://example.com/diagnostic-headers'
			)
		);
		expect(facts.xMsOriginalUrlPresent).toBe(true);
		expect(facts.xMsOriginalUrlLooksAbsolute).toBe(true);
		expect(facts.xMsOriginalUrlHostEqualsUrlHost).toBe(true);
		// Raw URL must not appear anywhere.
		expect(JSON.stringify(facts)).not.toContain('/some/path');
	});

	it('emits xMsOriginalUrlHostEqualsUrlHost === false when hosts differ', () => {
		const facts = diagnose(
			buildEvent(
				{ 'x-ms-original-url': 'https://attacker.example/x' },
				'https://example.com/diagnostic-headers'
			)
		);
		expect(facts.xMsOriginalUrlHostEqualsUrlHost).toBe(false);
	});

	it('emits xMsOriginalUrlHostEqualsUrlHost === null when value is unparseable', () => {
		const facts = diagnose(buildEvent({ 'x-ms-original-url': 'not-a-url' }));
		expect(facts.xMsOriginalUrlHostEqualsUrlHost).toBeNull();
		expect(facts.xMsOriginalUrlLooksAbsolute).toBe(false);
	});

	it('reports forwarded-header presence booleans only', () => {
		const facts = diagnose(
			buildEvent({
				'x-forwarded-host': 'evil.example',
				'x-forwarded-proto': 'gopher',
				'x-forwarded-for': '203.0.113.7',
				'x-ms-client-principal': 'eyJzZWNyZXQiOiJ2YWx1ZSJ9'
			})
		);
		expect(facts.xForwardedHostPresent).toBe(true);
		expect(facts.xForwardedProtoPresent).toBe(true);
		expect(facts.xForwardedForPresent).toBe(true);
		expect(facts.xMsClientPrincipalPresent).toBe(true);
		const serialized = JSON.stringify(facts);
		// None of the raw values may appear.
		expect(serialized).not.toContain('evil.example');
		expect(serialized).not.toContain('gopher');
		expect(serialized).not.toContain('203.0.113.7');
		expect(serialized).not.toContain('eyJzZWNyZXQiOiJ2YWx1ZSJ9');
	});

	it('regression — cookie / authorization values never appear in the serialized facts', () => {
		const cookie = 'session=verysecretcookie; another=alsosecret';
		const bearer = 'Bearer ' + 'X'.repeat(64);
		const facts = diagnose(
			buildEvent({
				cookie,
				authorization: bearer,
				'x-test-authorization': bearer,
				'x-ms-client-principal': 'principal-blob'
			})
		);
		const serialized = JSON.stringify(facts);
		expect(serialized).not.toContain('verysecretcookie');
		expect(serialized).not.toContain('alsosecret');
		expect(serialized).not.toContain('X'.repeat(16));
		expect(serialized).not.toContain('principal-blob');
		// The scheme token "bearer" is allowed — that's the closed-enum signal.
		expect(facts.authorizationScheme).toBe('bearer');
	});

	it('does NOT extract a scheme from a malformed Authorization-like value', () => {
		const facts = diagnose(buildEvent({ authorization: 'SECRET_WITHOUT_SCHEME' }));
		expect(facts.authorizationPresent).toBe(true);
		expect(facts.authorizationScheme).toBeNull();
		expect(facts.authorizationLooksBearer).toBe(false);
		// Crucially, no substring of the raw value leaks via the scheme field.
		expect(JSON.stringify(facts)).not.toContain('SECRET');
	});

	it('produces a fresh requestId each call', () => {
		const a = diagnose(buildEvent({}));
		const b = diagnose(buildEvent({}));
		expect(a.requestId).not.toBe(b.requestId);
		expect(a.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
	});

	it('produces an ISO-8601 timestamp', () => {
		const facts = diagnose(buildEvent({}));
		expect(facts.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
	});
});

describe('factsToDiagHeaders — HEAD-channel serialization', () => {
	it('emits one x-diag-* header per fact field with kebab-case keys', () => {
		const facts = diagnose(
			buildEvent(
				{
					authorization: 'Bearer xxx',
					'x-test-authorization': 'Bearer xxx',
					'x-test-probe-id': 'pid',
					'x-test-expected-probe-id': 'pid'
				},
				'https://example.com/diagnostic-headers',
				'HEAD'
			)
		);
		const headers = factsToDiagHeaders(facts);
		expect(headers['x-diag-method']).toBe('HEAD');
		expect(headers['x-diag-authorization-present']).toBe('true');
		expect(headers['x-diag-test-authorization-present']).toBe('true');
		expect(headers['x-diag-authorization-equals-test-authorization']).toBe('true');
		expect(headers['x-diag-authorization-scheme']).toBe('bearer');
		expect(headers['x-diag-authorization-looks-bearer']).toBe('true');
		expect(headers['x-diag-test-probe-id-matches-expected']).toBe('true');
		expect(headers['x-diag-request-url-host-kind']).toBe('public');
		expect(headers['x-diag-request-url-pathname']).toBe('/diagnostic-headers');
	});

	it('encodes null-valued fields as the literal string "null"', () => {
		const facts = diagnose(buildEvent({}));
		const headers = factsToDiagHeaders(facts);
		expect(headers['x-diag-authorization-scheme']).toBe('null');
		expect(headers['x-diag-authorization-equals-test-authorization']).toBe('null');
		expect(headers['x-diag-x-ms-original-url-host-equals-url-host']).toBe('null');
	});

	it('encodes booleans as the literal strings "true" / "false"', () => {
		const facts = diagnose(buildEvent({}));
		const headers = factsToDiagHeaders(facts);
		expect(headers['x-diag-authorization-present']).toBe('false');
		expect(headers['x-diag-host-looks-internal-azure-functions-host']).toBe('false');
	});

	it('serializes every key — total count matches DiagnosticFacts shape', () => {
		const facts = diagnose(buildEvent({}));
		const headers = factsToDiagHeaders(facts);
		expect(Object.keys(headers).length).toBe(Object.keys(facts).length);
	});

	it('every header name starts with x-diag-', () => {
		const facts = diagnose(buildEvent({}));
		const headers = factsToDiagHeaders(facts);
		for (const name of Object.keys(headers)) expect(name.startsWith('x-diag-')).toBe(true);
	});
});
