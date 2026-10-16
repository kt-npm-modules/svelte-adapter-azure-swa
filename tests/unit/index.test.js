import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { rolldown } from 'rolldown';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import azureAdapter from '../../src/index';
import { generateConfig } from '../../src/swa-config';
import { jsonMatching } from './json';

expect.extend({ jsonMatching });

vi.mock('fs', () => ({
	writeFileSync: vi.fn(),
	mkdirSync: vi.fn(),
	rmSync: vi.fn(),
	existsSync: vi.fn(() => true)
}));

beforeEach(() => vi.clearAllMocks());

vi.mock('rolldown', () => ({
	rolldown: vi.fn(() =>
		Promise.resolve({
			write: vi.fn(() => Promise.resolve())
		})
	)
}));

describe('generateConfig', () => {
	test('no custom config', () => {
		const result = generateConfig({}, 'appDir');
		expect(result).toStrictEqual({
			navigationFallback: {
				rewrite: '/api/sk_render'
			},
			platform: {
				apiRuntime: 'node:22'
			},
			routes: expect.arrayContaining([
				{
					methods: ['POST', 'PUT', 'DELETE', 'PATCH'],
					rewrite: '/api/sk_render',
					route: '*'
				},
				{
					headers: {
						'cache-control': 'public, immutable, max-age=31536000'
					},
					route: '/appDir/immutable/*'
				}
			])
		});
	});

	test('throws errors for invalid custom config', () => {
		expect(() => generateConfig({ navigationFallback: {} })).toThrow(
			'cannot override navigationFallback'
		);
		expect(() => generateConfig({ routes: [{ route: '*' }] })).toThrow("cannot override '*' route");
	});

	test('default config', () => {
		const result = generateConfig({});
		expect(result.platform.apiRuntime).toBe('node:22');
		expect(result.platform.globalHeaders).toBeUndefined();
	});

	test('accepts custom config', () => {
		const result = generateConfig({
			platform: {
				apiRuntime: 'node:24'
			},
			globalHeaders: { 'X-Foo': 'bar' }
		});
		expect(result.globalHeaders).toStrictEqual({ 'X-Foo': 'bar' });
		expect(result.platform.apiRuntime).toBe('node:24');
	});
});

