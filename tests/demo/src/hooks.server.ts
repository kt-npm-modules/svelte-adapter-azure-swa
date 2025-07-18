import { paraglideMiddleware } from '$lib/paraglide/server';
import * as Sentry from '@sentry/sveltekit';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

Sentry.init({
	dsn: 'https://322c21a1542a9b5f9b3c6467b3528435@o4508446119624704.ingest.de.sentry.io/4509255200669776',
	tracesSampleRate: 1
});

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

export const handle: Handle = sequence(Sentry.sentryHandle(), handleParaglide);
export const handleError = Sentry.handleErrorWithSentry();
