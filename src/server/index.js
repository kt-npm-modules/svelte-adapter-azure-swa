import { cloneDeep, mergeWith } from 'es-toolkit/object';
import assert from 'node:assert';
import { rmSync, writeFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
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

const ENTRY_FILE_PATH = fileURLToPath(new URL('./entry/entry.js', import.meta.url));
const WRAPPER_INDEX_FILE_PATH = fileURLToPath(new URL('./entry/index.js', import.meta.url));
const TEMPLATE_SERVER_DIR_PATH = fileURLToPath(new URL('./template', import.meta.url));

const REQUIRED_EXTERNAL = ['fsevents', '@azure/functions'];

/**
 * @returns {import('rolldown').Plugin}
 */
function prefixBuiltinModules() {
	return {
		name: 'prefix-built-in-modules',
		resolveId(source) {
			if (builtinModules.includes(source)) {
				return { id: 'node:' + source, external: true };
			} else if (source.startsWith('node:')) {
				return { id: source, external: true };
			}
		}
	};
}

/** @returns {RolldownOptions} */
function defaultRolldownOptions() {
	return {
		platform: 'node',
		external: REQUIRED_EXTERNAL,
		output: {
			// inlineDynamicImports: true,
			format: 'es',
			sourcemap: true
		},
		plugins: [
			sourcemaps({ include: /./ }),
			// Adapted from @sveltejs/adapter-node
			// https://github.com/sveltejs/kit/blob/version-3/packages/adapter-node/rolldown.config.js
			prefixBuiltinModules()
		]
	};
}
/**
 *
 * @param {string} tmpDir
 * @returns {{
 *   serverInstanceFilePath: string;
 *   envFilePath: string;
 * }}
 */
function getPaths(tmpDir) {
	const serverInstanceFilePath = join(tmpDir, 'server-instance.js');
	const envFilePath = join(tmpDir, 'env.js');
	return {
		serverInstanceFilePath,
		envFilePath
	};
}

/**
 *
 * @param {Builder} builder
 * @param {string} outDir
 * @param {string} tmpDir
 * @param {Options} options
 * @param {string | undefined} initializer
 * @returns {RolldownOptions}
 */
function prepareRolldownOptions(builder, outDir, tmpDir, options, initializer) {
	const { serverInstanceFilePath, envFilePath } = getPaths(tmpDir);

	/** @type {Record<string, string>} */
	const input = {
		entry: ENTRY_FILE_PATH,
		index: WRAPPER_INDEX_FILE_PATH
	};
	if (initializer) {
		input['instrumentation-init'] = initializer;
		input['instrumentation.server'] = join(
			builder.getServerDirectory(),
			'instrumentation.server.js'
		);
	}
	/** @type RolldownOptions */
	let _options = {
		input,
		output: {
			dir: join(outDir, SERVER_FUNC_DIR_NAME),
			entryFileNames: '[name].js'
		},
		resolve: {
			alias: {
				SERVER_INSTANCE: serverInstanceFilePath,
				ENV: envFilePath
			}
		}
	};
	mergeWith(_options, defaultRolldownOptions(), (objValue, srcValue) => {
		if (Array.isArray(objValue) && Array.isArray(srcValue)) {
			return objValue.concat(srcValue);
		}
	});

	/** @type {any} */
	let external = _options.external;
	external = [...(external || []), ...(options.external || [])];
	_options.external = external;
	const _savedOutput = cloneDeep(_options.output);
	// Keep adapter-owned values independent of callback mutations.
	const requiredInput = { ...input };
	const requiredAliases = { SERVER_INSTANCE: serverInstanceFilePath, ENV: envFilePath };
	if (options.serverRolldown) {
		const adjustedOptions = options.serverRolldown(cloneDeep(_options));
		if (!adjustedOptions || typeof adjustedOptions !== 'object' || Array.isArray(adjustedOptions)) {
			throw new Error(
				'serverRolldown must explicitly return a RolldownOptions configuration object. Return the provided configuration after modifying it, or return a replacement object; mutation without a return value is not supported.'
			);
		}
		_options = adjustedOptions;
	}
	for (const [name, expected] of Object.entries(requiredInput)) {
		const input = _options.input;
		if (!input || typeof input !== 'object' || Array.isArray(input) || input[name] !== expected) {
			throw new Error(
				`serverRolldown must preserve adapter-owned input[${JSON.stringify(name)}] as ${JSON.stringify(expected)}. Keep the supplied entrypoints when customizing the configuration.`
			);
		}
	}
	for (const [name, expected] of Object.entries(requiredAliases)) {
		const alias = _options.resolve?.alias?.[name];
		const value = Array.isArray(alias) && alias.length === 1 ? alias[0] : alias;
		if (value !== expected) {
			throw new Error(
				`serverRolldown must preserve adapter-owned resolve.alias.${name} as ${JSON.stringify(expected)}. Keep the supplied aliases when customizing the configuration.`
			);
		}
	}
	_options.output = _savedOutput;
	return _options;
}

/**
 * @param {Builder} builder
 * @param {string} outDir
 * @param {Options} options
 */
function cleanOutDir(builder, outDir, options) {
	if (options.apiDir !== undefined) {
		const apiFuncDirPath = join(outDir, SERVER_FUNC_DIR_NAME);
		// Clean the custom output directory
		builder.log(`Cleaning up custom Azure Functions output directory: ${apiFuncDirPath}`);
		rmSync(apiFuncDirPath, { recursive: true, force: true });
	} else if (options.apiDir === undefined) {
		// Clean the default output directory
		rmSync(outDir, { recursive: true, force: true });
	}
}

/**
 * @param {string} tmpDir
 * @param {Options} options
 */
function writeEnvironment(tmpDir, options) {
	const { envFilePath } = getPaths(tmpDir);
	const debug = options.debug ?? false;
	const testWorkarounds = options.testWorkarounds ?? false;
	const preserveAuthorization = options.preserveAuthorization ?? false;
	// Write environment file
	writeFileSync(
		envFilePath,
		[
			`export const debug = ${debug.toString()};`,
			`export const testWorkarounds = ${testWorkarounds.toString()};`,
			`export const preserveAuthorization = ${preserveAuthorization.toString()};`
		].join('\n')
	);
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
	// SvelteKit 3 generates the server instance and its manifest together.
	builder.generateServerInstance(getPaths(tmpDir).serverInstanceFilePath);
	// Environment
	writeEnvironment(tmpDir, options);
	const initializer = builder.hasServerInstrumentationFile()
		? builder.createInstrumentationInitializer({ outputDirectory: tmpDir })
		: undefined;

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
	const rolldownOptions = prepareRolldownOptions(builder, outDir, tmpDir, options, initializer);
	const bundle = await rolldown(rolldownOptions);
	assert(!Array.isArray(rolldownOptions.output), 'output should not be an array');
	await bundle.write(rolldownOptions.output);
	if (initializer) {
		builder.instrument({
			entrypoint: join(functionDirPath, 'index.js'),
			instrumentation: join(functionDirPath, 'instrumentation.server.js'),
			initializer: join(functionDirPath, 'instrumentation-init.js'),
			module: { exports: [] }
		});
	}
}
