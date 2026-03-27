import { HttpRequestUser, InvocationContext } from '@azure/functions';
import { Adapter } from '@sveltejs/kit';
import { RollupOptions } from 'rollup';
import { ClientPrincipal, ClientPrincipalWithClaims, CustomStaticWebAppConfig } from './types/swa';

export * from './types/swa';

type ExternalOption = string[];

type EmulateRole = 'anonymous' | 'authenticated';
export type EmulateOptions = {
	role?: EmulateRole;
	clientPrincipal?: ClientPrincipal | ClientPrincipalWithClaims;
};

type AdjustRollupInputOptionsFunction = (options: RollupOptions) => RollupOptions;

export type Options = {
	debug?: boolean;
	apiDir?: string;
	staticDir?: string;
	external?: ExternalOption;
	customStaticWebAppConfig?: CustomStaticWebAppConfig;
	allowReservedSwaRoutes?: boolean;
	emulate?: EmulateOptions;
	// Advanced options
	serverRollup?: AdjustRollupInputOptionsFunction;
};

export default function plugin(options?: Options): Adapter;

// Sentry
type SentryOptions = {
	prefixDir?: string;
	log?: Console['log'];
};
export declare function sentryRewriteSourcesFactory(
	dirs: string[],
	options?: SentryOptions
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): (source: string, map: any) => string;

declare global {
	namespace App {
		export interface Platform {
			/**
			 * Client Principal as passed from Azure
			 *
			 * @remarks
			 *
			 * Due to a possible in bug in SWA, the client principal is only passed
			 * to the render function on routes specifically designated as
			 * protected. Protected in this case means that the `allowedRoles`
			 * field is populated and does not contain the `anonymous` role.
			 *
			 * @see The {@link https://learn.microsoft.com/en-us/azure/static-web-apps/user-information?tabs=javascript#api-functions SWA documentation}
			 */

			/**
			 * The Azure function request context.
			 *
			 * @see The {@link https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-node#context-object Azure function documentation}
			 */
			context: InvocationContext;

			user: HttpRequestUser | null;

			clientPrincipal: ClientPrincipal | ClientPrincipalWithClaims | null;
		}
	}
}
