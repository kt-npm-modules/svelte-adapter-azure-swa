import { installPolyfills } from '@sveltejs/kit/node/polyfills';
import { describe, expect, test } from 'vitest';
import { buildDownstreamHeaders } from '../../src/server/entry/copy-headers.js';

installPolyfills();

/**
 * Build a minimal `HttpRequest`-shaped object the helper accepts. The `headers`
 * is a real `Headers` instance so the helper exercises the same `forEach`/`get`
 * semantics it would see in the runtime.
 *
 * @param {{ method: string, headers?: Record<string, string>, body?: unknown }} init
 */
function fakeHttpRequest(init) {
	const headers = new Headers();
	for (const [key, value] of Object.entries(init.headers ?? {})) {
		headers.set(key, value);
	}
	return {
		method: init.method,
		headers,
		body: init.body
	};
}

describe('buildDownstreamHeaders — Authorization strip / preserve policy', () => {
	test('default behaviour (preserveAuthorization: false) strips Authorization', () => {
		const httpRequest = fakeHttpRequest({
			method: 'GET',
			headers: { Authorization: 'Bearer foo' }
		});
		const { downstreamHeaders } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: false,
			testWorkarounds: false
		});
		// Build the downstream Headers so we can assert with case-insensitive `.get`.
		const headers = new Headers(downstreamHeaders);
		expect(headers.get('authorization')).toBeNull();
	});

	test('explicit preserveAuthorization: false strips Authorization', () => {
		const httpRequest = fakeHttpRequest({
			method: 'POST',
			headers: { Authorization: 'Bearer foo' }
		});
		const { downstreamHeaders } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: false,
			testWorkarounds: false
		});
		const headers = new Headers(downstreamHeaders);
		expect(headers.get('authorization')).toBeNull();
	});

	test('preserveAuthorization: true forwards Authorization byte-for-byte', () => {
		const httpRequest = fakeHttpRequest({
			method: 'GET',
			headers: { Authorization: 'Bearer foo' }
		});
		const { downstreamHeaders } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: true,
			testWorkarounds: false
		});
		const headers = new Headers(downstreamHeaders);
		expect(headers.get('authorization')).toBe('Bearer foo');
	});

	test('Authorization is not relocated to any other header on strip', () => {
		const httpRequest = fakeHttpRequest({
			method: 'GET',
			headers: { Authorization: 'Bearer foo' }
		});
		const { downstreamHeaders } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: false,
			testWorkarounds: false
		});
		// The stripped value MUST NOT reappear under any other header.
		for (const [, value] of Object.entries(downstreamHeaders)) {
			expect(value).not.toContain('Bearer foo');
		}
	});

	test('unrelated headers are preserved on strip', () => {
		const httpRequest = fakeHttpRequest({
			method: 'POST',
			headers: {
				Authorization: 'Bearer foo',
				'Content-Type': 'application/json',
				'X-Custom': 'bar'
			}
		});
		const { downstreamHeaders } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: false,
			testWorkarounds: false
		});
		const headers = new Headers(downstreamHeaders);
		expect(headers.get('content-type')).toBe('application/json');
		expect(headers.get('x-custom')).toBe('bar');
		expect(headers.get('authorization')).toBeNull();
	});

	test('strip applies on every adapter-supported HTTP method', () => {
		for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
			const httpRequest = fakeHttpRequest({
				method,
				headers: { Authorization: 'Bearer foo' }
			});
			const { downstreamHeaders } = buildDownstreamHeaders(httpRequest, {
				preserveAuthorization: false,
				testWorkarounds: false
			});
			const headers = new Headers(downstreamHeaders);
			expect(headers.get('authorization')).toBeNull();
		}
	});
});

