import { writeFileSync } from 'fs';
import { SERVER_FUNC_DIR_NAME } from '../constants.js';

/**
 * @typedef {import('@sveltejs/kit').Builder} Builder
 * @typedef {import('rolldown').RolldownOptions} RolldownOptions
 * @typedef {import('../index.js').Options} Options
 * @typedef {import('../index.js').StaticWebAppConfig} StaticWebAppConfig
 */

const SSR_FUNC_ROUTE = `/api/${SERVER_FUNC_DIR_NAME}`;

/**
 * Validate the static web app configuration does not override the minimum config for the adapter to work correctly.
 * @param {import('../types/swa.js').CustomStaticWebAppConfig} config
 * */
function validateCustomConfig(config) {
	if ('navigationFallback' in config) {
		throw new Error('customStaticWebAppConfig cannot override navigationFallback.');
	}
	if (config.routes?.some((route) => route.route === '*')) {
		throw new Error(`customStaticWebAppConfig cannot override '*' route.`);
	}
}

/**
 * @param {import('../types/swa.js').CustomStaticWebAppConfig} customStaticWebAppConfig
 * @param {string} appDir
 * @returns {import('../types/swa.js').StaticWebAppConfig}
 */
export function generateConfig(customStaticWebAppConfig, appDir) {
	validateCustomConfig(customStaticWebAppConfig);

	customStaticWebAppConfig.routes = customStaticWebAppConfig.routes || [];

	/** @type {import('../types/swa.js').StaticWebAppConfig} */
	const swaConfig = {
		...customStaticWebAppConfig,
		routes: [
			...customStaticWebAppConfig.routes,
			{
				route: '/api/*'
			},
			{
				route: '/data-api/*'
			},
			{
				route: '*',
				methods: ['POST', 'PUT', 'DELETE'],
				rewrite: SSR_FUNC_ROUTE
			},
			{
				route: `/${appDir}/immutable/*`,
				headers: {
					'cache-control': 'public, immutable, max-age=31536000'
				}
			}
		],
		navigationFallback: {
			rewrite: SSR_FUNC_ROUTE
		},
		platform: {
			apiRuntime: 'node:20',
			...customStaticWebAppConfig.platform
		}
	};

	return swaConfig;
}

/**
 *
 * @param {Builder} builder
 * @param {string} outDir
 * @param {Options} options
 */
export async function writeSWAConfig(builder, outDir, options) {
	builder.log(`Writing staticwebapp.config.json to ${outDir}`);

	let swaConfig = options.customStaticWebAppConfig || {};
	swaConfig = generateConfig(swaConfig, builder.config.kit.appDir);

	if (!builder.prerendered.paths.includes('/')) {
		// Azure SWA requires an index.html to be present
		// If the root was not pre-rendered, add a placeholder index.html
		// Route all requests for the index to the SSR function
		writeFileSync(`${outDir}/index.html`, '');
		swaConfig.routes.push(
			{
				route: '/index.html',
				rewrite: SSR_FUNC_ROUTE
			},
			{
				route: '/',
				rewrite: SSR_FUNC_ROUTE
			}
		);
	}

	writeFileSync(`${outDir}/staticwebapp.config.json`, JSON.stringify(swaConfig, null, 2));
}
