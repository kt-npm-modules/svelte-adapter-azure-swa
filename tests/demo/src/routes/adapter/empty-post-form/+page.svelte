<script lang="ts">
	import type { PageProps } from './$types';
	let { form }: PageProps = $props();
</script>

<svelte:head><title>Empty form POST</title></svelte:head>
<h1>Empty form POST</h1>
<form method="POST">
	<button id="empty-post-submit" type="submit">Submit empty POST</button>
</form>
{#if form?.success}
	<p id="empty-post-success">success</p>
	<p>
		Adapter diagnostics: <span id="workarounds-info-marker"
			>{String(form.workaroundInfoPresent)}</span
		>
	</p>
	<p>
		Empty POST workaround: <span id="empty-post-workaround-marker"
			>{String(form.emptyPostWorkaround)}</span
		>
	</p>
{/if}
