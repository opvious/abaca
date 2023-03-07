import {mergeErrorCodes} from '@opvious/stl-errors';

import {errorCodes as routerErrorCodes} from './router/index.js';

export {
  KoaContextsFor,
  KoaDecoder,
  KoaEncoder,
  KoaHandlerFor,
  KoaHandlersFor,
  koaOperationsRouter,
  KoaValuesFor,
} from './router/index.js';

export const errorCodes = mergeErrorCodes({
  router: routerErrorCodes,
});
