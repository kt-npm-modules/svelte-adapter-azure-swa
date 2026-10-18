import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { loadEnv } from 'vite';
import { isSwaCli, target } from './e2e/environment';

const env = loadEnv('production', import.meta.dirname, '');
const externalURL = process.env.PLAYWRIGHT_TEST_BASE_URL;
if (!['preview', 'swa', 'azure'].includes(target)) {
	throw new Error('PLAYWRIGHT_TARGET must be preview, swa or azure');
}
if (target === 'azure' && !externalURL) {
	throw new Error('Azure E2E requires PLAYWRIGHT_TEST_BASE_URL; no local app will be started.');
}
if (isSwaCli && !externalURL && process.versions.node.split('.')[0] !== '22') {
	throw new Error('Local SWA E2E requires Node 22 (nvm use).');
}
if (!env.SENTRY_AUTH_TOKEN) {
	throw new Error(
		'E2E requires SENTRY_AUTH_TOKEN with project:read; local builds also require upload permission.'
	);
}
if (externalURL && (!env.PUBLIC_SENTRY_RELEASE || !env.PUBLIC_SENTRY_ENVIRONMENT)) {
	throw new Error(
		'External E2E requires PUBLIC_SENTRY_RELEASE and PUBLIC_SENTRY_ENVIRONMENT from the deployed build.'
	);
}

// Build identity is stable across requests; correlation nonces are generated per test.
const release = env.PUBLIC_SENTRY_RELEASE || `adapter-e2e-${randomUUID()}`;
const environment = env.PUBLIC_SENTRY_ENVIRONMENT || 'adapter-e2e';
// Freeze settings before Playwright workers start and set their own base-URL env.
process.env.PLAYWRIGHT_TARGET = target;
process.env.SENTRY_AUTH_TOKEN = env.SENTRY_AUTH_TOKEN;
process.env.PUBLIC_SENTRY_RELEASE = release;
process.env.PUBLIC_SENTRY_ENVIRONMENT = environment;

export default defineConfig({
	testDir: '.',
	testMatch: ['e2e/**/*.test.ts', 'src/**/*.e2e.{ts,js}'],
	fullyParallel: true,
	workers: process.env.CI ? 2 : 4,
	reporter: [['list'], ['html', { open: 'never' }]],
	globalTeardown:
		isSwaCli && !externalURL && process.env.NODE_V8_COVERAGE
			? './e2e/coverage-teardown.ts'
			: undefined,
	webServer: externalURL
		? undefined
		: {
				command: isSwaCli
					? 'npm run build:swa && env -u SENTRY_AUTH_TOKEN -u NODE_V8_COVERAGE npm run swa'
					: 'npm run build && env -u SENTRY_AUTH_TOKEN npm run preview',
				port: isSwaCli ? 4280 : 4173,
				timeout: 180_000,
				env: {
					PUBLIC_SENTRY_ENABLED: 'true',
					PUBLIC_SENTRY_RELEASE: release,
					PUBLIC_SENTRY_ENVIRONMENT: environment,
					PUBLIC_SWA_CLI: String(isSwaCli),
					SENTRY_RELEASE: release,
					SENTRY_DISABLE_UPLOAD: 'false'
				}
			},
	use: { baseURL: externalURL || (isSwaCli ? 'http://localhost:4280' : 'http://localhost:4173') }
});
