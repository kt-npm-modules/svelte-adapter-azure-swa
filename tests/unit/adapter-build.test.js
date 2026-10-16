import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'vitest';

const run = promisify(execFile);
const fixture = fileURLToPath(new URL('./fixtures/kit3-build.mjs', import.meta.url));
const root = fileURLToPath(new URL('../../', import.meta.url));

test.each([
	['without instrumentation', []],
	['with instrumentation', ['--instrumented']],
	['with instrumentation and custom output directories', ['--instrumented', '--custom']]
])(
	'builds and serves requests through Kit 3 %s',
	async (_, args) => {
		// A child process isolates Kit/Vite state and loads the output with Node's native ESM loader.
		await run(process.execPath, [fixture, ...args], { cwd: root, timeout: 30_000 });
	},
	35_000
);
