import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sveltekit } from '@sveltejs/kit/vite';
import { createBuilder } from 'vite';
import adapter from '../../../src/index.js';

const instrumented = process.argv.includes('--instrumented');
const custom = process.argv.includes('--custom');
const apiDir = custom ? 'func' : 'build/server';
const staticDir = custom ? 'public-build' : 'build/static';
await mkdir('.tmp', { recursive: true });
const fixtureRoot = await mkdtemp(path.resolve('.tmp/kit3-build-'));
try {
	await mkdir(path.join(fixtureRoot, 'src/routes/probe'), { recursive: true });
	await writeFile(path.join(fixtureRoot, 'package.json'), JSON.stringify({ type: 'module' }));
	await writeFile(
		path.join(fixtureRoot, 'src/app.html'),
		'<!doctype html><html><head>%sveltekit.head%</head><body><div>%sveltekit.body%</div></body></html>'
	);
	await writeFile(
		path.join(fixtureRoot, 'src/env.js'),
		`import { defineEnvVars } from '@sveltejs/kit/env'; export const variables = defineEnvVars({ ADAPTER_TEST_ENV: { schema: value => value ?? 'unset' } });`
	);
	await writeFile(
		path.join(fixtureRoot, 'src/routes/probe/+server.js'),
		`import { ADAPTER_TEST_ENV } from '$app/env/private'; globalThis.adapterBuildEvents ??= []; globalThis.adapterBuildEvents.push('application'); export function GET({ url, getClientAddress, platform }) { return Response.json({ path: url.pathname, address: getClientAddress(), functionName: platform.context.functionName, token: ADAPTER_TEST_ENV, instrumentationToken: globalThis.adapterInstrumentationToken ?? null, events: globalThis.adapterBuildEvents }); }`
	);
	if (instrumented) {
		await writeFile(
			path.join(fixtureRoot, 'src/instrumentation.server.js'),
			`import { ADAPTER_TEST_ENV } from '$app/env/private'; globalThis.adapterBuildEvents ??= []; globalThis.adapterBuildEvents.push('instrumentation'); globalThis.adapterInstrumentationToken = ADAPTER_TEST_ENV;`
		);
	}
	if (custom) {
		await mkdir(path.join(fixtureRoot, apiDir, 'other-function'), { recursive: true });
		await writeFile(path.join(fixtureRoot, apiDir, 'other-function/index.js'), '// preserved');
		await mkdir(path.join(fixtureRoot, staticDir), { recursive: true });
		await writeFile(path.join(fixtureRoot, staticDir, 'stale.txt'), 'stale output');
	}
	process.chdir(fixtureRoot);
	const appBuilder = await createBuilder({
		root: fixtureRoot,
		configFile: false,
		logLevel: 'warn',
		// Avoid resolving Kit's cookie v2 imports to an unrelated older root transitive dependency.
		ssr: { noExternal: ['cookie'] },
		plugins: [
			sveltekit({
				appDir: 'assets',
				paths: { base: '/base' },
				adapter: adapter(custom ? { apiDir, staticDir } : {})
			})
		]
	});
	await appBuilder.buildApp();
	const config = JSON.parse(
		await readFile(path.join(staticDir, 'staticwebapp.config.json'), 'utf8')
	);
	assert.ok(config.routes.some((r) => r.route === '/base/assets/immutable/*'));
	if (custom) {
		assert.equal(
			await readFile(path.join(apiDir, 'other-function/index.js'), 'utf8'),
			'// preserved'
		);
		await assert.rejects(readFile(path.join(staticDir, 'stale.txt')), { code: 'ENOENT' });
	}
	const azureDir = path.join(fixtureRoot, 'node_modules/@azure/functions');
	await mkdir(azureDir, { recursive: true });
	await writeFile(
		path.join(azureDir, 'package.json'),
		JSON.stringify({ type: 'module', exports: './index.js' })
	);
	await writeFile(
		path.join(azureDir, 'index.js'),
		`export const registrations = new Map(); export const app = { setup(options) { if(!options.enableHttpStream) throw new Error('HTTP streaming disabled'); }, http(name, options) { registrations.set(name, options); } };`
	);
	process.env.ADAPTER_TEST_ENV = 'runtime-token';
	globalThis.adapterBuildEvents = [];
	await import(pathToFileURL(path.join(fixtureRoot, apiDir, 'sk_render/index.js')));
	const azure = await import(pathToFileURL(path.join(azureDir, 'index.js')));
	const registration = azure.registrations.get('sk_render');
	assert.deepEqual(registration.methods, [
		'HEAD',
		'GET',
		'POST',
		'DELETE',
		'PUT',
		'OPTIONS',
		'PATCH'
	]);
	for (const response of await Promise.all(
		Array.from({ length: 3 }, () =>
			registration.handler(
				{
					method: 'GET',
					headers: new Headers({
						'x-ms-original-url': 'https://example.test/base/probe',
						'x-forwarded-for': '203.0.113.7'
					}),
					body: null
				},
				{ functionName: 'sk_render', log() {}, error() {} }
			)
		)
	)) {
		assert.equal(response.status, 200);
		const data = await new Response(response.body).json();
		assert.equal(data.path, '/base/probe');
		assert.equal(data.address, '203.0.113.7');
		assert.equal(data.functionName, 'sk_render');
		assert.equal(data.token, 'runtime-token');
		assert.equal(data.instrumentationToken, instrumented ? 'runtime-token' : null);
		assert.deepEqual(
			data.events,
			instrumented ? ['instrumentation', 'application'] : ['application']
		);
	}
	console.log('PASS full Kit 3 adapter build + concurrent requests', { instrumented, custom });
} finally {
	process.chdir(path.dirname(path.dirname(fixtureRoot)));
	await rm(fixtureRoot, { recursive: true, force: true });
}
