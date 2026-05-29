/**
 * Internal helper for building the downstream SvelteKit `Request` headers from
 * an inbound `@azure/functions` `HttpRequest.headers`-shaped value, and for
 * computing the adapter's test-workaround diagnostic facts.
 *
 * Deterministic: pure function, no I/O, no logging, no time. Unit-testable
 * directly without spinning up the rest of the adapter or the demo.
 *
 * Scope:
 *   - copy inbound headers EXCEPT `x-ms-original-url`
 *   - strip `Authorization` case-insensitively when `preserveAuthorization`
 *     is `false`; preserve it byte-for-byte when `true`
 *   - compute `AdapterTestWorkaroundsInfo.auth` from the raw inbound headers
 *     BEFORE stripping (when `testWorkarounds` is `true`)
 *   - apply the empty-POST-form content-type stripping workaround and record
 *     its facts under `AdapterTestWorkaroundsInfo.emptyFormContentTypeStrip`
 *     (when `testWorkarounds` is `true` and the empty-POST-form heuristic
 *     matches; the heuristic itself is unchanged from previous behaviour)
 *
 * Out of scope (kept in `entry.js`):
 *   - constructing the SvelteKit `Request.url` from `x-ms-original-url`
 *   - the response/header mirroring of the test-workaround payload
 */

/**
 * @typedef {object} EmptyFormContentTypeStripInfo
 * @property {string} method
 * @property {string|null} contentType
 * @property {string|null} contentLength
 * @property {boolean} hasBodyObject
 * @property {boolean} emptyPostWorkaround
 */

/**
 * @typedef {object} AuthWorkaroundInfo
 * @property {boolean} rawAuthorizationPresent
 * @property {boolean} testWorkaroundAuthorizationPresent
 * @property {boolean|null} rawAuthorizationEqualsTestWorkaroundAuthorization
 * @property {boolean} authorizationStripped
 */

/**
 * @typedef {object} AdapterTestWorkaroundsInfo
 * @property {EmptyFormContentTypeStripInfo=} emptyFormContentTypeStrip
 * @property {AuthWorkaroundInfo=} auth
 */

/**
 * Minimal `HttpRequest`-like shape the helper needs. Kept structural so unit
 * tests can pass plain objects without constructing a real `@azure/functions`
 * `HttpRequest`.
 *
 * @typedef {object} HttpRequestLike
 * @property {string} method
 * @property {Headers} headers
 * @property {unknown=} body
 */

/**
 * @typedef {object} CopyHeadersOptions
 * @property {boolean} preserveAuthorization Forward inbound `Authorization` byte-for-byte when `true`; strip when `false`.
 * @property {boolean} testWorkarounds Compute and emit the `AdapterTestWorkaroundsInfo` diagnostic facts when `true`.
 */

/**
 * @typedef {object} CopyHeadersResult
 * @property {Record<string, string>} downstreamHeaders Inbound headers minus `x-ms-original-url` (and minus `Authorization` when `preserveAuthorization` is `false`). Suitable for `new Headers(...)`.
 * @property {AdapterTestWorkaroundsInfo|null} testWorkaroundsInfo Diagnostic facts when `testWorkarounds` is `true`, otherwise `null`. The empty-form namespace is present only on POST requests that match the heuristic; the auth namespace is present on every method.
 * @property {boolean} emptyPostFormContentTypeApplied `true` iff the empty-POST-form heuristic matched and the helper set `Content-Type: application/x-www-form-urlencoded` on `httpRequest.headers` (mirrors the prior in-place mutation).
 */

const EMPTY_POST_FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

/**
 * Detect the empty-POST-form-navigation edge case where SWA strips `content-type`
 * but SvelteKit form actions still need it. This heuristic mirrors what
 * `entry.js` previously did inline.
 *
 * @param {HttpRequestLike} httpRequest
 */
function isEmptyPostFormNavigation(httpRequest) {
	return (
		httpRequest.method === 'POST' &&
		!httpRequest.headers.get('content-type') &&
		httpRequest.headers.get('content-length') === '0' &&
		httpRequest.headers.get('sec-fetch-mode') === 'navigate' &&
		httpRequest.headers.get('sec-fetch-dest') === 'document'
	);
}

