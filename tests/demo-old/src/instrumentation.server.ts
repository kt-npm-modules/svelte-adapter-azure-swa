import * as Sentry from '@sentry/sveltekit';

Sentry.init({
	dsn: 'https://322c21a1542a9b5f9b3c6467b3528435@o4508446119624704.ingest.de.sentry.io/4509255200669776',

	tracesSampleRate: 1.0,

	// Enable logs to be sent to Sentry
	enableLogs: true

	// uncomment the line below to enable Spotlight (https://spotlightjs.com)
	// spotlight: import.meta.env.DEV,
});
