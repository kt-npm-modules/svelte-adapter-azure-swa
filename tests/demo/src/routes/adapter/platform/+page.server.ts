import assert from 'node:assert/strict';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ platform, getClientAddress }) => {
	assert(platform, 'Azure platform must be available');
	platform.context.log('Adapter platform scenario');
	// Return selected diagnostic facts, not raw claims or user credentials.
	return {
		userPresent: platform.user !== null,
		clientPrincipalPresent: platform.clientPrincipal !== null,
		roles: platform.clientPrincipal?.userRoles ?? [],
		invocationId: platform.context.invocationId,
		clientAddressPresent: Boolean(getClientAddress())
	};
};
