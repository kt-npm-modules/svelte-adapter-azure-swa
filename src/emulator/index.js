import functions from '@azure/functions';
import { randomUUID } from 'crypto';
const { InvocationContext } = functions;

/** @type {import('./index.js').emulatePlatform} */
export function emulatePlatform(config, prerender, options) {
	/** @type {App.Platform['clientPrincipal']} */
	let clientPrincipal = null;
	/** @type {App.Platform['user']} */
	let user = null;
	/** @type {App.Platform} */
	let platform;

	if (!clientPrincipal && options?.role === 'authenticated') {
		clientPrincipal = {
			identityProvider: 'adapter-azure-swa',
			userId: 'devUser',
			userDetails: 'devUser@development.org',
			userRoles: ['authenticated'],
			claims: [
				{
					typ: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
					val: 'devUser'
				},
				{
					typ: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
					val: 'devUser@development.org'
				},
				{
					// Claim for authenticated role
					typ: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
					val: 'authenticated'
				}
			]
		};
	}

	if (clientPrincipal) {
		// Build claimsPrincipalData first so `user` can be assigned in a single
		// object literal. TS 6.x loses control-flow narrowing on `user` if we
		// assign first and then mutate inside a nested `if ('claims' in ...)`,
		// because the nested guard introduces a different discriminant on
		// `clientPrincipal` and re-widens `user` back to `HttpRequestUser | null`.
		/** @type {import('@azure/functions').HttpRequestUser['claimsPrincipalData']} */
		const claimsPrincipalData =
			'claims' in clientPrincipal
				? clientPrincipal.claims.reduce((acc, claim) => {
						acc[claim.typ] = claim.val;
						return acc;
					}, /** @type {import('@azure/functions').HttpRequestUser['claimsPrincipalData']} */ ({}))
				: {};
		user = {
			type: 'StaticWebApps',
			id: clientPrincipal.userId,
			username: clientPrincipal.userDetails,
			identityProvider: clientPrincipal.identityProvider,
			claimsPrincipalData
		};
	}

	platform = {
		clientPrincipal: clientPrincipal,
		user: user,
		context: new InvocationContext({
			invocationId: randomUUID(),
			functionName: 'sk_render'
		})
	};

	return platform;
}
