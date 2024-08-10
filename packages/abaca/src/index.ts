import {JSON_MIME_TYPE} from './mime-types.js';

export * from './common.js';
export * from './config.js';
export * from './mime-types.js';
export * from './openapi/index.js';
export * from './operations.js';

// Defaults to use in the preamble template. They are defined here (v.s. one of
// the files exported above) to not be embedded in the generated preamble since
// they are replaced by a CLI-provided default.
export const DEFAULT_ACCEPT = 'application/json;q=1, text/*;q=0.5';
export const DEFAULT_CONTENT_TYPE = JSON_MIME_TYPE;
