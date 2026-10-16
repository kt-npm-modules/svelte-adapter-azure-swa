import { HttpRequestUser, InvocationContext } from '@azure/functions';
import { Adapter } from '@sveltejs/kit';
import { RolldownOptions } from 'rolldown';
import {
	ClientPrincipal,
	ClientPrincipalWithClaims,
	CustomStaticWebAppConfig
} from './types/swa.js';

export * from './types/swa.js';

type ExternalOption = string[];

type EmulateRole = 'anonymous' | 'authenticated';
export type EmulateState = {
	/** Creates the default test user when authenticated and clientPrincipal is omitted. */
	role?: EmulateRole;
	/** Overrides role; null explicitly emulates a logged-out user. */
	clientPrincipal?: ClientPrincipal | ClientPrincipalWithClaims | null;
};

/** A static state or a synchronous provider evaluated on each platform-emulation call. */
export type EmulateOptions = EmulateState | (() => EmulateState);

type AdjustRolldownInputOptionsFunction = (options: RolldownOptions) => RolldownOptions;

export type Options = {
	debug?: boolean;
	testWorkarounds?: boolean;
	preserveAuthorization?: boolean;
	apiDir?: string;
	staticDir?: string;
	external?: ExternalOption;
	customStaticWebAppConfig?: CustomStaticWebAppConfig;
	allowReservedSwaRoutes?: boolean;
	emulate?: EmulateOptions;
	// Advanced options
	serverRolldown?: AdjustRolldownInputOptionsFunction;
};

export default function plugin(options?: Options): Adapter;

/** Create a Sentry source-path hook relative to a repository root (absolute or cwd-relative).
 * Requires Sentry's native mapDir context; no output scanning or caching is performed.
 */
export declare function sentryRewriteSourcesFactory(
	repositoryRoot: string
): (source: string, map: unknown, context?: { mapDir: string }) => string;

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
