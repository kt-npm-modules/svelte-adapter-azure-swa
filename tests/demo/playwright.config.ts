import { defineConfig } from '@playwright/test';
import { isSwaCli, target } from './e2e/environment';

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
process.env.PLAYWRIGHT_TARGET = target;

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
					? 'npm run build:swa && env -u NODE_V8_COVERAGE npm run swa'
					: 'npm run build && npm run preview',
				port: isSwaCli ? 4280 : 4173,
				timeout: 180_000,
				env: {
					PUBLIC_SWA_CLI: String(isSwaCli)
				}
			},
	use: { baseURL: externalURL || (isSwaCli ? 'http://localhost:4280' : 'http://localhost:4173') }
});
