import { building, dev } from '$app/env';
import {
	PUBLIC_SENTRY_DSN,
	PUBLIC_SENTRY_ENABLED,
	PUBLIC_SENTRY_ENVIRONMENT,
	PUBLIC_SENTRY_RELEASE
} from '$app/env/public';

export const sentryOptions = {
	dsn: PUBLIC_SENTRY_DSN,
	enabled: !building && PUBLIC_SENTRY_ENABLED,
	environment: PUBLIC_SENTRY_ENVIRONMENT,
	release: PUBLIC_SENTRY_RELEASE,
	tracesSampleRate: dev ? 1.0 : 0.1
};
