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
	<p id="empty-post-workaround-marker">
		{form.workaroundMarker ? 'true' : 'false'}
	</p>
{/if}
