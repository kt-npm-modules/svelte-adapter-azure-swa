import { isSwaCli } from '$lib/swa-env';

// since there's no dynamic data here, we can prerender
// it so that it gets served as a static asset in production
export const prerender = !isSwaCli; // swa at the moment has issue with serving prerendered assets
