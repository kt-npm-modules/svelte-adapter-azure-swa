import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { SourceMap } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBuilder } from 'vite';

const instrumented = process.argv.includes('--instrumented');
const custom = process.argv.includes('--custom');
const serverRolldownMode = process.argv
	.find((arg) => arg.startsWith('--server-rolldown='))
	?.split('=')[1];
const apiDir = custom ? 'func' : 'build/server';
const staticDir = custom ? 'public-build' : 'build/static';
await mkdir('.tmp', { recursive: true });
const fixtureRoot = await mkdtemp(path.resolve('.tmp/kit3-build-'));
try {
	await mkdir(path.join(fixtureRoot, 'src/routes/probe'), { recursive: true });
	await mkdir(path.join(fixtureRoot, 'src/routes/static-page'), { recursive: true });
	await mkdir(path.join(fixtureRoot, 'static'), { recursive: true });
	await writeFile(path.join(fixtureRoot, 'static/asset.txt'), 'copied-static-asset');
	await writeFile(
		path.join(fixtureRoot, 'src/routes/static-page/+page.js'),
		'export const prerender = true;'
	);
	await writeFile(
		path.join(fixtureRoot, 'src/routes/static-page/greet.ts'),
		`export function greet(name: string) {\n return 'typescript-source-map-probe ' + name;\n}\n`
	);
	await writeFile(
		path.join(fixtureRoot, 'src/routes/static-page/+page.svelte'),
		`<script lang="ts">\n import { greet } from './greet';\n let name = $state('world');\n const marker = 'svelte-source-map-probe';\n</script>\n<button onclick={() => name = 'kit3'}>{greet(name)}</button>\n<p>{marker}</p>\n`
	);
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
	// Kit's prerender worker reloads Vite configuration in a separate process.
	await writeFile(
		path.join(fixtureRoot, 'vite.config.js'),
		`import { sveltekit } from '@sveltejs/kit/vite';
import adapter from ${JSON.stringify(new URL('../../../src/index.js', import.meta.url).href)};
const options = ${JSON.stringify(custom ? { apiDir, staticDir } : {})};
const callbackMode = ${JSON.stringify(serverRolldownMode ?? null)};
if (callbackMode) options.serverRolldown = (options) => {
  if (callbackMode === 'invalid') {
    delete options.input['instrumentation-init'];
    return options;
  }
  const plugins = [...options.plugins, {
    name: 'callback-probe',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'callback-probe.txt', source: 'callback-plugin-ran' }); }
  }];
  const external = [...options.external, 'callback-external'];
  if (callbackMode === 'replace') return { ...options, plugins, external, treeshake: false };
  Object.assign(options, { plugins, external, treeshake: false });
  if (callbackMode !== 'no-return') return options;
};
export default {
  logLevel: 'warn',
  build: { sourcemap: true },
  // Isolate Kit's cookie v2 from an unrelated older root transitive dependency.
  ssr: { noExternal: ['cookie'] },
  plugins: [sveltekit({ appDir: 'assets', paths: { base: '/base' }, adapter: adapter(options) })]
};`
	);
	process.chdir(fixtureRoot);
	const appBuilder = await createBuilder({
		root: fixtureRoot,
		configFile: path.join(fixtureRoot, 'vite.config.js')
	});
	await appBuilder.buildApp();
	if (serverRolldownMode) {
		assert.equal(
			await readFile(path.join(apiDir, 'sk_render/callback-probe.txt'), 'utf8'),
			'callback-plugin-ran'
		);
	}
	assert.equal(await readFile(path.join(staticDir, 'asset.txt'), 'utf8'), 'copied-static-asset');
	assert.match(
		await readFile(path.join(staticDir, 'static-page.html'), 'utf8'),
		/typescript-source-map-probe world/
	);
	const clientDir = path.join(fixtureRoot, '.svelte-kit/output/client');
	const files = await readdir(clientDir, { recursive: true });
	const mappedSources = new Set();
	for (const file of files.filter((file) => file.endsWith('.js.map'))) {
		const originalPath = path.join(clientDir, file);
		const copiedPath = path.join(fixtureRoot, staticDir, file);
		const original = JSON.parse(await readFile(originalPath, 'utf8'));
		const copied = JSON.parse(await readFile(copiedPath, 'utf8'));
		assert.equal(copied.mappings, original.mappings);
		assert.deepEqual(copied.sourcesContent, original.sourcesContent);
		assert.deepEqual(copied.names, original.names);
		const code = await readFile(copiedPath.slice(0, -4), 'utf8');
		assert.equal(code, await readFile(originalPath.slice(0, -4), 'utf8'));
		for (const [index, source] of copied.sources.entries()) {
			assert.equal(
				path.resolve(path.dirname(copiedPath), copied.sourceRoot ?? '', source),
				path.resolve(path.dirname(originalPath), original.sourceRoot ?? '', original.sources[index])
			);
		}
		for (const [marker, sourceFile, expectedLine] of [
			['typescript-source-map-probe', 'greet.ts', "return 'typescript-source-map-probe ' + name;"],
			['svelte-source-map-probe', '+page.svelte', '<p>{marker}</p>']
		]) {
			const offset = code.indexOf(marker);
			if (offset < 0) continue;
			const before = code.slice(0, offset).split('\n');
			const entry = new SourceMap(copied).findEntry(before.length - 1, before.at(-1).length);
			assert.ok(entry.originalSource?.endsWith(sourceFile), JSON.stringify(entry));
			const resolved = path.resolve(
				path.dirname(copiedPath),
				copied.sourceRoot ?? '',
				entry.originalSource
			);
			const sourceText = await readFile(resolved, 'utf8');
			assert.equal(sourceText.split('\n')[entry.originalLine].trim(), expectedLine);
			mappedSources.add(sourceFile);
		}
	}
	assert.deepEqual([...mappedSources].sort(), ['+page.svelte', 'greet.ts']);
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
