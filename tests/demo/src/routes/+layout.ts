import { isSwaCli } from '$lib/swa-env';

// Prerendered pages have issues in the SWA CLI environment, cause it always uses trailing slashes for the prerendered pages.
// There are two ways to address this when debugging/testing locally with the SWA CLI:

// 1. Use 'trailingSlash'
// If this 'trailingSlash' is not used in the lower-level routes, then use it here.
// If you DO use it in the lower-level routes, you will also need to adjust the logic basing on the 'isSwaCli' variable in those routes.
export const trailingSlash = isSwaCli ? 'always' : 'never';
