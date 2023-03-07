import {mergeErrorCodes} from '@opvious/stl-errors';

import {errorCodes as routerErrorCodes} from './router/index.js';

export {createOperationsProxy} from './proxy.js';
export {
  createOperationsRouter,
  KoaContextsFor,
  KoaDecoder,
  KoaEncoder,
  KoaHandlerFor,
  KoaHandlersFor,
  KoaValuesFor,
} from './router/index.js';

export const errorCodes = mergeErrorCodes({
  router: routerErrorCodes,
});