describe('buildDownstreamHeaders — case-insensitive Authorization match', () => {
	test('strip works regardless of inbound key casing', () => {
		// The Headers iterator already normalizes to lowercase, but the helper
		// MUST NOT depend on that — assert by injecting our own casing via a
		// fake headers object that exposes the same shape.
		for (const key of ['Authorization', 'AUTHORIZATION', 'aUtHoRiZaTiOn']) {
			const fakeHeaders = makeRawCaseHeaders({ [key]: 'Bearer foo' });
			const httpRequest = { method: 'GET', headers: fakeHeaders, body: undefined };
			const { downstreamHeaders } = buildDownstreamHeaders(httpRequest, {
				preserveAuthorization: false,
				testWorkarounds: false
			});
			// downstreamHeaders is a plain Record — verify no key (any case)
			// ended up containing the bearer.
			for (const [, value] of Object.entries(downstreamHeaders)) {
				expect(value).not.toBe('Bearer foo');
			}
		}
	});
});

/**
 * Build a fake `Headers`-like object that preserves the original key casing
 * when iterated, so the case-insensitive strip test exercises a non-lowercase
 * iterator. Mirrors only the surface the helper uses: `get`, `set`, `forEach`.
 *
 * @param {Record<string, string>} init
 */
function makeRawCaseHeaders(init) {
	/** @type {Map<string, [string, string]>} */
	const map = new Map();
	for (const [key, value] of Object.entries(init)) {
		map.set(key.toLowerCase(), [key, value]);
	}
	return {
		/** @param {string} key */
		get(key) {
			const entry = map.get(key.toLowerCase());
			return entry ? entry[1] : null;
		},
		/**
		 * @param {string} key
		 * @param {string} value
		 */
		set(key, value) {
			map.set(key.toLowerCase(), [key, value]);
		},
		/** @param {(value: string, key: string) => void} cb */
		forEach(cb) {
			for (const [, [origKey, value]] of map) {
				cb(value, origKey);
			}
		}
	};
}

describe('buildDownstreamHeaders — x-ms-original-url exclusion', () => {
	test('x-ms-original-url is excluded from the returned downstream headers', () => {
		const httpRequest = fakeHttpRequest({
			method: 'GET',
			headers: { 'x-ms-original-url': 'https://example.com/foo?q=1' }
		});
		const { downstreamHeaders } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: false,
			testWorkarounds: false
		});
		const headers = new Headers(downstreamHeaders);
		expect(headers.get('x-ms-original-url')).toBeNull();
	});
});

describe('buildDownstreamHeaders — empty-POST-form workaround (regression)', () => {
	test('applies content-type and reports emptyPostWorkaround=true on the heuristic match', () => {
		const httpRequest = fakeHttpRequest({
			method: 'POST',
			headers: {
				'content-length': '0',
				'sec-fetch-mode': 'navigate',
				'sec-fetch-dest': 'document'
			}
		});
		const { downstreamHeaders, testWorkaroundsInfo, emptyPostFormContentTypeApplied } =
			buildDownstreamHeaders(httpRequest, {
				preserveAuthorization: false,
				testWorkarounds: true
			});
		expect(emptyPostFormContentTypeApplied).toBe(true);
		// Downstream headers reflect the applied workaround value.
		const headers = new Headers(downstreamHeaders);
		expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');
		// Diagnostic facts capture the RAW inbound state (before the helper
		// mutated `httpRequest.headers`), so contentType is null here even
		// though downstreamHeaders carry the workaround value.
		expect(testWorkaroundsInfo?.emptyFormContentTypeStrip).toEqual({
			method: 'POST',
			contentType: null,
			contentLength: '0',
			hasBodyObject: false,
			emptyPostWorkaround: true
		});
	});

	test('does not apply when the heuristic does not match', () => {
		const httpRequest = fakeHttpRequest({
			method: 'POST',
			headers: { 'content-type': 'application/json', 'content-length': '13' },
			body: '{"foo":"bar"}'
		});
		const { testWorkaroundsInfo, emptyPostFormContentTypeApplied } = buildDownstreamHeaders(
			httpRequest,
			{ preserveAuthorization: false, testWorkarounds: true }
		);
		expect(emptyPostFormContentTypeApplied).toBe(false);
		expect(testWorkaroundsInfo?.emptyFormContentTypeStrip?.emptyPostWorkaround).toBe(false);
	});
});

