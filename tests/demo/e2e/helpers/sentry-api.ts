import { createSentryClient } from '@sentry/api';

class ProbeFailure extends Error {}

function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

const eventIdPattern = /^[a-f0-9]{32}$/i;
export const sentryProject = {
	organization_id_or_slug: 'konstantin-tarmyshov',
	project_id_or_slug: 'svelte-adapter-azure-swa'
};

export type ExpectedEvent = {
	eventId: string;
	run: string;
	side: 'client' | 'server';
	release: string;
	environment: string;
};

export async function waitForSentryEvent(
	expected: ExpectedEvent,
	options: { token: string; timeoutMs?: number; fetch?: typeof globalThis.fetch }
): Promise<void> {
	if (!eventIdPattern.test(expected.eventId))
		throw new ProbeFailure('SDK did not return a valid Sentry event_id');
	const timeout = options.timeoutMs ?? 90_000;
	const deadline = Date.now() + timeout;
	const client = createSentryClient({
		baseUrl: 'https://de.sentry.io',
		headers: { Authorization: `Bearer ${options.token}` },
		...(options.fetch ? { fetch: options.fetch } : {})
	});
	let lastStatus: number | string = 'not requested';
	for (let attempt = 0; Date.now() < deadline; attempt++) {
		let retryAfter = 0;
		try {
			const result = await client.getProjectEvent({
				path: { ...sentryProject, event_id: expected.eventId },
				signal: AbortSignal.timeout(Math.max(1, Math.min(10_000, deadline - Date.now())))
			});
			lastStatus = result.response?.status ?? 'network error';
			if (!('error' in result)) {
				// The REST schema is generated; validate the fields this test actually relies on.
				const data = result.data;
				if (!Array.isArray(data.tags) || !Array.isArray(data.entries)) {
					throw new ProbeFailure('Sentry event API returned an invalid event shape');
				}
				const tags = Object.fromEntries(data.tags.map((t) => [t.key, t.value]));
				const release = typeof data.release === 'string' ? data.release : data.release?.version;
				const exception = record(
					data.entries.map(record).find((e) => e.type === 'exception')?.data
				);
				const values = Array.isArray(exception.values) ? exception.values.map(record) : [];
				if (
					data.eventID !== expected.eventId ||
					data.type !== 'error' ||
					!values.some((e) => e.value === `Adapter demo: ${expected.side} error`) ||
					tags.adapter_test_run !== expected.run ||
					tags.adapter_error_side !== expected.side ||
					tags.environment !== expected.environment ||
					release !== expected.release
				) {
					throw new ProbeFailure(
						`Sentry ${expected.side} event identity/build metadata does not match this run`
					);
				}
				console.log(
					`Sentry ${expected.side} event received: ${expected.eventId} (${expected.run})`
				);
				return;
			}
			if (lastStatus === 401 || lastStatus === 403) {
				throw new ProbeFailure(
					`Sentry event API returned ${lastStatus}; token requires project:read for this project`
				);
			}
			if (
				lastStatus !== 404 &&
				lastStatus !== 429 &&
				!(typeof lastStatus === 'number' && lastStatus >= 500) &&
				lastStatus !== 'network error'
			) {
				throw new ProbeFailure(`Sentry event API returned unexpected HTTP ${lastStatus}`);
			}
			const rawRetry = result.response?.headers.get('retry-after');
			if (rawRetry) {
				retryAfter = /^\d+(\.\d+)?$/.test(rawRetry)
					? Number(rawRetry) * 1000
					: Math.max(0, Date.parse(rawRetry) - Date.now());
			}
		} catch (error) {
			// Never expose SDK errors containing request headers, credentials or event payloads.
			if (error instanceof ProbeFailure) throw error;
			lastStatus = 'network error';
		}
		const remaining = deadline - Date.now();
		const delay = Math.max(Math.min(1000 * 2 ** Math.min(attempt, 3), 5000), retryAfter || 0);
		if (remaining <= 0) break;
		await new Promise((resolve) => setTimeout(resolve, Math.min(delay, remaining)));
	}
	throw new ProbeFailure(
		`Sentry ${expected.side} event ${expected.eventId} not received within ${timeout}ms (last: ${lastStatus})`
	);
}
