import type { RequestHandler } from './$types';

const respond: RequestHandler = async ({ request }) => {
	const body = await request.text();
	return Response.json({ method: request.method, body });
};

export const GET = respond;
export const POST = respond;
export const PUT = respond;
export const PATCH = respond;
export const DELETE = respond;
export const OPTIONS = respond;
export const HEAD: RequestHandler = () => new Response(null, { headers: { 'x-method': 'HEAD' } });
