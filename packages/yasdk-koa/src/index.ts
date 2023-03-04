import {mergeErrorCodes} from '@opvious/stl-errors';

import {errorCodes as routerErrorCodes} from './router/index.js';

export {
  KoaContextsFor,
  KoaDecoder,
  KoaEncoder,
  KoaHandlerFor,
  KoaHandlersFor,
  KoaValuesFor,
  operationsRouter,
} from './router/index.js';

export const errorCodes = mergeErrorCodes({
  router: routerErrorCodes,
});
