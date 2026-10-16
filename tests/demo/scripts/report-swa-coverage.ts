import MCR from 'monocart-coverage-reports';
import path from 'node:path';
import { readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const buildCoverage = path.join(repoRoot, 'coverage-v8');
const requestCoverage = path.resolve(import.meta.dirname, '../func/coverage-v8');
// Both phases are required; do not publish an empty or build-only report.
for (const directory of [buildCoverage, requestCoverage]) {
	assert(
		(await readdir(directory)).some((file) => /^coverage-.*\.json$/.test(file)),
		`Missing V8 coverage in ${directory}`
	);
}
const mcr = MCR({
	baseDir: repoRoot,
	outputDir: path.join(repoRoot, 'coverage-swa'),
	reports: ['lcovonly', 'console-summary']
});
await mcr.addFromDir(buildCoverage);
await mcr.addFromDir(requestCoverage);
await mcr.generate();
