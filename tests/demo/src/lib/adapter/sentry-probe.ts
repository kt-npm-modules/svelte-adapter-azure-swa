/** A non-secret, per-test correlation nonce; never an authentication credential. */
export function sentryProbeId(value: string | null): string | undefined {
	return value && /^[a-f0-9]{32}$/i.test(value) ? value : undefined;
}
