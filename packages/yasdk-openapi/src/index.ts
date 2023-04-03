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
export {ReferenceResolver, ResolutionIssue} from './resolve.js';
export {
  assertValue,
  InvalidValueError,
  invalidValueError,
  SchemaEnforcer,
  schemaEnforcer,
  ValidationPredicate,
  ValidatorsFor,
} from './validate.js';

export const errorCodes = mergeErrorCodes({
  ...loadErrorCodes,
  ...resolveErrorCodes,
  ...validateErrorCodes,
});
