import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { waitForSentryEvent } from './sentry-api';

const expected = {
	eventId: 'a'.repeat(32),
	run: 'unit-request-id',
	release: 'unit-build-release',
	environment: 'unit-environment',
	side: 'client' as const
};
const token = 'unit-secret-not-for-logs';
function event(overrides = {}) {
	return {
		eventID: expected.eventId,
		type: 'error',
		release: { version: expected.release },
		tags: [
			{ key: 'adapter_test_run', value: expected.run },
			{ key: 'adapter_error_side', value: expected.side },
			{ key: 'environment', value: expected.environment }
		],
		entries: [{ type: 'exception', data: { values: [{ value: 'Adapter demo: client error' }] } }],
		...overrides
	};
}
function json(data: unknown, status = 200, headers = {}) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'content-type': 'application/json', ...headers }
	});
}
beforeEach(() => {
	vi.useFakeTimers();
	vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

test('polls transient 404 then verifies the exact event and build metadata', async () => {
	const fetch = vi
		.fn<typeof globalThis.fetch>()
		.mockResolvedValueOnce(json({}, 404))
		.mockResolvedValueOnce(json(event()));
	const pending = waitForSentryEvent(expected, { token, fetch });
	const checked = expect(pending).resolves.toBeUndefined();
	await vi.advanceTimersByTimeAsync(1000);
	await checked;
	expect(fetch).toHaveBeenCalledTimes(2);
	const request = fetch.mock.calls[0][0] as Request;
	expect(request.url).toBe(
		`https://de.sentry.io/api/0/projects/konstantin-tarmyshov/svelte-adapter-azure-swa/events/${expected.eventId}/`
	);
});

test('honors Retry-After before polling again', async () => {
	const fetch = vi
		.fn<typeof globalThis.fetch>()
		.mockResolvedValueOnce(json({}, 429, { 'retry-after': '2' }))
		.mockResolvedValueOnce(json(event()));
	const pending = waitForSentryEvent(expected, { token, fetch });
	const checked = expect(pending).resolves.toBeUndefined();
	await vi.advanceTimersByTimeAsync(1999);
	expect(fetch).toHaveBeenCalledTimes(1);
	await vi.advanceTimersByTimeAsync(1);
	await checked;
	expect(fetch).toHaveBeenCalledTimes(2);
});

test.each([401, 403])('fails immediately on missing event-read access (%s)', async (status) => {
	const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json({ secret: token }, status));
	await expect(waitForSentryEvent(expected, { token, fetch })).rejects.toThrow(
		`returned ${status}; token requires project:read`
	);
	expect(fetch).toHaveBeenCalledTimes(1);
});

test.each([
	{ eventID: 'b'.repeat(32) },
	{ release: { version: 'old-build' } },
	{ tags: [] },
	{ entries: [{ type: 'exception', data: { values: [{ value: 'another error' }] } }] }
])('rejects an old or unrelated event even on HTTP 200', async (overrides) => {
	const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(event(overrides)));
	await expect(waitForSentryEvent(expected, { token, fetch })).rejects.toThrow(
		'identity/build metadata does not match'
	);
});

test('bounds retry time and never exposes network error details', async () => {
	const fetch = vi
		.fn<typeof globalThis.fetch>()
		.mockRejectedValue(new Error(`sensitive request: ${token}`));
	const pending = waitForSentryEvent(expected, { token, fetch, timeoutMs: 2500 });
	const checked = expect(pending).rejects.toThrow(
		'not received within 2500ms (last: network error)'
	);
	await vi.advanceTimersByTimeAsync(2500);
	await checked;
	expect(fetch).toHaveBeenCalledTimes(2);
});
