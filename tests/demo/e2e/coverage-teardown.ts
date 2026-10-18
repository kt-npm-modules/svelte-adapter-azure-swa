import assert from 'node:assert/strict';
import MCR from 'monocart-coverage-reports';
import path from 'node:path';

// Flush before Playwright stops SWA and its Function worker.
export default async function globalTeardown() {
	const client = await MCR.CDPClient({ port: 9230 });
	assert(client, 'Coverage requires the local Function worker inspector on port 9230');
	try {
		const coverageDir = await client.writeCoverage();
		assert(coverageDir, 'The Function worker did not write V8 coverage');
		assert.equal(
			path.resolve(coverageDir),
			path.resolve(import.meta.dirname, '../func/coverage-v8')
		);
		console.log('[coverage] Function worker flushed:', coverageDir);
	} finally {
		await client.close();
	}
}