/**
 * Build the downstream-headers map and the test-workaround diagnostic facts.
 *
 * The auth namespace is computed BEFORE stripping (so `rawAuthorizationPresent`
 * reflects the inbound state). The Authorization strip and the
 * `x-ms-original-url` exclusion happen as the headers are copied.
 *
 * The function may mutate `httpRequest.headers` to apply the empty-POST-form
 * content-type workaround — this matches the prior behaviour in `entry.js`
 * (where the workaround was applied to the source `httpRequest.headers`
 * before iterating). Callers can detect the mutation via
 * `result.emptyPostFormContentTypeApplied`.
 *
 * @param {HttpRequestLike} httpRequest
 * @param {CopyHeadersOptions} options
 * @returns {CopyHeadersResult}
 */
export function buildDownstreamHeaders(httpRequest, options) {
	const { preserveAuthorization, testWorkarounds } = options;

	/** @type {AdapterTestWorkaroundsInfo|null} */
	const testWorkaroundsInfo = testWorkarounds ? {} : null;

	// Compute the auth namespace BEFORE any mutation/strip — it must reflect
	// the raw inbound state.
	if (testWorkaroundsInfo) {
		const rawAuthorization = httpRequest.headers.get('authorization');
		const testWorkaroundAuthorization = httpRequest.headers.get('x-test-workaround-authorization');
		const rawAuthorizationPresent = rawAuthorization != null;
		const testWorkaroundAuthorizationPresent = testWorkaroundAuthorization != null;
		/** @type {boolean|null} */
		let rawAuthorizationEqualsTestWorkaroundAuthorization;
		if (!rawAuthorizationPresent || !testWorkaroundAuthorizationPresent) {
			rawAuthorizationEqualsTestWorkaroundAuthorization = null;
		} else {
			rawAuthorizationEqualsTestWorkaroundAuthorization =
				rawAuthorization === testWorkaroundAuthorization;
		}
		testWorkaroundsInfo.auth = {
			rawAuthorizationPresent,
			testWorkaroundAuthorizationPresent,
			rawAuthorizationEqualsTestWorkaroundAuthorization,
			authorizationStripped: rawAuthorizationPresent && !preserveAuthorization
		};
	}

	// SWA can strip the content-type header from empty POST requests, but
	// SvelteKit form actions require it. Capture the raw inbound empty-form
	// facts FIRST (so `contentType` reflects what came off the wire — `null`
	// in the SWA-strip case), then apply the workaround and mutate
	// `httpRequest.headers`, then set `emptyPostWorkaround = true` if the
	// heuristic matched. This preserves the previous diagnostic semantics
	// where `contentType` was captured before the mutation.
	if (testWorkaroundsInfo && httpRequest.method === 'POST') {
		testWorkaroundsInfo.emptyFormContentTypeStrip = {
			method: httpRequest.method,
			contentType: httpRequest.headers.get('content-type'),
			contentLength: httpRequest.headers.get('content-length'),
			hasBodyObject: httpRequest.body != null,
			emptyPostWorkaround: false
		};
	}

	const emptyPostFormApplies = isEmptyPostFormNavigation(httpRequest);
	if (emptyPostFormApplies) {
		httpRequest.headers.set('content-type', EMPTY_POST_FORM_CONTENT_TYPE);
		if (testWorkaroundsInfo?.emptyFormContentTypeStrip) {
			testWorkaroundsInfo.emptyFormContentTypeStrip.emptyPostWorkaround = true;
		}
	}

	// Copy inbound headers, excluding `x-ms-original-url` (consumed by entry.js
	// for `Request.url`) and `Authorization` under default policy.
	/** @type {Record<string, string>} */
	const downstreamHeaders = {};
	httpRequest.headers.forEach((value, key) => {
		if (key === 'x-ms-original-url') return;
		if (!preserveAuthorization && key.toLowerCase() === 'authorization') return;
		downstreamHeaders[key] = value;
	});

	return {
		downstreamHeaders,
		testWorkaroundsInfo,
		emptyPostFormContentTypeApplied: emptyPostFormApplies
	};
}
