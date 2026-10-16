import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	PUBLIC_SENTRY_DSN: {
		public: true,
		static: true,
		schema: (value) =>
			value ??
			'https://322c21a1542a9b5f9b3c6467b3528435@o4508446119624704.ingest.de.sentry.io/4509255200669776'
	},
	PUBLIC_SENTRY_ENABLED: {
		public: true,
		static: true,
		schema: (value) => value !== 'false'
	},
	PUBLIC_SENTRY_ENVIRONMENT: {
		public: true,
		static: true,
		schema: (value) => value || 'demo'
	},
	PUBLIC_SENTRY_RELEASE: {
		public: true,
		static: true,
		schema: (value) => value || undefined
	},
	PUBLIC_SWA_CLI: {
		public: true,
		static: true,
		schema: (value) => value === 'true'
	}
});
