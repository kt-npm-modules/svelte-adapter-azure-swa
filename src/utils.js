import { relative, resolve, sep } from 'node:path';

/** @type {import('./index.js').sentryRewriteSourcesFactory} */
export function sentryRewriteSourcesFactory(repositoryRoot) {
	const root = resolve(repositoryRoot);
	return (source, _map, context) => {
		if (!context || /^[a-z][a-z\d+.-]*:\/\//i.test(source) || source.startsWith('\0')) {
			return source;
		}
		return relative(root, resolve(context.mapDir, source)).split(sep).join('/');
	};
}
