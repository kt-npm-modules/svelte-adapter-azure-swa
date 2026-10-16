export const target =
	process.env.PLAYWRIGHT_TARGET ??
	(process.env.PUBLIC_SWA_CLI === 'true'
		? 'swa'
		: process.env.PLAYWRIGHT_TEST_BASE_URL
			? 'azure'
			: 'preview');
export const isSwaCli = target === 'swa';
export const isLiveAzure = target === 'azure';
export const hasAzureAdapter = isSwaCli || isLiveAzure;
