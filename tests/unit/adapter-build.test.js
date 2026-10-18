import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect, test } from 'vitest';

const run = promisify(execFile);
const fixture = fileURLToPath(new URL('./fixtures/kit3-build.mjs', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));

test.each([
	['without instrumentation', []],
	['with instrumentation', ['--instrumented']],
	['with instrumentation and custom output directories', ['--instrumented', '--custom']],
	['with instrumentation and a mutating callback', ['--instrumented', '--server-rolldown=mutate']],
	[
		'with instrumentation and a replacement callback',
		['--instrumented', '--server-rolldown=replace']
	]
])(
	'builds and serves requests through Kit 3 %s',
	async (_, args) => {
		// A child process isolates Kit/Vite state and loads the output with Node's native ESM loader.
		await run(process.execPath, [fixture, ...args], { cwd: root, timeout: 30_000 });
	},
	35_000
);

test('fails the Kit 3 build clearly when serverRolldown removes an instrumentation input', async () => {
	await expect(
		run(process.execPath, [fixture, '--instrumented', '--server-rolldown=invalid'], {
			cwd: root,
			timeout: 30_000
		})
	).rejects.toMatchObject({
		stderr: expect.stringContaining(
			'serverRolldown must preserve adapter-owned input["instrumentation-init"]'
		)
	});
}, 35_000);
