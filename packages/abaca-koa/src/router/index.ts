import Router from '@koa/router';
import {
  absurd,
  assert,
  isStandardError,
  statusErrors,
} from '@opvious/stl-errors';
import {noopTelemetry, Telemetry} from '@opvious/stl-telemetry';
import {
  isAsyncIterable,
  mapAsyncIterable,
} from '@opvious/stl-utils/collections';
import {ifPresent} from '@opvious/stl-utils/functions';
import {
  extractOperationDefinitions,
  incompatibleValueError,
  OpenapiDocument,
  OperationHookEnv,
  parseOpenapiDocument,
} from 'abaca-openapi';
import {
  ByMimeType,
  FORM_MIME_TYPE,
  isResponseTypeValid,
  JSON_MIME_TYPE,
  MimeType,
  MULTIPART_FORM_MIME_TYPE,
  OperationDefinition,
  OperationTypes,
  ResponseClauseMatcher,
  ResponseCode,
  TEXT_MIME_TYPE,
} from 'abaca-runtime';
import {default as ajv} from 'ajv';
import events from 'events';
import stream from 'stream';

import {packageInfo, routerPath} from '../common.js';
import {
  fallbackDecoder,
  fallbackEncoder,
  formDecoder,
  jsonDecoder,
  jsonEncoder,
  KoaDecodersFor,
  KoaEncodersFor,
  multipartFormDecoder,
  textDecoder,
  textEncoder,
} from './codecs.js';
import {KoaHandlersFor, Multipart} from './handlers.js';
import codes, {errors, requestErrors} from './index.errors.js';

export {KoaDecoder, KoaEncoder} from './codecs.js';
export {
  KoaContextsFor,
  KoaHandlerFor,
  KoaHandlersFor,
  KoaValuesFor,
} from './handlers.js';

const Ajv = ajv.default ?? ajv;

/** Creates a type-safe router for operations defined in the document */
export function createOperationsRouter<
  O extends OperationTypes<keyof O & string>,
  S = {},
  M extends MimeType = typeof JSON_MIME_TYPE
