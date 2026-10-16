import { AsyncLocalStorage } from 'node:async_hooks';
import { flush, type ErrorEvent } from '@sentry/sveltekit';
import type { Handle } from '@sveltejs/kit/hooks';
import { sentryProbeId } from '#lib/adapter/sentry-probe.ts';

type Probe = { run: string; eventId?: string };
const probes = new AsyncLocalStorage<Probe>();

// Observe the SDK's existing capture; never capture a second exception here.
export function observeServerEvent(event: ErrorEvent): ErrorEvent {
	const probe = probes.getStore();
	if (probe && event.exception?.values?.some((e) => e.value === 'Adapter demo: server error')) {
		event.tags = {
			...event.tags,
			adapter_test_run: probe.run,
			adapter_error_side: 'server'
		};
		probe.eventId = event.event_id;
	}
	return event;
}

export const handleSentryProbe: Handle = ({ event, resolve }) => {
	const run = sentryProbeId(event.request.headers.get('x-adapter-sentry-run'));
	if (event.url.pathname !== '/adapter/sentry/error' || !run) {
		return resolve(event);
	}
	return probes.run({ run }, async () => {
		const response = await resolve(event);
		// Ensures beforeSend ran; receipt is independently checked through the REST API.
		await flush(5_000);
		const id = probes.getStore()?.eventId;
		if (id) response.headers.set('x-adapter-sentry-event-id', id);
		return response;
	});
};
