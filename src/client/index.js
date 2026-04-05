import { globSync } from 'glob';
import { merge } from 'es-toolkit/object';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import sourcemaps from 'rolldown-plugin-sourcemaps';

/**
 * @typedef {import('@sveltejs/kit').Builder} Builder
 * @typedef {import('rolldown').RolldownOptions} RolldownOptions
 * @typedef {import('..').Options} Options
 */

/** @returns {RolldownOptions} */
function defaultRolldownOptions() {
	return {
		external: ['@azure/functions'],
		output: {
			format: 'esm',
			sourcemap: true
		},
		plugins: [sourcemaps({ include: /./ })]
	};
}

/**
 * @param {Builder} builder
 * @param {string} outDir
 * @returns {RolldownOptions}
 */
function prepareRolldownOptions(builder, outDir) {
	const clientDir = builder.getClientDirectory();
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
	/** @type RolldownOptions */
	let _options = {
		input,
		output: {
			dir: outDir
		}
	};
	merge(_options, defaultRolldownOptions());
	return _options;
}

/**
 * @param {Builder} builder
 * @param {string} outDir
 * @param {Options} options
 */
function cleanOutDir(builder, outDir, options) {
	if (options.staticDir !== undefined) {
		// Clean the custom output directory
		builder.log(`Cleaning up custom static output directory: ${outDir}`);
		builder.rimraf(outDir);
	} else if (options.apiDir === undefined) {
		// Clean the default output directory
		builder.rimraf(outDir);
	}
}

/**
 *
 * @param {Builder} builder
 * @param {string} outDir
 * @param {Options} options
 */
export async function bundleClient(builder, outDir, options) {
	cleanOutDir(builder, outDir, options);

	builder.log(`Writing prerendered files to ${outDir}`);
	builder.writePrerendered(outDir);

	builder.log(`Writing client files to ${outDir}`);
	builder.writeClient(outDir);

	builder.log(`[ROLLDOWN]: Re-Bundling client to correct sourcemaps to ${outDir}`);
	const rolldownOptions = prepareRolldownOptions(builder, outDir);
	const bundle = await rolldown(rolldownOptions);
	assert(!Array.isArray(rolldownOptions.output), 'output should not be an array');
	await bundle.write(rolldownOptions.output);
}
