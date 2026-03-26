import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { globalIgnores } from 'eslint/config';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default ts.config(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	...ts.configs.recommended,
	prettier,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},

	globalIgnores(['tests/demo', 'tests/old-demo', 'tests/new-demo']),

	// Type-aware linting only where it belongs
	{
		files: ['src/**/*.ts', 'src/**/*.js', 'tests/unit/**/*.ts', 'tests/unit/**/*.js'],
		ignores: ['*.config.js', '*.config.ts', 'e2e/*.ts'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: __dirname
			}
		}
	},

	{
		// Config files and e2e tests - basic linting without type-checking
		files: ['*.config.js', '*.config.ts', 'e2e/*.ts'],

		languageOptions: {
			parserOptions: {
				tsconfigRootDir: __dirname
			}
		}
	}
);
