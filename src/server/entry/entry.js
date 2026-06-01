import { app } from '@azure/functions';
import { installPolyfills } from '@sveltejs/kit/node/polyfills';
import { debug, preserveAuthorization, testWorkarounds } from 'ENV';
import { manifest } from 'MANIFEST';
import { Server } from 'SERVER';
import { buildDownstreamHeaders } from './copy-headers.js';
import {
	getClientIPFromHeaders,
	getClientPrincipalFromHeaders,
	splitCookiesFromHeaders
} from './headers.js';

installPolyfills();

const server = new Server(manifest);
const initialized = server.init({ env: process.env });

/**
 * @typedef {import('@azure/functions').InvocationContext} InvocationContext
 * @typedef {import('@azure/functions').HttpRequest} HttpRequest
 * @typedef {import('@azure/functions').HttpResponseInit} HttpResponseInit
 * @typedef {import('./copy-headers.js').AdapterTestWorkaroundsInfo} AdapterTestWorkaroundsInfo
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

		const request = toRequest(httpRequest);

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

		if (testWorkarounds) {
			const workaroundHeaderStr = request.headers.get('x-adapter-test-workarounds');
			if (workaroundHeaderStr) {
				if (httpRequest.method === 'POST') {
					context.log('POST workaround probe', workaroundHeaderStr);
				}
				rendered.headers.set('x-adapter-test-workarounds', workaroundHeaderStr);
			}
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
 * @returns {Request}
 */
function toRequest(httpRequest) {
	// because we proxy all requests to the render function, the original URL in the request is /api/sk_render
	// this header contains the URL the user requested
	const originalUrl = httpRequest.headers.get('x-ms-original-url');

	const { downstreamHeaders, testWorkaroundsInfo } = buildDownstreamHeaders(httpRequest, {
		preserveAuthorization,
		testWorkarounds
	});

	const headers = new Headers(downstreamHeaders);

	// Mirror workaround diagnostics into the internal request so test actions
	// can inspect the request shape observed by the adapter. The empty-form
	// namespace is only present on POST requests; the auth namespace is
	// present on every method when testWorkarounds is enabled.
	if (testWorkaroundsInfo) {
		headers.set('x-adapter-test-workarounds', JSON.stringify(testWorkaroundsInfo));
	}

	return new Request(originalUrl, {
		method: httpRequest.method,
		headers,
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
