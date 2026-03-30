import { PUBLIC_SWA_CLI } from '$env/static/public';

console.warn('#'.repeat(100));
console.warn(`SWA: ${PUBLIC_SWA_CLI}`);
console.warn('#'.repeat(100));

export const isSwaCli = PUBLIC_SWA_CLI === 'true';
