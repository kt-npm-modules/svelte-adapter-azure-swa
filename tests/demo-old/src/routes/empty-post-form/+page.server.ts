import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request }) => {
		const workaroundHeaderStr = request.headers.get('x-adapter-test-workarounds');
		const workaroundsInfo = workaroundHeaderStr
			? // eslint-disable-next-line @typescript-eslint/no-explicit-any
				(JSON.parse(workaroundHeaderStr) as Record<string, any>)
			: undefined;
		return {
			success: true,
			workaroundsInfo
		};
	}
};
