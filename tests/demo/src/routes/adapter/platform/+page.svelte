<script lang="ts">
	import type { PageProps } from './$types';
	let { data }: PageProps = $props();
</script>

<svelte:head><title>Adapter platform</title></svelte:head>
<h1>Adapter platform</h1>
<p>Selected user, principal and invocation facts for this request.</p>
<pre data-testid="platform-facts">{JSON.stringify(data, null, 2)}</pre>
