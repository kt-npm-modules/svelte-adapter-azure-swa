import { dev } from '$app/environment';
import { PUBLIC_SWA } from '$env/static/public';

// we don't need any JS on this page, though we'll load
// it in dev so that we get hot module replacement
export const csr = dev;

// since there's no dynamic data here, we can prerender
// it so that it gets served as a static asset in production
export const prerender = !PUBLIC_SWA; // swa at the moment has issue with serving prerendered assets

console.warn('#'.repeat(100));
console.warn(`SWA: ${PUBLIC_SWA}`);
console.warn(`prerender: ${prerender}`);
console.warn(`csr: ${csr}`);
console.warn('#'.repeat(100));