>(args: {
  /** Fully resolved OpenAPI document or its YAML representation. */
  readonly document: OpenapiDocument | string;

  /** Handler implementations. */
  readonly handlers: KoaHandlersFor<O, S, M>;

  /** Telemetry reporter. */
  readonly telemetry?: Telemetry;

  /**
   * Defaults to `handlers` if `handlers`'s constructor has a defined name
   * different from `Object` and `undefined` otherwise.
   */
  readonly handlerContext?: unknown;

  /**
   * Fallback route handler used when no handler exists for a given operation.
   * By default no route will be added in this case.
   */
  readonly fallback?: (ctx: Router.RouterContext<S>) => Promise<void>;

  /** Default response data content-type. Defaults to `application/json`. */
  readonly defaultType?: M;

  /**
   * Additional request decoders. The default supports uncompressed `text/*` and
   * `application/json` content-types.
   */
  readonly decoders?: KoaDecodersFor<O, S>;

  /**
   * Additional response encoders. The default supports uncompressed `text/*`
   * and `application/json` content-types.
   */
  readonly encoders?: KoaEncodersFor<O, S>;

  /**
   * Handle invalid request errors by returning plain text responses with
   * appropriate status. By default these errors are rethrown with status
   * `INVALID_ARGUMENT` and code `InvalidRequest`.
   */
  readonly handleInvalidRequests?: boolean;
}): Router<S> {
  const {document: doc, fallback} = args;
  const tel = args.telemetry?.via(packageInfo) ?? noopTelemetry();
  const handlers: any = args.handlers;
  const handlerContext = args.handlerContext ?? defaultHandlerContext(handlers);
  const defaultType = args.defaultType ?? JSON_MIME_TYPE;
  const rethrow = !args.handleInvalidRequests;

  const decoders = ByMimeType.create(fallbackDecoder);
  decoders.add(MULTIPART_FORM_MIME_TYPE, multipartFormDecoder);
  decoders.add(FORM_MIME_TYPE, formDecoder);
  decoders.add(JSON_MIME_TYPE, jsonDecoder);
  decoders.add(TEXT_MIME_TYPE, textDecoder);
  decoders.addAll(args.decoders as any);

  const encoders = ByMimeType.create(fallbackEncoder);
  encoders.add(JSON_MIME_TYPE, jsonEncoder);
  encoders.add(TEXT_MIME_TYPE, textEncoder);
  encoders.addAll(args.encoders as any);

  const registry = new Registry();
  const defs = extractOperationDefinitions({
    document: typeof doc == 'string' ? parseOpenapiDocument(doc) : doc,
    onSchema: (schema, env) => void registry.register(schema, env),
    generateIds: true,
  });

  const router = new Router<any>().use(async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      if (!isStandardError(err, codes.InvalidRequest)) {
        throw err;
      }
      const {status} = err.tags.reason.tags;
      if (rethrow) {
        throw statusErrors.invalidArgument(err, {
          protocolCodes: {http: status},
        });
      }
      tel.logger.info({err}, 'OpenAPI router request was invalid.');
      ctx.status = status;
      ctx.body = err.message;
    }
  });

  const handled: string[] = [];
  let unhandled = 0;
  for (const [oid, def] of Object.entries(defs)) {
    const handler = handlers[oid];
    if (!handler && !fallback) {
      unhandled++;
      continue;
    }
    handled.push(oid);

    const matcher = ResponseClauseMatcher.create(def.responses);

    assert(def.method !== 'trace', 'trace is not supported yet');
    router[def.method](
      oid,
      routerPath(def.path),
      async (ctx: Router.RouterContext) => {
        const accepted = new Set(ctx.accepts());
        if (!matcher.acceptable(accepted)) {
          throw errors.invalidRequest(requestErrors.unacceptable());
        }

        registry.injectParameters(ctx, oid, def);

        const qtype = ctx.request.type;
        if (qtype) {
          if (!def.body) {
            throw errors.invalidRequest(requestErrors.unexpectedBody());
          }
          const decoder = def.body.types.includes(qtype)
            ? decoders.getBest(qtype)
            : undefined;
          if (!decoder) {
            throw errors.invalidRequest(
              requestErrors.unsupportedContentType(qtype)
            );
          }
          let body;
          try {
            body = await decoder(ctx);
          } catch (err) {
            throw errors.invalidRequest(requestErrors.unreadableBody(err));
          }
          if (isAsyncIterable(body)) {
            body = mapAsyncIterable(body, (b) => {
              registry.validateRequestBody(b, oid, qtype);
              return b;
            });
          } else if (body instanceof events.EventEmitter) {
            const obj: {[name: string]: unknown} = {};
            const mpart = body as Multipart;
            mpart
              .on('part', (part) => {
                // TODO: Validate fields eagerly here.
                obj[part.name] = part.kind === 'field' ? part.field : '';
              })
              .on('done', () => {
                try {
                  registry.validateRequestBody(obj, oid, qtype);
                } catch (err) {
                  mpart.emit('error', err);
                }
              });
          } else {
            registry.validateRequestBody(body, oid, qtype);
          }
          Object.assign(ctx.request, {body});
        } else if (def.body?.required) {
          throw errors.invalidRequest(requestErrors.missingBody());
        }

        if (!handler) {
          assert(fallback, 'Missing fallback');
          await fallback(ctx);
          return;
        }

        const res = await handler.call(handlerContext, ctx);
        const status = typeof res == 'number' ? res : res.status ?? 200;

        const atype =
          typeof res == 'number' ? undefined : res.type ?? defaultType;
        let data = typeof res == 'number' ? undefined : res.data;
        const {code, declared} = matcher.getBest(status);
        if (!isResponseTypeValid({value: atype, declared, accepted})) {
          throw errors.unacceptableResponseType(oid, atype, accepted, declared);
        }
        if (!atype) {
          if (data != null) {
            throw errors.unexpectedResponseBody();
          }
          ctx.body = null;
          // We must set the status after the body since setting the body to
          // `null` automatically changes the status to 204.
          ctx.status = status;
          return;
        }
        ctx.type = atype;
        if (isAsyncIterable(data) && !(data instanceof stream.Readable)) {
          data = mapAsyncIterable(data, (d) => {
            registry.validateResponse(d, oid, atype, code);
            return d;
          });
        } else {
          registry.validateResponse(data, oid, atype, code);
        }
        const encoder = encoders.getBest(atype);
        try {
          await encoder(data, ctx);
        } finally {
          ctx.status = status;
        }
      }
    );
  }

  tel.logger.info(
    {data: {handled, unhandled}},
    'Created OpenAPI router for %s operation(s).',
    handled.length
  );
  return router;
}

