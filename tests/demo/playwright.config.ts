import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: process.env.PLAYWRIGHT_TEST_BASE_URL
		? undefined
		: process.env.PUBLIC_SWA_CLI === 'true'
			? { command: 'npm run swa', port: 4280, timeout: 120_000 }
			: { command: 'npm run build && npm run preview', port: 4173 },
	use: {
		baseURL:
			process.env.PLAYWRIGHT_TEST_BASE_URL ||
			(process.env.PUBLIC_SWA_CLI === 'true' ? 'http://localhost:4280' : 'http://localhost:4173')
	},
	testMatch: '**/*.e2e.{ts,js}'
});
