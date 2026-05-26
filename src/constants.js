import { join } from 'node:path';

export const DEFAULT_OUT_DIR_PATH = 'build';
export const CLIENT_DEFAULT_OUT_DIR_PATH = join(DEFAULT_OUT_DIR_PATH, 'static');
export const SERVER_DEFAULT_OUT_DIR_PATH = join(DEFAULT_OUT_DIR_PATH, 'server');
export const SERVER_FUNC_DIR_NAME = 'sk_render';
