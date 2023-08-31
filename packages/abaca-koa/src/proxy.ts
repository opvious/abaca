import Router from '@koa/router';
import {assert} from '@opvious/stl-errors';
import {instrumentsFor, noopTelemetry, Telemetry} from '@opvious/stl-telemetry';
import {ArrayMultimap, firstElement} from '@opvious/stl-utils/collections';
import {MarkPresent} from '@opvious/stl-utils/objects';
import {
  allOperationMethods,
  OpenapiDocuments,
  OpenapiOperations,
  OpenapiVersion,
} from 'abaca-openapi';
import ProxyServer from 'http-proxy';
import Koa from 'koa';

import {packageInfo, routerPath} from './common.js';

const instruments = instrumentsFor({
  operationProxyTime: {
    name: 'abaca.koa.operations.proxy_time',
    kind: 'histogram',
    unit: 'ms',
    labels: {id: 'id', status: 'http.status_code', upstream: 'upstream'},
  },
});

type ProxiedOperation<V extends OpenapiVersion> = MarkPresent<
  OpenapiOperations[V],
  'operationId'
>;

/**
 * Creates a proxy for OpenAPI operations. Note that the returned middleware
 * returns immediately: it does not wait for the response to be proxied back.
 * Instead it disables Koa response handling by setting `ctx.respond` to false.
 */
export function createOperationsProxy<
  V extends OpenapiVersion,
  U extends Record<string, ProxyServer.ServerOptions>
>(args: {
  /** OpenAPI document. */
  readonly document: OpenapiDocuments[V];

  /** Upstream server options. */
  readonly upstreams: U;

  /**
   * Maps operations to upstream key. Unmapped operations are not proxied.
   * Operations without an ID or with `trace` method are always skipped.
   */
  readonly dispatch: (
    op: ProxiedOperation<V>,
    path: string
  ) => (keyof U & string) | undefined;

  /**
   * Optional setup for newly created proxy serverss. Use this for example to
   * set up error handling.
   */
  readonly setup?: (server: ProxyServer, key: keyof U & string) => void;

  /**
   * Optional hook called just before a request is proxied. This can be used for
   * example to throw an exception and abort handling.
   */
  readonly prepare?: (
    ctx: Koa.Context,
    op: ProxiedOperation<V>
  ) => Promise<void>;

  /** Telemetry provider. */
  readonly telemetry?: Telemetry;

  /**
   * Proxy OPTIONS requests for all operations, even if one is not declared
   * explicitly. This can be useful to support CORS. An error will be thrown if
   * a single path is mapped to multiple upstreams.
   */
  readonly proxyOptionsRequests?: boolean;
}): Koa.Middleware {
  const paths = args.document.paths;
  assert(paths, 'No paths to proxy');

  const {setup, prepare, upstreams} = args;
  const tel = args.telemetry?.via(packageInfo) ?? noopTelemetry();
  const [metrics] = tel.metrics(instruments);

  const ops = new Map<string, ProxiedOperation<V>>();
  const middlewares = new Map<string, Koa.Middleware>();
  const middlewareFor = (key: string): Koa.Middleware => {
    let mw = middlewares.get(key);
    if (mw) {
      return mw;
    }
    const server = ProxyServer.createProxy(upstreams[key]);
    setup?.(server, key);
    mw = async (ctx): Promise<void> => {
      const oid = ctx._matchedRouteName;
      assert(typeof oid == 'string', 'Missing operation ID');

      if (prepare) {
        const op = ops.get(oid);
        assert(op != null, 'Missing operation for %s', oid);
        await prepare(ctx, op);
      }

      tel.logger.info('Proxying operation %s... [upstream=%s]', oid, key);
      ctx.respond = false; // Disable Koa response handling.
      const startMs = Date.now();
      const {req, res} = ctx;
      server.web(req, res);
      res.once('close', () => {
        if (res.writableFinished) {
          const latency = Date.now() - startMs;
          const status = res.statusCode;
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
        } else {
          tel.logger.warn(
            'Interrupted while proxying operation %s. [upstream=%s]',
            oid,
            key
          );
        }
      });
    };
    middlewares.set(key, mw);
    return mw;
  };

  const router = new Router<any, any>();
  const proxied = new ArrayMultimap<string, string>();
  for (const [path, pathObj] of Object.entries<any>(paths)) {
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
      ops.set(oid, opObj);
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
