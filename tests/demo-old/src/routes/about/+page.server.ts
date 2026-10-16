import assert from 'node:assert';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	const platform = event.platform;
	assert(platform, 'Platform must be available in the load function');
	const user = platform.user; // This is the user object from the platform
	const clientPrincipal = platform.clientPrincipal; // This is the client principal object from the platform
	const context = platform.context; // Somehow the App.Platform is not picked up as definition from adapter
	context.log('Log via InvocationContext: Loading about page');
	context.log('Log via InvocationContext: User:', user);
	context.log('Log via InvocationContext: Client Principal:', clientPrincipal);
	return {
		user,
		clientPrincipal
	};
};
