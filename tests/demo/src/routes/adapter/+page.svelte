<script lang="ts">
	import { resolve } from '$app/paths';
	const scenarios = [
		{ href: resolve('/adapter/platform'), label: 'Platform and authentication' },
		{ href: resolve('/adapter/methods'), label: 'HTTP methods and request bodies' },
		{ href: resolve('/adapter/empty-post-form'), label: 'Empty form POST' },
		{ href: resolve('/adapter/pg-smoke'), label: 'Node/CommonJS import (pg)' },
		{
			href: resolve('/adapter/diagnostic-headers-nav-fallback'),
			label: 'Headers via navigation fallback'
		},
		{ href: resolve('/adapter/diagnostic-headers-rewrite'), label: 'Headers via explicit rewrite' },
		{ href: resolve('/adapter/sentry'), label: 'Sentry client and server errors' }
	];
</script>

<svelte:head><title>Azure SWA adapter scenarios</title></svelte:head>
<h1>Azure SWA adapter scenarios</h1>
<p>Checks for server rendering, Azure request handling and error reporting.</p>
<ul>
	{#each scenarios as scenario (scenario.href)}
		<li><a href={scenario.href}>{scenario.label}</a></li>
	{/each}
</ul>
<p>
	The custom Azure Function is available at <code>/api/HelloWorld</code> under SWA.
</p>
