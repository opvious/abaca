import Router from '@koa/router';
import {assert} from '@opvious/stl-errors';
import {instrumentsFor, noopTelemetry, Telemetry} from '@opvious/stl-telemetry';
import {ArrayMultimap, firstElement} from '@opvious/stl-utils/collections';
import {MarkPresent} from '@opvious/stl-utils/objects';
import events from 'events';
import ProxyServer from 'http-proxy';
import Koa from 'koa';
import {
  allOperationMethods,
  OpenapiDocument,
  OpenapiOperation,
} from 'yasdk-openapi';

import {packageInfo, routerPath} from './common.js';

const instruments = instrumentsFor({
  operationProxyTime: {
    name: 'yasdk.koa.operations.proxy_time',
    kind: 'histogram',
    unit: 'ms',
    labels: {id: 'id', status: 'http.status_code', upstream: 'upstream'},
  },
});

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

  /** Telemetry provider. */
  readonly telemetry?: Telemetry;

  /**
   * Proxy OPTIONS requests for all operations, even if one is not declared
   * explicitly. This can be useful to support CORS. An error will be thrown if
   * a single path is mapped to multiple upstreams.
   */
  readonly proxyOptionsRequests?: boolean;
}): Koa.Middleware {
  const tel = args.telemetry?.via(packageInfo) ?? noopTelemetry();
  const [metrics] = tel.metrics(instruments);

  const middlewares = new Map<string, Koa.Middleware>();
  const middlewareFor = (key: string): Koa.Middleware => {
    let mw = middlewares.get(key);
    if (mw) {
      return mw;
    }
    const server = ProxyServer.createProxy(args.upstreams[key]);
    args.setup?.(server, key);
    mw = async (ctx): Promise<void> => {
      const oid = ctx._matchedRouteName;
      assert(typeof oid == 'string', 'Missing operation ID');
      tel.logger.debug('Proxying operation %s... [upstream=%s]', oid, key);
      const startMs = Date.now();
      try {
        server.web(ctx.req, ctx.res);
        await events.once(ctx.res, 'close');
      } finally {
        const latency = Date.now() - startMs;
        const {status} = ctx.response;
        tel.logger.info(
          'Proxied operation %s. [upstream=%s, status=%s, ms=%s]',
          oid,
          key,
          status,
          latency
        );
        metrics.operationProxyTime.record(latency, {
          id: oid,
          status,
          upstream: key,
        });
      }
    };
    middlewares.set(key, mw);
    return mw;
  };

  const router = new Router<any, any>();
  const proxied = new ArrayMultimap<string, string>();
  for (const [path, pathObj] of Object.entries<any>(args.doc.paths ?? {})) {
    const opPath = routerPath(path);
    const keys = new Set<string>();
    for (const meth of allOperationMethods) {
      const opObj = pathObj[meth];
      const oid = opObj?.operationId;
      if (!oid || meth === 'trace') {
        continue;
      }
      const key = args.dispatch(opObj, path);
      if (key == null) {
        continue;
      }
      proxied.add(key, oid);
      keys.add(key);
      router[meth](oid, opPath, middlewareFor(key));
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
  tel.logger.info(
    {data: {proxied: Object.fromEntries(proxied.toMap())}},
    'Created OpenAPI proxy for %s operation(s).',
    proxied.size
  );
  return router.routes();
}
