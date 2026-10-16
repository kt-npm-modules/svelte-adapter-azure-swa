import { app } from '@azure/functions';

app.http('HelloWorld', {
	methods: ['GET', 'POST'],
	authLevel: 'anonymous',
	handler: async (request, context) => {
		context.log('HelloWorld custom Function');
		const name =
			request.query.get('name') ??
			(request.headers.get('content-type')?.startsWith('application/json')
				? (await request.json()).name
				: undefined);
		return { body: name ? `Hello, ${name}.` : 'Hello from the custom Azure Function.' };
	}
});
