import Router from '@koa/router';
import {MarkPresent} from '@opvious/stl-utils/objects';
import events from 'events';
import ProxyServer from 'http-proxy';
import Koa from 'koa';
import koaCompose from 'koa-compose';
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
}): Koa.Middleware {
  const proxies = new Map<string, ProxyServer>();
  const proxyFor = (key: string): ProxyServer => {
    let server = proxies.get(key);
    if (server) {
      return server;
    }
    server = ProxyServer.createProxy(args.upstreams[key]);
    args.setup?.(server, key);
    proxies.set(key, server);
    return server;
  };

  const router = new Router<any, any>();
  for (const [path, pathObj] of Object.entries<any>(args.doc.paths ?? {})) {
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
      const proxy = proxyFor(key);
      router[meth](opId, routerPath(path), async (ctx) => {
        proxy.web(ctx.req, ctx.res);
        await events.once(ctx.res, 'close');
      });
    }
  }
  return koaCompose([router.allowedMethods(), router.routes()]);
}
