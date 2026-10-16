import { expect, test, vi } from 'vitest';
import type { Handle } from '@sveltejs/kit/hooks';

vi.mock('@sentry/sveltekit', () => ({ flush: vi.fn(async () => true) }));
const { handleSentryProbe, observeServerEvent } = await import('./sentry-e2e');

type Event = Parameters<Handle>[0]['event'];
function request(run = '1'.repeat(32)): Event {
	return {
		url: new URL('http://localhost/adapter/sentry/error'),
		request: new Request('http://localhost/adapter/sentry/error', {
			headers: { 'x-adapter-sentry-run': run }
		})
	} as Event;
}
function captured(id: string) {
	return observeServerEvent({
		type: undefined,
		event_id: id,
		exception: { values: [{ value: 'Adapter demo: server error' }] }
	});
}

test('keeps event IDs isolated across overlapping server requests', async () => {
	let releaseFirst!: () => void;
	const blocked = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});
	const first = handleSentryProbe({
		event: request(),
		resolve: async () => {
			await blocked;
			captured('a'.repeat(32));
			return new Response(null, { status: 500 });
		}
	});
	const second = await handleSentryProbe({
		event: request(),
		resolve: async () => {
			captured('b'.repeat(32));
			return new Response(null, { status: 500 });
		}
	});
	releaseFirst();
	expect(second.headers.get('x-adapter-sentry-event-id')).toBe('b'.repeat(32));
	expect((await first).headers.get('x-adapter-sentry-event-id')).toBe('a'.repeat(32));
});

test('does not expose IDs for a request without the valid per-request test marker', async () => {
	const response = await handleSentryProbe({
		event: request('invalid-run'),
		resolve: async () => {
			const event = captured('c'.repeat(32));
			expect(event.tags).toBeUndefined();
			return new Response(null, { status: 500 });
		}
	});
	expect(response.headers.has('x-adapter-sentry-event-id')).toBe(false);
});
