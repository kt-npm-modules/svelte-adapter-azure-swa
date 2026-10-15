import { dev } from '$app/environment';

// we don't need any JS on this page, though we'll load
// it in dev so that we get hot module replacement
export const csr = dev;

// since there's no dynamic data here, we can prerender
// it so that it gets served as a static asset in production
export const prerender = true;
// swa at the moment has issue with serving prerendered assets
// In about we solve this with selection to prerender = !isSwaCli
// Here we are trying to cover via trailingSlash = isSwaCli ? 'always' : 'never'; in the root layout
