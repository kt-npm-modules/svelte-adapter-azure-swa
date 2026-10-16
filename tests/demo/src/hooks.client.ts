import * as Sentry from '@sentry/sveltekit';
import { sentryOptions } from '#lib/sentry-options.js';

import { sentryProbeId } from '#lib/adapter/sentry-probe.ts';

Sentry.init({
	...sentryOptions,
	beforeSend(event) {
		const run = sentryProbeId(new URL(window.location.href).searchParams.get('sentry_test_run'));
		if (run && event.exception?.values?.some((e) => e.value === 'Adapter demo: client error')) {
			event.tags = {
				...event.tags,
				adapter_test_run: run,
				adapter_error_side: 'client'
			};
			document.documentElement.dataset.sentryEventId = event.event_id;
		}
		return event;
	}
});

export const handleError = Sentry.handleErrorWithSentry();