function defaultHandlerContext(obj: any): unknown {
  const name = obj?.constructor?.name;
  return name == null || name === 'Object' ? undefined : obj;
}

class Registry {
  // We enable coercion both for parameters and (soon) plain-text bodies.
  private readonly ajv = new Ajv({
    coerceTypes: true,
    formats: {binary: true},
  });

  register(schema: any, env: OperationHookEnv): void {
    const {operationId, target} = env;
    if (target.kind === 'parameter') {
      const {name} = target;
      const key = schemaKey(operationId, name);
      // Nest within an object to enable coercion and better error reporting.
      this.ajv.addSchema(
        {
          type: 'object',
          properties: {[name]: schema ?? {type: 'string'}},
          required: [name],
        },
        key
      );
    } else {
      const code = 'code' in target ? target.code : undefined;
      const key = schemaKey(operationId, bodySchemaSuffix(target.type, code));
      this.ajv.addSchema(schema, key);
    }
  }

  injectParameters(
    ctx: Router.RouterContext,
    oid: string,
    def: OperationDefinition
  ): void {
    const {ajv} = this;
    for (const [name, pdef] of Object.entries(def.parameters)) {
      let str: unknown;
      switch (pdef.location) {
        case 'header':
          str = ctx.get(name);
          break;
        case 'path':
          str = ctx.params[name];
          break;
        case 'query':
          str = ctx.query[name];
          break;
        default:
          throw absurd(pdef.location);
      }
      if (str == null) {
        if (pdef.required) {
          throw errors.invalidRequest(requestErrors.missingParameter(name));
        }
        continue;
      }
      const key = schemaKey(oid, name);
      const validate = ajv.getSchema(key);
      assert(validate, 'Missing parameter schema', key);
      const obj = {[name]: str};
      ifPresent(incompatibleValueError(validate, {value: obj}), (err) => {
        throw errors.invalidRequest(requestErrors.invalidParameter(name, err));
      });
      Object.assign(ctx.params, obj);
    }
  }

  validateRequestBody(body: unknown, oid: string, type: string): void {
    const key = schemaKey(oid, bodySchemaSuffix(type));
    const validate = this.ajv.getSchema(key);
    assert(validate, 'Missing request body schema', key);
    ifPresent(incompatibleValueError(validate, {value: body}), (err) => {
      throw errors.invalidRequest(requestErrors.invalidBody(err));
    });
  }

  validateResponse(
    data: unknown,
    oid: string,
    type: string,
    code: ResponseCode
  ): void {
    const key = schemaKey(oid, bodySchemaSuffix(type, code));
    const validate = this.ajv.getSchema(key);
    assert(validate, 'Missing response schema', key);
    if (
      (validate.schema as any).type === 'string' &&
      (Buffer.isBuffer(data) || data instanceof stream.Readable)
    ) {
      return; // Let binary data through.
    }
    ifPresent(incompatibleValueError(validate, {value: data}), (err) => {
      throw errors.invalidResponseData(err);
    });
  }
}

function schemaKey(oid: string, suffix: string): string {
  return `${oid}#${suffix}`;
}

function bodySchemaSuffix(type: MimeType, code?: ResponseCode): string {
  return code == null ? type : `${type}@${code}`;
}
