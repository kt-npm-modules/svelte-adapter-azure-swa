import { rmSync } from 'node:fs';

/**
 * @typedef {import('@sveltejs/kit').Builder} Builder
 * @typedef {import('../index.js').Options} Options
 */

/**
 * @param {Builder} builder
 * @param {string} outDir
 * @param {Options} options
 */
function cleanOutDir(builder, outDir, options) {
	if (options.staticDir !== undefined) {
		// Clean the custom output directory
		builder.log(`Cleaning up custom static output directory: ${outDir}`);
		rmSync(outDir, { recursive: true, force: true });
	} else if (options.apiDir === undefined) {
		// Clean the default output directory
		rmSync(outDir, { recursive: true, force: true });
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
}
