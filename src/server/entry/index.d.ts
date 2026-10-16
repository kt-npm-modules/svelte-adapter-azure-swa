declare module 'ENV' {
	export const debug: boolean;
	export const testWorkarounds: boolean;
	export const preserveAuthorization: boolean;
}

declare module 'SERVER_INSTANCE' {
	import type { Server } from '@sveltejs/kit';
	export const server: Server;
}
