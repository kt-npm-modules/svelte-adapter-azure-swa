import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { globalIgnores } from 'eslint/config';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-eslint';
const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));
const demoGitignorePath = fileURLToPath(new URL('./tests/demo/.gitignore', import.meta.url));
const newDemoGitignorePath = fileURLToPath(new URL('./tests/new-demo/.gitignore', import.meta.url));
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
	includeIgnoreFile(demoGitignorePath),
	includeIgnoreFile(newDemoGitignorePath),
	globalIgnores(['tests/demo', 'tests/old-demo', 'tests/new-demo']),

	// Type-aware linting only where it belongs
	{
		files: ['src/**/*.ts', 'src/**/*.js', 'tests/**/*.ts'],
		ignores: ['*.config.js', '*.config.ts', 'e2e/*.ts'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: __dirname
			}
		}
	},

	// JS unit tests: lint, but without type-aware project service
	{
		files: ['tests/**/*.js'],
		ignores: ['*.config.js', '*.config.ts', 'e2e/*.ts'],
		languageOptions: {
			parserOptions: {
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
