import _ from 'lodash';
import assert from 'node:assert';
import { writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { join } from 'path';
import { rolldown } from 'rolldown';
import sourcemaps from 'rolldown-plugin-sourcemaps';
import { SERVER_FUNC_DIR_NAME } from '../constants.js';

/**
 * @typedef {import('@sveltejs/kit').Builder} Builder
 * @typedef {import('rolldown').RolldownOptions} RolldownOptions
 * @typedef {import('../index.js').Options} Options
 * @typedef {import('../index.js').StaticWebAppConfig} StaticWebAppConfig
 */

const FUNC_ENTRY_FILENAME = 'index.js';
const ENTRY_FILE_PATH = fileURLToPath(new URL('./entry/index.js', import.meta.url));
const TEMPLATE_SERVER_DIR_PATH = fileURLToPath(new URL('./template', import.meta.url));

const REQUIRED_EXTERNAL = ['fsevents', '@azure/functions'];

/** @returns {RolldownOptions} */
function defaultRolldownOptions() {
	return {
		external: REQUIRED_EXTERNAL,
		output: {
			// inlineDynamicImports: true,
			format: 'es',
			sourcemap: true
		},
		plugins: [sourcemaps()]
	};
}
/**
 *
 * @param {Builder} builder
 * @param {string} tmpDir
 * @returns {{
 *   serverDirPath: string;
 *   serverFilePath: string;
 *   serverRelativeDirPath: string;
 *   manifestFilePath: string;
 *   envFilePath: string;
 * }}
 */
function getPaths(builder, tmpDir) {
	// use posix because of https://github.com/sveltejs/kit/pull/3200
	const serverDirPath = builder.getServerDirectory();
	const serverFilePath = join(serverDirPath, 'index.js');
	const serverRelativeDirPath = posix.relative(tmpDir, serverDirPath);
	const manifestFilePath = join(tmpDir, 'manifest.js');
	const envFilePath = join(tmpDir, 'env.js');
	return {
		serverDirPath,
		serverFilePath,
		serverRelativeDirPath,
		manifestFilePath,
		envFilePath
	};
}

/**
 *
 * @param {Builder} builder
 * @param {string} outDir
 * @param {string} tmpDir
 * @param {Options} options
 * @returns {RolldownOptions}
 */
function prepareRolldownOptions(builder, outDir, tmpDir, options) {
	const { serverFilePath, manifestFilePath, envFilePath } = getPaths(builder, tmpDir);

	/** @type RolldownOptions */
	let _options = {
		input: ENTRY_FILE_PATH,
		output: {
			dir: join(outDir, SERVER_FUNC_DIR_NAME),
			entryFileNames: FUNC_ENTRY_FILENAME
		},
		resolve: {
			alias: {
				MANIFEST: manifestFilePath,
				SERVER: serverFilePath,
				ENV: envFilePath
			}
		}
	};
	_options = _.mergeWith(defaultRolldownOptions(), _options, (objValue, srcValue) => {
		if (Array.isArray(objValue) && Array.isArray(srcValue)) {
			return objValue.concat(srcValue);
		}
	});

	/** @type {any} */
	let external = _options.external;
	external = [...(external || []), ...(options.external || [])];
	_options.external = external;
	_options = options.serverRolldown?.(_options) || _options;
	return _options;
}

/**
 * @param {Builder} builder
 * @param {string} outDir
 * @param {Options} options
 */
function cleanOutDir(builder, outDir, options) {
	if (options.apiDir !== undefined && (options.cleanApiDir || true)) {
		const apiFuncDirPath = join(outDir, SERVER_FUNC_DIR_NAME);
		// Clean the custom output directory
		builder.log(`Cleaning up custom Azure Functions output directory: ${apiFuncDirPath}`);
		builder.rimraf(apiFuncDirPath);
	} else if (options.apiDir === undefined) {
		// Clean the default output directory
		builder.rimraf(outDir);
	}
}

/**
 * @param {Builder} builder
 * @param {string} tmpDir
 */
function writeManifest(builder, tmpDir) {
	const { serverRelativeDirPath, manifestFilePath } = getPaths(builder, tmpDir);

	// Write manifest file
	writeFileSync(
		manifestFilePath,
		`export const manifest = ${builder.generateManifest({
			relativePath: serverRelativeDirPath
		})};\n`
	);
}

/**
 * @param {Builder} builder
 * @param {string} tmpDir
 * @param {Options} options
 */
function writeEnvironment(builder, tmpDir, options) {
	const { envFilePath } = getPaths(builder, tmpDir);
	const debug = options.debug || false;
	// Write environment file
	writeFileSync(envFilePath, `export const debug = ${debug.toString()};\n`);
}

/**
 *
 * @param {Builder} builder
 * @param {string} outDir // The output directory for the API
 * @param {string} tmpDir
 * @param {Options} options
 */
export async function bundleServer(builder, outDir, tmpDir, options) {
	// Clean
	cleanOutDir(builder, outDir, options);
	// Manifest
	writeManifest(builder, tmpDir);
	// Environment
	writeEnvironment(builder, tmpDir, options);

	// Generate package.json file
	if (options.apiDir === undefined) {
		// Copy all except the package.json file from the apiFiles directory
		builder.log(`Copying template server files to to ${outDir}`);
		builder.copy(join(TEMPLATE_SERVER_DIR_PATH), outDir, {
			filter: (file) => file !== 'package.json'
		});
		// Now generate package.json file
		const standardPackageJsonPath = join(TEMPLATE_SERVER_DIR_PATH, 'package.json');
		const targetPackageJsonPath = join(outDir, 'package.json');
		if (options.external === undefined) {
			// Copy the standard package.json file
			builder.log(`Copying standard package.json to ${targetPackageJsonPath}`);
			builder.copy(standardPackageJsonPath, targetPackageJsonPath);
		} else {
			builder.log(`Preparing package.json file for Azure Functions in ${outDir}`);
			// An import assertion in a dynamic import
			const packageJson = (await import(standardPackageJsonPath, { with: { type: 'json' } }))
				.default;
			/** @type {Record<string, string>} */
			const dependencies = packageJson.dependencies || {};
			const userPackageJsonPath = join(process.cwd(), 'package.json');
			const userPackageJson = (await import(userPackageJsonPath, { with: { type: 'json' } }))
				.default;
			/** @type {Record<string, string>} */
			const userDependencies = userPackageJson.dependencies || {};
			// from userDependencies, take those defined in options.external and add them to dependencies
			for (const dep of options.external) {
				if (userDependencies[dep]) {
					dependencies[dep] = userDependencies[dep];
					builder.log(`Adding externalized dependency to package.json: ${dep}`);
				}
			}
			// Now write the package.json file
			builder.log(`Writing adjusted package.json to ${targetPackageJsonPath}`);
			writeFileSync(targetPackageJsonPath, JSON.stringify(packageJson, null, 2), 'utf-8');
		}
	}

	// Rolldown the server function
	const functionDirPath = join(outDir, SERVER_FUNC_DIR_NAME);
	builder.log(`[ROLLDOWN]: Building server function to ${functionDirPath}`);
	const rolldownOptions = prepareRolldownOptions(builder, outDir, tmpDir, options);
	const bundle = await rolldown(rolldownOptions);
	assert(!Array.isArray(rolldownOptions.output), 'output should not be an array');
	await bundle.write(rolldownOptions.output);
}
