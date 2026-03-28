import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sentrySvelteKit } from '@sentry/sveltekit';
// import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import { sentryRewriteSourcesFactory } from 'svelte-adapter-azure-swa';
import { defineConfig } from 'vitest/config';

const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
if (!SENTRY_AUTH_TOKEN) {
	console.warn('SENTRY_AUTH_TOKEN is not set. Sentry source maps upload will be skipped.');
}

export default defineConfig({
	build: {
		sourcemap: true
	},
	plugins: [
		sentrySvelteKit({
			adapter: 'other',
			org: 'konstantin-tarmyshov',
			project: 'svelte-adapter-azure-swa',
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
		// devtoolsJson(),
		paraglideVitePlugin({ project: './project.inlang', outdir: './src/lib/paraglide' })
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
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
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
