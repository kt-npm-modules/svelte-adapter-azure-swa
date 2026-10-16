import { defineConfig } from '@playwright/test';
import { target, isSwaCli } from './e2e/environment';

if (!['preview', 'swa', 'azure'].includes(target)) {
	throw new Error('PLAYWRIGHT_TARGET must be preview, swa or azure');
}
if (target === 'azure' && !process.env.PLAYWRIGHT_TEST_BASE_URL) {
	throw new Error('Azure tests require PLAYWRIGHT_TEST_BASE_URL');
}

// Freeze the selected mode before Playwright starts workers and sets its own base URL env.
process.env.PLAYWRIGHT_TARGET = target;

export default defineConfig({
	testDir: '.',
	testMatch: ['e2e/**/*.test.ts', 'src/**/*.e2e.{ts,js}'],
	fullyParallel: true,
	workers: process.env.CI ? 2 : 4,
	reporter: [['list'], ['html', { open: 'never' }]],
	webServer: process.env.PLAYWRIGHT_TEST_BASE_URL
		? undefined
		: isSwaCli
			? { command: 'npm run swa', port: 4280, timeout: 120_000 }
			: { command: 'npm run build && npm run preview', port: 4173, timeout: 120_000 },
	use: {
		baseURL:
			process.env.PLAYWRIGHT_TEST_BASE_URL ||
			(isSwaCli ? 'http://localhost:4280' : 'http://localhost:4173')
	}
});
