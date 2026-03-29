<script lang="ts">
	import type { ActionData } from './$types';

	export let form: ActionData;
</script>

<form method="POST">
	<button id="empty-post-submit" type="submit">Submit empty POST</button>
</form>

{#if form?.success}
	<p id="empty-post-success">success</p>
{/if}

{#if form}
	<p id="workarounds-info-marker">
		{form.workaroundsInfo ? 'true' : 'false'}
	</p>
	<p id="empty-post-workaround-marker">
		{form.workaroundsInfo?.emptyPostWorkaround ? 'true' : 'false'}
	</p>
{/if}
