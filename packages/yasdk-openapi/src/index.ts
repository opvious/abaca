import {mergeErrorCodes} from '@opvious/stl-errors';

import {loadErrorCodes} from './load.js';
import {resolveErrorCodes} from './resolve.js';
import {validateErrorCodes} from './validate.js';

export {
  allOperationMethods,
  extractOperationDefinitions,
  loadDocument,
  OpenapiDocument,
  OpenapiDocuments,
  OpenapiOperation,
  OpenapiVersion,
  OperationHookEnv,
  OperationHookTarget,
} from './load.js';
export {ReferenceResolver} from './resolve.js';
export {
  InvalidValueError,
  invalidValueError,
  SchemaEnforcer,
  schemaEnforcer,
  ValidationAssertion,
  ValidationPredicate,
  ValidatorsFor,
} from './validate.js';

export const errorCodes = mergeErrorCodes({
  ...loadErrorCodes,
  ...resolveErrorCodes,
  ...validateErrorCodes,
});
