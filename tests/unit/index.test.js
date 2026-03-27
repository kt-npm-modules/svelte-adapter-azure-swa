import { existsSync, writeFileSync } from 'fs';
import { rollup } from 'rollup';
import { describe, expect, test, vi } from 'vitest';
import azureAdapter from '../../src/index';
import { generateConfig } from '../../src/swa-config';
import { jsonMatching } from './json';

expect.extend({ jsonMatching });

vi.mock('fs', () => ({
	writeFileSync: vi.fn(),
	existsSync: vi.fn(() => true)
}));

vi.mock('rollup', () => ({
	rollup: vi.fn(() =>
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
		expect(() => generateConfig({ navigationFallback: {} })).toThrowError(
			'cannot override navigationFallback'
		);
		expect(() => generateConfig({ routes: [{ route: '*' }] })).toThrowError(
			"cannot override '*' route"
		);
	});

	test('accepts custom config', () => {
		const result = generateConfig({
			platform: {
				apiRuntime: 'node:20'
			},
			globalHeaders: { 'X-Foo': 'bar' }
		});
		expect(result.globalHeaders).toStrictEqual({ 'X-Foo': 'bar' });
		expect(result.platform.apiRuntime).toBe('node:20');
	});
});

describe('adapt', () => {
	test('runs', async () => {
		const adapter = azureAdapter();
		const builder = getMockBuilder();
		await adapter.adapt(builder);
		expect(builder.writePrerendered).toBeCalled();
		expect(builder.writeClient).toBeCalled();
		expect(builder.copy).toBeCalledWith(
			expect.stringContaining('server/template'),
			'build/server',
			expect.anything()
		);
		expect(builder.copy).toBeCalledWith(
			expect.stringContaining('server/template/package.json'),
			'build/server/package.json'
		);
	});

	test('runs with externals', async () => {
		const adapter = azureAdapter({ external: ['@azure/functions'] });
		const builder = getMockBuilder();
		await adapter.adapt(builder);
		expect(builder.writePrerendered).toBeCalled();
		expect(builder.writeClient).toBeCalled();
		expect(builder.copy).toBeCalledWith(
			expect.stringContaining('server/template'),
			'build/server',
			expect.anything()
		);
		expect(builder.copy).toBeCalledTimes(1);
	});

	test('writes to custom api directory', async () => {
		const adapter = azureAdapter({ apiDir: 'custom/api', cleanApiDir: true });
		const builder = getMockBuilder();
		await adapter.adapt(builder);
		expect(rollup).toBeCalledWith(
			expect.objectContaining({
				output: {
					dir: 'custom/api/sk_render',
					entryFileNames: 'index.js',
					format: 'es',
					// inlineDynamicImports: true,
					sourcemap: true
				}
			})
		);

		// we don't copy the required function files to a custom API directory
		expect(builder.copy).not.toBeCalledWith(expect.stringContaining('api'), 'custom/api');
	});

	test('writes to custom static directory', async () => {
		vi.mocked(existsSync).mockImplementationOnce(() => false);
		const adapter = azureAdapter({ staticDir: 'custom/static' });
		const builder = getMockBuilder();
		await adapter.adapt(builder);
		expect(builder.writeClient).toBeCalledWith('custom/static');
		expect(builder.writePrerendered).toBeCalledWith('custom/static');
	});

	test('logs warning when custom api directory set and required file does not exist', async () => {
		vi.mocked(existsSync).mockImplementationOnce(() => false);
		const adapter = azureAdapter({ apiDir: 'custom/api' });
		const builder = getMockBuilder();
		await adapter.adapt(builder);
		expect(builder.log.warn).toBeCalled();
	});

	test('adds index.html when root not prerendered', async () => {
		const adapter = azureAdapter();
		const builder = getMockBuilder();
		builder.prerendered.paths = [];
		await adapter.adapt(builder);

		expect(writeFileSync).toBeCalledWith(expect.stringContaining('index.html'), '');
		expect(writeFileSync).toBeCalledWith(
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
		await expect(adapter.adapt(builder)).rejects.toThrowError(
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

	test('handles null routes', async () => {
		// builder.routes was added in 1.5 with route-level config
		const adapter = azureAdapter();
		const builder = getMockBuilder();
		builder.routes = null;
		await expect(adapter.adapt(builder)).resolves.not.toThrow();
	});

	test('emulate authenticated', async () => {
		const adapter = azureAdapter({
			apiDir: 'custom/api',
			cleanApiDir: true,
			emulate: { role: 'authenticated' }
		});
		const emulator = await adapter.emulate();
		const platform = emulator.platform({}, 'auto');
		expect(platform.clientPrincipal).toBeDefined();
		expect(platform.user).toBeDefined();
	});

	test('emulate unauthenticated', async () => {
		const adapter = azureAdapter({
			apiDir: 'custom/api',
			cleanApiDir: true,
			emulate: { role: 'anonymous' }
		});
		const emulator = await adapter.emulate();
		const platform = emulator.platform({}, 'auto');
		expect(platform.clientPrincipal).toBeNull();
		expect(platform.user).toBeNull();
	});

	test('serverRollup - should not overwrite options.output', async () => {
		const adapter = azureAdapter({
			serverRollup: (options) => ({ ...options, output: { ...options.output, sourcemap: false } })
		});
		const builder = getMockBuilder();
		await adapter.adapt(builder);
		expect(rollup).toBeCalledWith(
			expect.objectContaining({
				output: {
					format: 'es',
					sourcemap: true,
					dir: 'build/server/sk_render',
					entryFileNames: 'index.js'
				}
			})
		);
	});
});

/** @returns {import('@sveltejs/kit').Builder} */
function getMockBuilder() {
	return {
		config: {
			kit: {
				appDir: '/app'
			}
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
		generateManifest: vi.fn(),
		getBuildDirectory: vi.fn((x) => x),
		getServerDirectory: vi.fn(() => 'server'),
		getClientDirectory: vi.fn(() => 'client'),
		rimraf: vi.fn(),
		writeClient: vi.fn(),
		writePrerendered: vi.fn(),
		mkdirp: vi.fn(),
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