describe('buildDownstreamHeaders — testWorkaroundsInfo nesting', () => {
	test('empty-form facts are nested under emptyFormContentTypeStrip; auth facts under auth', () => {
		const httpRequest = fakeHttpRequest({
			method: 'POST',
			headers: {
				'content-length': '0',
				'sec-fetch-mode': 'navigate',
				'sec-fetch-dest': 'document',
				Authorization: 'Bearer foo',
				'x-test-workaround-authorization': 'Bearer foo'
			}
		});
		const { testWorkaroundsInfo } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: false,
			testWorkarounds: true
		});
		expect(testWorkaroundsInfo).not.toBeNull();
		expect(testWorkaroundsInfo?.emptyFormContentTypeStrip).toBeDefined();
		expect(testWorkaroundsInfo?.auth).toBeDefined();
		// Legacy flat keys MUST NOT appear at the top level.
		expect(testWorkaroundsInfo).not.toHaveProperty('method');
		expect(testWorkaroundsInfo).not.toHaveProperty('emptyPostWorkaround');
		expect(testWorkaroundsInfo).not.toHaveProperty('contentType');
		expect(testWorkaroundsInfo).not.toHaveProperty('contentLength');
		expect(testWorkaroundsInfo).not.toHaveProperty('hasBodyObject');
		expect(testWorkaroundsInfo).not.toHaveProperty('rawAuthorizationPresent');
	});

	test('returns null when testWorkarounds is false', () => {
		const httpRequest = fakeHttpRequest({
			method: 'GET',
			headers: { Authorization: 'Bearer foo' }
		});
		const { testWorkaroundsInfo } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: false,
			testWorkarounds: false
		});
		expect(testWorkaroundsInfo).toBeNull();
	});

	test('auth namespace is emitted on every adapter-supported method', () => {
		for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
			const httpRequest = fakeHttpRequest({
				method,
				headers: { Authorization: 'Bearer foo' }
			});
			const { testWorkaroundsInfo } = buildDownstreamHeaders(httpRequest, {
				preserveAuthorization: false,
				testWorkarounds: true
			});
			expect(testWorkaroundsInfo?.auth).toBeDefined();
		}
	});

	test('empty-form namespace is omitted on non-POST requests even when testWorkarounds is true', () => {
		for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
			const httpRequest = fakeHttpRequest({ method });
			const { testWorkaroundsInfo } = buildDownstreamHeaders(httpRequest, {
				preserveAuthorization: false,
				testWorkarounds: true
			});
			expect(testWorkaroundsInfo?.emptyFormContentTypeStrip).toBeUndefined();
		}
	});
});

