import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig([
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...tseslint.configs.recommended,
	prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},

	globalIgnores(['tests/demo/**', 'tests/old-demo/**', 'tests/new-demo/**']),

	{
		files: ['src/**/*.ts', 'src/**/*.js'],
		ignores: ['*.config.js', '*.config.ts', 'e2e/*.ts'],
		languageOptions: {
			globals: {
				__ADAPTER_TEST_MARKERS__: 'readonly'
			},
			parserOptions: {
				projectService: true,
				tsconfigRootDir: __dirname
			}
		}
	},
	{
		files: [
			'tests/unit/**/*.ts',
			'tests/unit/**/*.js',
			'tests/coverage/**/*.ts',
			'tests/coverage/**/*.js',
			'tests/coverage/**/*.mjs'
		],
		ignores: ['*.config.js', '*.config.ts', 'e2e/*.ts'],
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: __dirname
			}
		}
	},
	{
		files: ['*.config.js', '*.config.ts', 'e2e/*.ts'],
		languageOptions: {
			parserOptions: {
				tsconfigRootDir: __dirname
			}
		}
	}
]);
