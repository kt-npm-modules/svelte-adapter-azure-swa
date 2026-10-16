import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { sentryRewriteSourcesFactory } from '../../src/index.js';

describe('sentryRewriteSourcesFactory', () => {
	const root = resolve('/repository');
	const rewrite = sentryRewriteSourcesFactory(root);

	test('resolves client and server maps to the same repository source', () => {
		expect(
			rewrite(
				'../../../../../src/page.svelte',
				{},
				{
					mapDir: resolve(root, 'tests/demo/build/static/_app/immutable/nodes')
				}
			)
		).toBe('tests/demo/src/page.svelte');
		expect(
			rewrite('../../src/page.svelte', {}, { mapDir: resolve(root, 'tests/demo/func/sk_render') })
		).toBe('tests/demo/src/page.svelte');
	});

	test('distinguishes identical source strings in different map directories', () => {
		for (const app of ['first', 'second']) {
			expect(rewrite('../src/page.ts', {}, { mapDir: resolve(root, app, 'output') })).toBe(
				`${app}/src/page.ts`
			);
		}
	});

	test.each(['https://example.com/a.ts', 'webpack://app/a.ts', '\0virtual:module'])(
		'preserves source identifier %s',
		(source) => {
			expect(rewrite(source, {}, { mapDir: root })).toBe(source);
		}
	);

	test('preserves the source when map context is unavailable', () => {
		expect(rewrite('../src/page.ts', {})).toBe('../src/page.ts');
	});

	test('accepts cwd-relative repository roots and absolute source paths', () => {
		const rewriteRelative = sentryRewriteSourcesFactory('.');
		expect(rewriteRelative(resolve('src/index.js'), {}, { mapDir: root })).toBe('src/index.js');
	});
});