describe('buildDownstreamHeaders — auth namespace semantics', () => {
	test('rawAuthorizationEqualsTestWorkaroundAuthorization is null when test header missing', () => {
		const httpRequest = fakeHttpRequest({
			method: 'GET',
			headers: { Authorization: 'Bearer foo' }
		});
		const { testWorkaroundsInfo } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: false,
			testWorkarounds: true
		});
		expect(testWorkaroundsInfo?.auth).toEqual({
			rawAuthorizationPresent: true,
			testWorkaroundAuthorizationPresent: false,
			rawAuthorizationEqualsTestWorkaroundAuthorization: null,
			authorizationStripped: true
		});
	});

	test('rawAuthorizationEqualsTestWorkaroundAuthorization is true when both present and equal', () => {
		const httpRequest = fakeHttpRequest({
			method: 'GET',
			headers: {
				Authorization: 'Bearer foo',
				'x-test-workaround-authorization': 'Bearer foo'
			}
		});
		const { testWorkaroundsInfo } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: false,
			testWorkarounds: true
		});
		expect(testWorkaroundsInfo?.auth?.rawAuthorizationEqualsTestWorkaroundAuthorization).toBe(true);
	});

	test('rawAuthorizationEqualsTestWorkaroundAuthorization is false when both present and different', () => {
		const httpRequest = fakeHttpRequest({
			method: 'GET',
			headers: {
				Authorization: 'Bearer azure-injected',
				'x-test-workaround-authorization': 'Bearer client-sent'
			}
		});
		const { testWorkaroundsInfo } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: false,
			testWorkarounds: true
		});
		expect(testWorkaroundsInfo?.auth?.rawAuthorizationEqualsTestWorkaroundAuthorization).toBe(
			false
		);
	});

	test('rawAuthorizationEqualsTestWorkaroundAuthorization is null when raw Authorization absent', () => {
		const httpRequest = fakeHttpRequest({
			method: 'GET',
			headers: { 'x-test-workaround-authorization': 'Bearer client-sent' }
		});
		const { testWorkaroundsInfo } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: false,
			testWorkarounds: true
		});
		expect(testWorkaroundsInfo?.auth).toEqual({
			rawAuthorizationPresent: false,
			testWorkaroundAuthorizationPresent: true,
			rawAuthorizationEqualsTestWorkaroundAuthorization: null,
			authorizationStripped: false
		});
	});

	test('authorizationStripped is true when raw present and preserveAuthorization is false', () => {
		const httpRequest = fakeHttpRequest({
			method: 'GET',
			headers: { Authorization: 'Bearer foo' }
		});
		const { testWorkaroundsInfo } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: false,
			testWorkarounds: true
		});
		expect(testWorkaroundsInfo?.auth?.authorizationStripped).toBe(true);
	});

	test('authorizationStripped is false when raw present but preserveAuthorization is true', () => {
		const httpRequest = fakeHttpRequest({
			method: 'GET',
			headers: { Authorization: 'Bearer foo' }
		});
		const { testWorkaroundsInfo } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: true,
			testWorkarounds: true
		});
		expect(testWorkaroundsInfo?.auth?.authorizationStripped).toBe(false);
	});

	test('authorizationStripped is false when raw absent regardless of policy', () => {
		for (const preserveAuthorization of [false, true]) {
			const httpRequest = fakeHttpRequest({ method: 'GET' });
			const { testWorkaroundsInfo } = buildDownstreamHeaders(httpRequest, {
				preserveAuthorization,
				testWorkarounds: true
			});
			expect(testWorkaroundsInfo?.auth?.authorizationStripped).toBe(false);
		}
	});

	test('auth namespace contains only booleans and the tri-state — no raw values', () => {
		const httpRequest = fakeHttpRequest({
			method: 'GET',
			headers: {
				Authorization: 'Bearer azure-bearer-12345',
				'x-test-workaround-authorization': 'Bearer client-bearer-67890'
			}
		});
		const { testWorkaroundsInfo } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: false,
			testWorkarounds: true
		});
		const serialized = JSON.stringify(testWorkaroundsInfo);
		expect(serialized).not.toContain('azure-bearer-12345');
		expect(serialized).not.toContain('client-bearer-67890');
	});

	test('auth namespace reflects PRE-strip state even though Authorization is dropped downstream', () => {
		const httpRequest = fakeHttpRequest({
			method: 'GET',
			headers: { Authorization: 'Bearer foo' }
		});
		const { downstreamHeaders, testWorkaroundsInfo } = buildDownstreamHeaders(httpRequest, {
			preserveAuthorization: false,
			testWorkarounds: true
		});
		const headers = new Headers(downstreamHeaders);
		expect(headers.get('authorization')).toBeNull();
		expect(testWorkaroundsInfo?.auth?.rawAuthorizationPresent).toBe(true);
		expect(testWorkaroundsInfo?.auth?.authorizationStripped).toBe(true);
	});
});
