import * as set_cookie_parser from 'set-cookie-parser';

/**
 * @typedef {import('@azure/functions').Cookie} Cookie
 */

/**
 * Splits 'set-cookie' headers into individual cookies
 * @param {Headers} headers
 * @returns {{
 *   headers: Headers,
 *   cookies: Cookie[]
 * }}
 */
export function splitCookiesFromHeaders(headers) {
	/** @type {Record<string, string>} */
	const resHeaders = {};

	/** @type {Cookie[]} */
	const resCookies = [];

	headers.forEach((value, key) => {
		if (key === 'set-cookie') {
			const cookieStrings = set_cookie_parser.splitCookiesString(value);
			// @ts-expect-error - one cookie type has a stricter sameSite type
			resCookies.push(...set_cookie_parser.parse(cookieStrings));
		} else {
			resHeaders[key] = value;
		}
	});

	return { headers: new Headers(resHeaders), cookies: resCookies };
}

/**
 * Gets client IP from 'x-forwarded-for' header, ignoring socket and intermediate proxies.
 * @param {Headers} headers
 * @returns {string} Client IP
 */
export function getClientIPFromHeaders(headers) {
	/** @type {string} */
	const resHeader = headers.get('x-forwarded-for') ?? '127.0.0.1';
	const [origin] = resHeader.split(', ');
	const [ipAddress] = origin.split(':');

	return ipAddress;
}

/**
 * Gets the client principal from `x-ms-client-principal` header.
 * @param {Headers} headers
 * @param {import('@azure/functions').InvocationContext} context
 * @returns {App.Platform['clientPrincipal']} The client principal
 */
export function getClientPrincipalFromHeaders(headers, context) {
	// Code adapted from the official SWA documentation
	// https://learn.microsoft.com/en-us/azure/static-web-apps/user-information?tabs=javascript#api-functions
	const header = headers.get('x-ms-client-principal');
	if (!header) {
		return null;
	}

	try {
		const encoded = Buffer.from(header, 'base64');
		const decoded = encoded.toString('ascii');
		let clientPrincipal = JSON.parse(decoded);

		return clientPrincipal;
	} catch (e) {
		context.error('Unable to parse client principal', e);
		return null;
	}
}
