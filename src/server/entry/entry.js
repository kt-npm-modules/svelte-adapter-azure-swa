import { app } from '@azure/functions';
import { installPolyfills } from '@sveltejs/kit/node/polyfills';
import { debug, testWorkarounds } from 'ENV';
import { manifest } from 'MANIFEST';
import { Server } from 'SERVER';
import {
	getClientIPFromHeaders,
	getClientPrincipalFromHeaders,
	splitCookiesFromHeaders
} from './headers';

installPolyfills();

const server = new Server(manifest);
const initialized = server.init({ env: process.env });

/**
 * @typedef {import('@azure/functions').InvocationContext} InvocationContext
 * @typedef {import('@azure/functions').HttpRequest} HttpRequest
 * @typedef {import('@azure/functions').HttpResponseInit} HttpResponseInit
 */

app.setup({
	enableHttpStream: true
});

app.http('sk_render', {
	methods: ['HEAD', 'GET', 'POST', 'DELETE', 'PUT', 'OPTIONS', 'PATCH'],
	/**
	 *
	 * @param {HttpRequest} httpRequest
	 * @param {InvocationContext} context
	 */
	handler: async (httpRequest, context) => {
		if (debug) {
			context.log(
				'Starting request',
				httpRequest.method,
				httpRequest.headers.get('x-ms-original-url')
			);
			context.log(`Request: ${JSON.stringify(httpRequest)}`);
		}

		/** @type {Record<string, any>} */
		const testWorkaroundsInfo = {};
		if (testWorkarounds && httpRequest.method === 'POST') {
			testWorkaroundsInfo.method = httpRequest.method;
			testWorkaroundsInfo.contentType = httpRequest.headers.get('content-type');
			testWorkaroundsInfo.contentLength = httpRequest.headers.get('content-length');
			testWorkaroundsInfo.hasBodyObject = httpRequest.body != null;
			testWorkaroundsInfo.emptyPostWorkaround = false;
		}

		const request = toRequest(httpRequest, testWorkaroundsInfo);

		const ipAddress = getClientIPFromHeaders(request.headers);
		const clientPrincipal = getClientPrincipalFromHeaders(request.headers, context);

		await initialized;
		const rendered = await server.respond(request, {
			getClientAddress() {
				return ipAddress;
			},
			platform: {
				user: httpRequest.user,
				clientPrincipal: clientPrincipal,
				context
			}
		});

		if (testWorkarounds && httpRequest.method === 'POST') {
			context.log('POST workaround probe', testWorkaroundsInfo);
			rendered.headers.set('x-adapter-test-workarounds', JSON.stringify(testWorkaroundsInfo));
		}

		if (debug) {
			/** @type {Record<string, string>} */
			const headers = {};
			rendered.headers.forEach((value, key) => {
				headers[key] = value;
			});
			context.log(`SK headers: ${JSON.stringify(headers)}`);
			context.log(`Response: ${JSON.stringify(rendered)}`);
		}

		return toResponseInit(rendered);
	}
});

/**
 * @param {HttpRequest} httpRequest
 * @param {Record<string, any>} testWorkaroundsInfo
 * @returns {Request}
 */
function toRequest(httpRequest, testWorkaroundsInfo) {
	// because we proxy all requests to the render function, the original URL in the request is /api/sk_render
	// this header contains the URL the user requested
	const originalUrl = httpRequest.headers.get('x-ms-original-url');

	// SWA strips content-type headers from empty POST requests, but SK form actions require the header
	// https://github.com/geoffrich/svelte-adapter-azure-swa/issues/178
	if (
		httpRequest.method === 'POST' &&
		!httpRequest.body &&
		!httpRequest.headers.get('content-type')
	) {
		httpRequest.headers.set('content-type', 'application/x-www-form-urlencoded');
		if (testWorkarounds) {
			testWorkaroundsInfo.emptyPostWorkaround = true;
		}
	}

	/** @type {Record<string, string>} */
	const headers = {};
	httpRequest.headers.forEach((value, key) => {
		if (key !== 'x-ms-original-url') {
			headers[key] = value;
		}
	});

	return new Request(originalUrl, {
		method: httpRequest.method,
		headers: new Headers(headers),
		body: httpRequest.body,
		// This error is shown in vscode but check and lint work fine
		duplex: 'half'
	});
}

/**
 * @param {Response} rendered
 * @returns {HttpResponseInit}
 */
function toResponseInit(rendered) {
	const { headers, cookies } = splitCookiesFromHeaders(rendered.headers);

	return {
		status: rendered.status,
		// This error is shown in vscode but check and lint work fine
		body: rendered.body,
		// This error is shown in vscode but check and lint work fine
		headers,
		cookies,
		enableContentNegotiation: false
	};
}
