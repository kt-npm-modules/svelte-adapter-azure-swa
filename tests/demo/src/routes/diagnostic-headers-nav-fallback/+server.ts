import { diagnose, factsToDiagHeaders } from '$lib/diagnose';
import type { RequestHandler } from './$types';

/**
 * SAFETY-BY-DESIGN diagnostic probe — see
 * openspec/changes/forwarded-headers-diagnostics/specs/demo-diagnostics/spec.md.
 *
 * Returns ONLY sanitized facts computed server-side via `diagnose(event)`:
 * booleans, closed-enum classifications, fail-closed scheme tokens, and
 * non-secret server-generated identifiers. The route never returns raw
 * `Authorization`, raw cookies, raw client principals, raw tokens, full
 * URLs with host/query, or arbitrary unknown header values.
 *
 * Per-method delivery (Decision 7):
 *   HEAD                       → empty body, sanitized facts as `x-diag-*` headers.
 *   GET/POST/PUT/PATCH/DELETE/OPTIONS → JSON body of the facts; no `x-diag-*` headers.
 */

const respondJson: RequestHandler = (event) => {
	const facts = diagnose(event);
	return new Response(JSON.stringify(facts), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
};

const respondHead: RequestHandler = (event) => {
	const facts = diagnose(event);
	const diagHeaders = factsToDiagHeaders(facts);
	const headers = new Headers();
	for (const [name, value] of Object.entries(diagHeaders)) headers.set(name, value);
	// HEAD MUST NOT include a message body (RFC 9110 §9.3.2).
	return new Response(null, { status: 200, headers });
};

export const GET: RequestHandler = respondJson;
export const HEAD: RequestHandler = respondHead;
export const POST: RequestHandler = respondJson;
export const PUT: RequestHandler = respondJson;
export const PATCH: RequestHandler = respondJson;
export const DELETE: RequestHandler = respondJson;
export const OPTIONS: RequestHandler = respondJson;
