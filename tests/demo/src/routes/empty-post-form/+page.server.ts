import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request }) => {
		return {
			success: true,
			workaroundMarker: request.headers.get('x-adapter-test-empty-post-workaround') === 'true'
		};
	}
};
