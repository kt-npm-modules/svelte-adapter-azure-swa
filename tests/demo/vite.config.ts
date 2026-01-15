import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { sentryRewriteSourcesFactory } from 'svelte-adapter-azure-swa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	build: {
		sourcemap: true
	},
	plugins: [
		sentrySvelteKit({
			adapter: 'other',
			sourceMapsUploadOptions: {
				org: 'konstantin-tarmyshov',
				project: 'svelte-adapter-azure-swa',
				sourcemaps: {
					assets: ['./build/**/*', './func/**/*']
				},
				authToken: process.env.SENTRY_AUTH_TOKEN,
				unstable_sentryVitePluginOptions: {
					sourcemaps: {
						rewriteSources: sentryRewriteSourcesFactory(['./build', './func'], {
							prefixDir: 'tests/demo',
							log: console.log
						})
					}
				}
			}
		}),
		tailwindcss(),
		sveltekit(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
		})
		// istanbul({
		// 	include: ['src/*', '../../src/entry/*', './func/sk_render/*'],
		// 	exclude: ['node_modules', 'test/'],
		// 	extension: ['.js', '.ts', '.svelte'],
		// 	requireEnv: false,
		// 	forceBuildInstrument: true
		// })
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					// environment: 'browser',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium' }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**'],
					setupFiles: ['./vitest-setup-client.ts']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