describe('adapt', () => {
	test('runs', async () => {
		const adapter = azureAdapter();
		const builder = getMockBuilder();
		await adapter.adapt(builder);
		expect(rolldown).toHaveBeenCalledTimes(1);
		expect(builder.generateServerInstance).toHaveBeenCalledWith(
			'adapter-azure-swa/server-instance.js'
		);
		expect(rolldown).toHaveBeenCalledWith(
			expect.objectContaining({
				resolve: {
					alias: {
						SERVER_INSTANCE: 'adapter-azure-swa/server-instance.js',
						ENV: 'adapter-azure-swa/env.js'
					}
				}
			})
		);
		expect(builder.writePrerendered).toHaveBeenCalled();
		expect(builder.writeClient).toHaveBeenCalled();
		expect(builder.copy).toHaveBeenCalledWith(
			expect.stringContaining('server/template'),
			'build/server',
			expect.anything()
		);
		expect(builder.copy).toHaveBeenCalledWith(
			expect.stringContaining('server/template/package.json'),
			'build/server/package.json'
		);
	});

	test('runs with externals', async () => {
		const adapter = azureAdapter({ external: ['@azure/functions'] });
		const builder = getMockBuilder();
		await adapter.adapt(builder);
		expect(builder.writePrerendered).toHaveBeenCalled();
		expect(builder.writeClient).toHaveBeenCalled();
		expect(builder.copy).toHaveBeenCalledWith(
			expect.stringContaining('server/template'),
			'build/server',
			expect.anything()
		);
		expect(builder.copy).toHaveBeenCalledTimes(1);
	});

	test('does not generate an instrumentation facade without instrumentation', async () => {
		const builder = getMockBuilder();
		await azureAdapter().adapt(builder);
		expect(builder.createInstrumentationInitializer).not.toHaveBeenCalled();
		expect(builder.instrument).not.toHaveBeenCalled();
	});

	test('bundles the environment initializer before instrumenting the Azure wrapper', async () => {
		const builder = getMockBuilder();
		builder.hasServerInstrumentationFile.mockReturnValue(true);
		await azureAdapter({ apiDir: 'custom/api' }).adapt(builder);
		expect(builder.createInstrumentationInitializer).toHaveBeenCalledWith({
			outputDirectory: 'adapter-azure-swa'
		});
		expect(rolldown).toHaveBeenCalledWith(
			expect.objectContaining({
				input: expect.objectContaining({
					'instrumentation-init': 'adapter-azure-swa/init.js',
					'instrumentation.server': 'server/instrumentation.server.js'
				})
			})
		);
		expect(builder.instrument).toHaveBeenCalledWith({
			entrypoint: 'custom/api/sk_render/index.js',
			instrumentation: 'custom/api/sk_render/instrumentation.server.js',
			initializer: 'custom/api/sk_render/instrumentation-init.js',
			module: { exports: [] }
		});
		const bundle = await vi.mocked(rolldown).mock.results[0].value;
		expect(bundle.write.mock.invocationCallOrder[0]).toBeLessThan(
			builder.instrument.mock.invocationCallOrder[0]
		);
	});

	test.each(['_app', 'custom-app', 'base/custom-app'])(
		'uses the full application path %s for immutable asset rules',
		async (appPath) => {
			const builder = getMockBuilder();
			builder.getAppPath.mockReturnValue(appPath);
			await azureAdapter().adapt(builder);
			expect(writeFileSync).toHaveBeenCalledWith(
				expect.stringContaining('staticwebapp.config.json'),
				expect.jsonMatching(
					expect.objectContaining({
						routes: expect.arrayContaining([
							expect.objectContaining({ route: `/${appPath}/immutable/*` })
						])
					})
				)
			);
		}
	);

	test('cleans only the render function inside a custom API directory', async () => {
		await azureAdapter({ apiDir: 'custom/api', staticDir: 'custom/static' }).adapt(
			getMockBuilder()
		);
		expect(rmSync).toHaveBeenCalledWith('custom/api/sk_render', { recursive: true, force: true });
		expect(rmSync).not.toHaveBeenCalledWith('custom/api', expect.anything());
		expect(rmSync).toHaveBeenCalledWith('custom/static', { recursive: true, force: true });
		expect(mkdirSync).toHaveBeenCalledWith('adapter-azure-swa', { recursive: true });
	});

	test('preserves the shared build directory when custom output is inside it', async () => {
		await azureAdapter({ apiDir: 'build/api' }).adapt(getMockBuilder());
		expect(rmSync).not.toHaveBeenCalledWith(expect.stringMatching(/\/build$/), expect.anything());
		expect(rmSync).toHaveBeenCalledWith('build/api/sk_render', { recursive: true, force: true });
	});

	test('writes to custom api directory', async () => {
		const adapter = azureAdapter({ apiDir: 'custom/api' });
		const builder = getMockBuilder();
		await adapter.adapt(builder);
		expect(rolldown).toHaveBeenCalledWith(
			expect.objectContaining({
				output: {
					dir: 'custom/api/sk_render',
					entryFileNames: '[name].js',
					format: 'es',
					// inlineDynamicImports: true,
					sourcemap: true
				}
			})
		);

		// we don't copy the required function files to a custom API directory
		expect(builder.copy).not.toHaveBeenCalledWith(expect.stringContaining('api'), 'custom/api');
	});

	test('writes to custom static directory', async () => {
		vi.mocked(existsSync).mockImplementationOnce(() => false);
		const adapter = azureAdapter({ staticDir: 'custom/static' });
		const builder = getMockBuilder();
		await adapter.adapt(builder);
		expect(builder.writeClient).toHaveBeenCalledWith('custom/static');
		expect(builder.writePrerendered).toHaveBeenCalledWith('custom/static');
	});

	test('logs warning when custom api directory set and required file does not exist', async () => {
		vi.mocked(existsSync).mockImplementationOnce(() => false);
		const adapter = azureAdapter({ apiDir: 'custom/api' });
		const builder = getMockBuilder();
		await adapter.adapt(builder);
		expect(builder.log.warn).toHaveBeenCalled();
	});

	test('adds index.html when root not prerendered', async () => {
		const adapter = azureAdapter();
		const builder = getMockBuilder();
		builder.prerendered.paths = [];
		await adapter.adapt(builder);

		expect(writeFileSync).toHaveBeenCalledWith(expect.stringContaining('index.html'), '');
		expect(writeFileSync).toHaveBeenCalledWith(
			expect.stringContaining('staticwebapp.config.json'),
			expect.jsonMatching(
				expect.objectContaining({
					routes: expect.arrayContaining([
						{
							route: '/index.html',
							rewrite: '/api/sk_render'
						},
						{
							route: '/',
							rewrite: '/api/sk_render'
						}
					])
				})
			)
		);
	});

	test.each(['/api', '/api/foo'])('throws error when the app defines %s route', async (routeId) => {
		const adapter = azureAdapter();
		const builder = getMockBuilder();
		builder.routes.push({
			id: routeId
		});
		await expect(adapter.adapt(builder)).rejects.toThrow(
			'Conflicting routes detected. Please rename the routes listed above.'
		);
	});

	test('does not throw error for /api route if allowReservedSwaRoutes is defined', async () => {
		const adapter = azureAdapter({ allowReservedSwaRoutes: true });
		const builder = getMockBuilder();
		builder.routes.push({
			id: '/api'
		});
		await expect(adapter.adapt(builder)).resolves.not.toThrow();
	});

	test('handles empty routes', async () => {
		const adapter = azureAdapter();
		const builder = getMockBuilder();
		builder.routes = [];
		await expect(adapter.adapt(builder)).resolves.not.toThrow();
	});

	test('emulate authenticated', async () => {
		const adapter = azureAdapter({
			apiDir: 'custom/api',
			emulate: { role: 'authenticated' }
		});
		const emulator = await adapter.emulate();
		const platform = emulator.platform({ config: {}, prerender: 'auto' });
		expect(platform.clientPrincipal).toBeDefined();
		expect(platform.user).toBeDefined();
	});

	test('emulate unauthenticated', async () => {
		const adapter = azureAdapter({
			apiDir: 'custom/api',
			emulate: { role: 'anonymous' }
		});
		const emulator = await adapter.emulate();
		const platform = emulator.platform({ config: {}, prerender: 'auto' });
		expect(platform.clientPrincipal).toBeNull();
		expect(platform.user).toBeNull();
	});

	test('serverRolldown - should not overwrite options.output', async () => {
		const adapter = azureAdapter({
			serverRolldown: (options) => ({ ...options, output: { ...options.output, sourcemap: false } })
		});
		const builder = getMockBuilder();
		await adapter.adapt(builder);
		expect(rolldown).toHaveBeenCalledWith(
			expect.objectContaining({
				output: expect.objectContaining({
					format: 'es',
					sourcemap: true,
					dir: 'build/server/sk_render',
					entryFileNames: '[name].js'
				})
			})
		);
	});

	test('serverRolldown - should not mutate options.output', async () => {
		const adapter = azureAdapter({
			serverRolldown: (options) => {
				options.output.sourcemap = false;
				return options;
			}
		});

		const builder = getMockBuilder();
		await adapter.adapt(builder);

		expect(rolldown).toHaveBeenCalledWith(
			expect.objectContaining({
				output: expect.objectContaining({
					format: 'es',
					sourcemap: true,
					dir: 'build/server/sk_render',
					entryFileNames: '[name].js'
				})
			})
		);
	});
});

/** @returns {import('@sveltejs/kit').Builder} */
function getMockBuilder() {
	return {
		config: {
			appDir: 'app'
		},
		log: Object.assign(vi.fn(), {
			success: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			minor: vi.fn(),
			info: vi.fn()
		}),
		prerendered: {
			paths: ['/']
		},
		copy: vi.fn(),
		generateServerInstance: vi.fn(),
		hasServerInstrumentationFile: vi.fn(() => false),
		createInstrumentationInitializer: vi.fn(({ outputDirectory }) => `${outputDirectory}/init.js`),
		instrument: vi.fn(),
		getAppPath: vi.fn(() => 'app'),
		getBuildDirectory: vi.fn((x) => x),
		getServerDirectory: vi.fn(() => 'server'),
		getClientDirectory: vi.fn(() => 'client'),
		writeClient: vi.fn(),
		writePrerendered: vi.fn(),
		routes: [
			{
				id: '/'
			},
			{
				id: '/about'
			}
		]
	};
}
