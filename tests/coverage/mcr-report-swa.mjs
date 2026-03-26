import MCR from 'monocart-coverage-reports';

const mcr = MCR({
	outputDir: './coverage-swa',
	reports: ['lcovonly', 'console-summary', 'console-details']
});

await mcr.addFromDir('./tests/demo/func/coverage-v8');
await mcr.generate();
