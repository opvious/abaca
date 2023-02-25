import Koa from 'koa';
import Router from '@koa/router';
import {OpenapiDocument} from 'yasdk-openapi';

export function operationsRouter<_O, S, _C>(_args: {
  readonly doc: OpenapiDocument;
  // readonly handlers: HandlersFor<O, S>;
  // readonly decoders?: DecodersFor<O, S>;
  // readonly encoders?: EncodersFor<O, S>;
}): Router<S> {
  const router = new Router<any, any>();
  return router;
}

// Convert paths
// 
