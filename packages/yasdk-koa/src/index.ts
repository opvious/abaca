import Koa from 'koa';
import Router from '@koa/router';
import {OpenapiDocument} from 'yasdk-openapi';
import {OperationTypes} from 'yasdk-openapi/preamble';

import {HandlersFor} from './handlers.js';

export function operationsRouter<O extends OperationTypes<keyof O & string>, S = {}>(_args: {
  readonly doc: OpenapiDocument;
  readonly handlers: HandlersFor<O, S>;
  // readonly decoders?: DecodersFor<O, S>;
  // readonly encoders?: EncodersFor<O, S>;
}): Router<S> {
  const router = new Router<any, any>();
  return router;
}

// Convert paths
// 
