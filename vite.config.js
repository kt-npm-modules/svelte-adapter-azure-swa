import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		exclude: [
			...configDefaults.exclude,
			'./tests/demo/**',
			'./tests/new-demo/**',
			'./tests/unit/json.js'
		],
		coverage: {
			provider: 'istanbul',
			reportsDirectory: './coverage-test',
			exclude: [
				...configDefaults.exclude,
				'./tests/demo/**',
				'./tests/new-demo/**',
				'./tests/**',
				'./src/server/entry/index.js',
				'./tests/unit/json.js'
			],
			reporter: ['text', 'html', 'clover', 'json', 'lcov']
		}
	}
});
