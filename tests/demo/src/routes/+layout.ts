import { PUBLIC_SWA_CLI } from '$app/env/public';

// The local SWA static server serves prerendered directories with trailing slashes.
export const trailingSlash = PUBLIC_SWA_CLI ? 'always' : 'never';
