import type { InvocationContext } from '@azure/functions';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const platform: any = event.platform;
	const user = platform.user; // This is the user object from the platform
	const clientPrincipal = platform.clientPrincipal; // This is the client principal object from the platform
	const context: InvocationContext = platform.context; // Somehow the App.Platform is not picked up as definition from adapter
	context.log('Log via InvocationContext: Loading about page');
	context.log('Log via InvocationContext: User:', user);
	context.log('Log via InvocationContext: Client Principal:', clientPrincipal);
	return {
		user,
		clientPrincipal
	};
};
