import { describe, expect, test, vi } from 'vitest';
import adapter from '../../src/index.js';

const principal = Object.freeze({
	identityProvider: 'github',
	userId: 'custom-user',
	userDetails: 'custom@example.test',
	userRoles: Object.freeze(['authenticated', 'admin'])
});

async function createPlatformProvider(emulate) {
	const emulator = await adapter({ emulate }).emulate();
	return () => emulator.platform({ config: {}, prerender: false });
}

describe('platform-user emulation', () => {
	test.each([undefined, {}, { role: 'anonymous' }])(
		'defaults to anonymous for %j',
		async (state) => {
			const platform = (await createPlatformProvider(state))();
			expect(platform.clientPrincipal).toBeNull();
			expect(platform.user).toBeNull();
		}
	);

	test('creates the default authenticated user when the principal is omitted', async () => {
		const platform = (await createPlatformProvider({ role: 'authenticated' }))();
		expect(platform.clientPrincipal.userId).toBe('devUser');
		expect(platform.clientPrincipal.userRoles).toEqual(['authenticated']);
		expect(platform.user.id).toBe(platform.clientPrincipal.userId);
		expect(platform.user.claimsPrincipalData).toMatchObject({
			'http://schemas.microsoft.com/ws/2008/06/identity/claims/role': 'authenticated'
		});
	});

	test.each([undefined, 'anonymous', 'authenticated'])(
		'uses a custom principal without claims in preference to role %s',
		async (role) => {
			const state = Object.freeze({ role, clientPrincipal: principal });
			const platform = (await createPlatformProvider(state))();
			expect(platform.clientPrincipal).toEqual(principal);
			expect(platform.user).toEqual({
				type: 'StaticWebApps',
				id: principal.userId,
				username: principal.userDetails,
				identityProvider: principal.identityProvider,
				claimsPrincipalData: {}
			});
		}
	);

	test('maps claims without mutating the supplied principal', async () => {
		const clientPrincipal = Object.freeze({
			...principal,
			claims: Object.freeze([
				Object.freeze({ typ: 'name', val: 'Custom User' }),
				Object.freeze({ typ: 'role', val: 'admin' })
			])
		});
		const platform = (await createPlatformProvider({ clientPrincipal }))();
		expect(platform.clientPrincipal).toEqual(clientPrincipal);
		expect(platform.user.claimsPrincipalData).toEqual({ name: 'Custom User', role: 'admin' });
	});

	test('explicit null overrides the authenticated fallback', async () => {
		const platform = (
			await createPlatformProvider({ role: 'authenticated', clientPrincipal: null })
		)();
		expect(platform.clientPrincipal).toBeNull();
		expect(platform.user).toBeNull();
	});

	test('resolves changing state on every call without caching the user', async () => {
		let state = { role: 'anonymous' };
		const resolveState = vi.fn(() => state);
		const platformForRequest = await createPlatformProvider(resolveState);
		expect(resolveState).not.toHaveBeenCalled();

		const anonymous = platformForRequest();
		state = { clientPrincipal: principal };
		const authenticated = platformForRequest();
		state = { role: 'authenticated', clientPrincipal: null };
		const loggedOut = platformForRequest();

		expect(anonymous.user).toBeNull();
		expect(anonymous.clientPrincipal).toBeNull();
		expect(authenticated.user.id).toBe(principal.userId);
		expect(authenticated.clientPrincipal.userRoles).toEqual(['authenticated', 'admin']);
		expect(loggedOut.user).toBeNull();
		expect(loggedOut.clientPrincipal).toBeNull();
		expect(resolveState).toHaveBeenCalledTimes(3);
		expect(
			new Set([anonymous, authenticated, loggedOut].map((p) => p.context.invocationId)).size
		).toBe(3);
	});

	test('resolves role-only callbacks without requiring a custom principal', async () => {
		let role = 'anonymous';
		const platformForRequest = await createPlatformProvider(() => ({ role }));
		expect(platformForRequest().user).toBeNull();
		role = 'authenticated';
		expect(platformForRequest().user.id).toBe('devUser');
		role = 'anonymous';
		expect(platformForRequest().user).toBeNull();
	});
});
