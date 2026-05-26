import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';

/**
 * @param {string} dir directory to search
 * @param {(file: string) => boolean} [filter] filter function to apply to each file
 * @returns {string[]} array of file paths
 */
function list_files(dir, filter) {
	/** @type {string[]} */
	const files = [];

	/**
	 *
	 * @param {string} current current directory path
	 * @returns {void}
	 */
	function walk(current) {
		for (const file of readdirSync(resolve(dir, current))) {
			const child = posix.join(current, file);
			if (statSync(resolve(dir, child)).isDirectory()) {
				walk(child);
			} else {
				if (!filter || filter(child)) {
					files.push(child);
				}
			}
		}
	}

	if (existsSync(dir)) walk('');

	return files;
}

/**
 * @param {string[]} dirs directories to search
 * @param {Console['log']} log logger function
 * @returns {Map<string, string>} Map of source file paths to directory of the source map & js file
 */
function loadMapSource2JSDir(dirs, log) {
	// We need to build map source (from source map files) -> js file directory
	/** @type {string[]} */
	let mapFiles = [];
	dirs.forEach((dir) => {
		mapFiles = mapFiles.concat(
			list_files(dir, (file) => file.endsWith('.js.map')).map((file) => join(dir, file))
		);
	});
	/** @type {Map<string, string>} */
	const mapSource2JSDir = new Map();
	for (const mapFile of mapFiles) {
		const mapFileDir = dirname(mapFile);
		const map = JSON.parse(readFileSync(mapFile, 'utf-8'));
		const sources = map.sources || [];
		for (const source of sources) {
			mapSource2JSDir.set(source, mapFileDir);
		}
	}
	log?.('-'.repeat(80));
	log?.(
		`Found ${mapSource2JSDir.size} sources in ${mapFiles.length} maps in '${dirs.join(', ')}' directories`
	);
	log?.('-'.repeat(80));
	return mapSource2JSDir;
}

/** @type {import('./index.js').sentryRewriteSourcesFactory} */
export function sentryRewriteSourcesFactory(dirs, options = undefined) {
	// We need to build map source (from source map files) -> js file directory
	/** @type {Map<string, string>} */
	let mapSource2JSDir;

	const log = options?.log;
	const prefixDir = options?.prefixDir ?? '';

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	return (source, map) => {
		if (!mapSource2JSDir && log) {
			mapSource2JSDir = loadMapSource2JSDir(dirs, log);
		}
		const mapDir = mapSource2JSDir.get(source);
		if (!mapDir) {
			log?.(`Location of sourcemap for source ${source} not found`);
			return source;
		}
		const newSource = join(prefixDir, join(mapDir, source));
		log?.(`Rewriting source ${source} -> ${newSource}`);
		return newSource;
	};
}
