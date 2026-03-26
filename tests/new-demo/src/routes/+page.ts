import { PUBLIC_SWA } from '$env/static/public';

// since there's no dynamic data here, we can prerender
// it so that it gets served as a static asset in production
export const prerender = !PUBLIC_SWA; // swa at the moment has issue with serving prerendered assets

console.warn('#'.repeat(100));
console.warn(`SWA: ${PUBLIC_SWA}`);
console.warn(`prerender: ${prerender}`);
console.warn('#'.repeat(100));
