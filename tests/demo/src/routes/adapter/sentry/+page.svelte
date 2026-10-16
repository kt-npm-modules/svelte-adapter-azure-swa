<script lang="ts">
	import { resolve } from '$app/paths';
	import { PUBLIC_SENTRY_ENABLED } from '$app/env/public';
	import { onMount } from 'svelte';
	let ready = $state(false);
	let clientStatus = $state('');
	let serverStatus = $state('');
	let pending = $state(false);
	onMount(() => {
		ready = true;
	});

	function throwClientError() {
		clientStatus = 'Client error triggered. Check Sentry for receipt and source locations.';
		throw new Error('Adapter demo: client error');
	}

	async function throwServerError() {
		pending = true;
		serverStatus = '';
		try {
			const response = await fetch(resolve('/adapter/sentry/error'), {
				headers: { accept: 'application/json' }
			});
			serverStatus = `Server response: ${response.status}. Check Sentry for receipt and source locations.`;
		} catch {
			serverStatus = 'The request failed before an HTTP response was received.';
		} finally {
			pending = false;
		}
	}
</script>

<svelte:head><title>Adapter Sentry errors</title></svelte:head>
<h1>Adapter Sentry errors</h1>
<p>Trigger each error separately, then check its stack trace in Sentry.</p>
{#if !PUBLIC_SENTRY_ENABLED}
	<p>SDK reporting is disabled in this build. The errors still run for local tests.</p>
{/if}
<button type="button" onclick={throwClientError} disabled={!ready}>Trigger client error</button>
<p role="status" data-testid="client-status">{clientStatus}</p>
<button type="button" onclick={throwServerError} disabled={!ready || pending}
	>Trigger server error</button
>
<p role="status" data-testid="server-status">{serverStatus}</p>
<p>
	<a
		href="https://konstantin-tarmyshov.sentry.io/issues/?project=4509255200669776"
		target="_blank"
		rel="noreferrer">Open Sentry issues</a
	>
</p>

<style>
	button {
		align-self: flex-start;
		padding: 0.75rem 1.25rem;
		border: 1px solid #493178;
		border-radius: 0.5rem;
		background: #62429b;
		color: #fff;
		font-weight: 600;
		line-height: 1.25;
		box-shadow: 0 2px 3px rgb(0 0 0 / 0.15);
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: #493178;
	}

	button:active:not(:disabled) {
		box-shadow: none;
	}

	button:focus-visible {
		outline: 3px solid #493178;
		outline-offset: 3px;
	}

	button:disabled {
		opacity: 0.5;
		box-shadow: none;
		cursor: not-allowed;
	}
</style>
