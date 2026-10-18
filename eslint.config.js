import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const gitignorePath = fileURLToPath(new URL('./.gitignore', import.meta.url));

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	globalIgnores(['tests/demo/**', 'tests/unit/fixtures/**', 'src/types/swa-config-gen.d.ts']),
	{
		files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
		extends: [js.configs.recommended, tseslint.configs.recommended],
		languageOptions: {
			globals: globals.node
		}
	},
	prettier
);
