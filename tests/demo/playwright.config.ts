import { defineConfig, PlaywrightTestConfig } from '@playwright/test';
import { fileURLToPath } from 'url';

console.warn('#'.repeat(100));
console.warn('NODE_ENV: ', process.env.NODE_ENV);
console.warn('SWA: ', process.env.PUBLIC_SWA);
console.warn('CI: ', process.env.CI);

let webServer: PlaywrightTestConfig['webServer'];
let baseURL: string | undefined;
if (process.env.PUBLIC_SWA == 'true') {
	console.warn('Running in SWA mode');
	webServer = {
		timeout: 120 * 1000,
		command:
			'mkdir -p .tmp && TIMESTAMP="$(date +"%Y%m%d-%H%M%S")" && npm run swa -- --verbose=silly 2>&1 | tee .tmp/swa-$TIMESTAMP.log',
		port: 4280
	};
	baseURL = 'http://localhost:4280';
} else if (process.env.CI == 'true') {
	console.warn('Running in CI mode');
	webServer = undefined;
	baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL;
} else {
	console.warn('Running in local mode');
	webServer = {
		command: 'npm run build && npm run preview',
		port: 4173
	};
	baseURL = 'http://localhost:4173';
}
console.warn('#'.repeat(100));

export default defineConfig({
	webServer,
	use: {
		baseURL
	},
	testDir: 'e2e',
	globalTeardown: fileURLToPath(new URL('./e2e/global-teardown.mjs', import.meta.url))
});
