import { Client } from 'pg';

export function GET() {
	return new Response(typeof Client);
}
