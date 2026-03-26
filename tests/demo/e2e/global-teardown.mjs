import MCR from 'monocart-coverage-reports';

export default async function globalTeardown() {
	const client = await MCR.CDPClient({ port: 9230 });

	try {
		const coverageDir = await client.writeCoverage();
		console.log('[coverage] dumped via CDP to:', coverageDir);
	} finally {
		await client.close();
	}
}