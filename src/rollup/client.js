import { globSync } from 'glob';
import _ from 'lodash';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { join } from 'path';
import { rollup } from 'rollup';
import sourcemaps from 'rollup-plugin-sourcemaps2';

/**
 * @typedef {import('@sveltejs/kit').Builder} Builder
 * @typedef {import('rollup').RollupOptions} RollupOptions
 * @typedef {import('..').Options} Options
 */

/** @returns {RollupOptions} */
function defaultRollupOptions() {
	return {
		external: ['@azure/functions'],
		output: {
			format: 'esm',
			sourcemap: true
		},
		plugins: [sourcemaps()]
	};
}

export const staticClientDir = 'static';

/**
 * @param {Builder} builder
 * @param {string} outDir
 * @param {Options} options
 * @returns {RollupOptions}
 */
function prepareRollupOptions(builder, outDir, options) {
	const clientDir = builder.getClientDirectory();
	const _outputDir = options.staticDir || join(outDir, staticClientDir);
	const input = Object.fromEntries(
		globSync(`${clientDir}/**/*.js`).map((file) => [
			// This removes `src/` as well as the file extension from each
			// file, so e.g. src/nested/foo.js becomes nested/foo
			path.relative(clientDir, file.slice(0, file.length - path.extname(file).length)),
			// This expands the relative paths to absolute paths, so e.g.
			// src/nested/foo becomes /project/src/nested/foo.js
			fileURLToPath(new URL(file, import.meta.url))
		])
	);
	/** @type RollupOptions */
	let _options = {
		input,
		output: {
			dir: _outputDir
		}
	};
	_options = _.merge(defaultRollupOptions(), _options);
	return _options;
}

/**
 *
 * @param {Builder} builder
 * @param {string} outputDir
 * @param {Options} options
 */
export async function rollupClient(builder, outputDir, options) {
	const _outputClientDir = options.staticDir || join(outputDir, staticClientDir);

	builder.log(`Writing prerendered files to ${_outputClientDir}`);
	builder.writePrerendered(_outputClientDir);

	builder.log(`Writing client files to ${_outputClientDir}`);
	builder.writeClient(_outputClientDir);

	builder.log(`ROLLUP: Re-Building client to ${_outputClientDir}`);
	const rollupOptions = prepareRollupOptions(builder, outputDir, options);
	const bundle = await rollup(rollupOptions);
	assert(!Array.isArray(rollupOptions.output), 'output should not be an array');
	await bundle.write(rollupOptions.output);
}
