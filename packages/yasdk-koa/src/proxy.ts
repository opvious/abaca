import Router from '@koa/router';
import {assert} from '@opvious/stl-errors';
import {firstElement} from '@opvious/stl-utils/arrays';
import {MarkPresent} from '@opvious/stl-utils/objects';
import events from 'events';
import ProxyServer from 'http-proxy';
import Koa from 'koa';
import {
  allOperationMethods,
  OpenapiDocument,
  OpenapiOperation,
} from 'yasdk-openapi';

import {routerPath} from './common.js';

/** Creates a proxy for OpenAPI operations. */
export function createOperationsProxy<
  D extends OpenapiDocument,
  U extends Record<string, ProxyServer.ServerOptions>
>(args: {
  /** OpenAPI document. */
  readonly doc: D;

  /** Upstream server options. */
  readonly upstreams: U;

  /**
   * Maps operations to upstream key. Unmapped operations are not proxied.
   * Operations without an ID or with `trace` method are always skipped.
   */
  readonly dispatch: (
    op: MarkPresent<OpenapiOperation<D>, 'operationId'>,
    path: string
  ) => (keyof U & string) | undefined;

  /**
   * Optional setup for newly created proxy serverss. Use this for example to
   * set up error handling.
   */
  readonly setup?: (server: ProxyServer, key: keyof U & string) => void;

  /**
   * Proxy OPTIONS requests for all operations, even if one is not declared
   * explicitly. This can be useful to support CORS. An error will be thrown if
   * a single path is mapped to multiple upstreams.
   */
  readonly proxyOptionsRequests?: boolean;
}): Koa.Middleware {
  const middlewares = new Map<string, Koa.Middleware>();
  const middlewareFor = (key: string): Koa.Middleware => {
    let mw = middlewares.get(key);
    if (mw) {
      return mw;
    }
    const server = ProxyServer.createProxy(args.upstreams[key]);
    args.setup?.(server, key);
    mw = async (ctx): Promise<void> => {
      server.web(ctx.req, ctx.res);
      await events.once(ctx.res, 'close');
    };
    middlewares.set(key, mw);
    return mw;
  };

  const router = new Router<any, any>();
  for (const [path, pathObj] of Object.entries<any>(args.doc.paths ?? {})) {
    const opPath = routerPath(path);
    const keys = new Set<string>();
    for (const meth of allOperationMethods) {
      const opObj = pathObj[meth];
      const opId = opObj?.operationId;
      if (!opId || meth === 'trace') {
        continue;
      }
      const key = args.dispatch(opObj, path);
      if (key == null) {
        continue;
      }
      keys.add(key);
      router[meth](opId, opPath, middlewareFor(key));
    }
    if (args.proxyOptionsRequests && !pathObj['options'] && keys.size) {
      assert(
        keys.size === 1,
        'Cannot add OPTIONS handler for path with multiple upstreams (%s)',
        path
      );
      router.options(opPath, middlewareFor(firstElement(keys)!));
    }
  }
  return router.routes();
}
