import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { sentryHandle, handleErrorWithSentry } from '@sentry/sveltekit';
import { handleSentryProbe } from '#lib/adapter/server/sentry-e2e.ts';
import { getTextDirection } from '#lib/paraglide/runtime.js';
import { paraglideMiddleware } from '#lib/paraglide/server.js';

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		return resolve(
			{ ...event, request },
			{
				transformPageChunk: ({ html }) =>
					html
						.replace('%paraglide.lang%', locale)
						.replace('%paraglide.dir%', getTextDirection(locale))
			}
		);
	});

export const handle: Handle = sequence(handleSentryProbe, sentryHandle(), handleParaglide);
export const handleError = handleErrorWithSentry();
