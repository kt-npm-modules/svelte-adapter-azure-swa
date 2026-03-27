import MCR from 'monocart-coverage-reports';

const mcr = MCR({
	outputDir: './coverage-swa',
	reports: ['lcovonly', 'console-summary', 'console-details']
});

await mcr.addFromDir('./coverage-v8'); // Build phase
await mcr.addFromDir('./tests/demo/func/coverage-v8'); // Test phase
await mcr.generate();
