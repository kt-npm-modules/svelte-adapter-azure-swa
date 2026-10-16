/// <reference types="vitest/config" />
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import adapter from '@ktarmyshov/svelte-adapter-azure-swa';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), '');
	const apiRuntime = env.NODE_API_RUNTIME || 'node:22';
	if (apiRuntime !== 'node:22') {
		throw new Error(
			'NODE_API_RUNTIME must be node:22, the runtime currently supported by the adapter.'
		);
	}
	return {
		build: { sourcemap: true },
		plugins: [
			enhancedImages(),
			tailwindcss(),
			sveltekit({
				compilerOptions: {
					// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
					runes: ({ filename }) =>
						filename.split(/[/\\]/).includes('node_modules') ? undefined : true
				},
					adapter: adapter({
					apiDir: './func',
					staticDir: './build/static',
					customStaticWebAppConfig: {
						platform: { apiRuntime },
						routes: [{ route: '/adapter/diagnostic-headers-rewrite', rewrite: '/api/sk_render' }]
					},
					testWorkarounds: true,
					emulate: { role: 'authenticated' }
				})
			}),
			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/lib/paraglide',
				emitTsDeclarations: true
			})
		],
		test: {
			expect: {
				requireAssertions: true
			},
			projects: [
				{
					extends: './vite.config.ts',
					test: {
						name: 'client',
						browser: {
							enabled: true,
							provider: playwright(),
							instances: [
								{
									browser: 'chromium',
									headless: true
								}
							]
						},
						include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
						exclude: ['src/lib/server/**']
					}
				},
				{
					extends: './vite.config.ts',
					test: {
						name: 'server',
						environment: 'node',
						include: ['src/**/*.{test,spec}.{js,ts}', 'e2e/helpers/**/*.spec.ts'],
						exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
					}
				},
				{
					extends: true,
					plugins: [
						// The plugin will run tests for the stories defined in your Storybook config
						// See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
						storybookTest({
							configDir: path.join(import.meta.dirname, '.storybook')
						})
					],
					test: {
						name: 'storybook',
						browser: {
							enabled: true,
							headless: true,
							provider: playwright({}),
							instances: [
								{
									browser: 'chromium'
								}
							]
						}
					}
				}
			]
		}
	};
});
