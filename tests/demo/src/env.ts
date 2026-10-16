import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	PUBLIC_SWA_CLI: {
		public: true,
		static: true,
		schema: (value) => value === 'true'
	}
});
