import type { Actions } from './$types';

export const actions: Actions = {
	default: ({ request }) => {
		const raw = request.headers.get('x-adapter-test-workarounds');
		const info = raw
			? (JSON.parse(raw) as {
					emptyFormContentTypeStrip?: { emptyPostWorkaround?: boolean };
				})
			: undefined;
		return {
			success: true,
			workaroundInfoPresent: Boolean(info),
			emptyPostWorkaround: info?.emptyFormContentTypeStrip?.emptyPostWorkaround ?? false
		};
	}
};
