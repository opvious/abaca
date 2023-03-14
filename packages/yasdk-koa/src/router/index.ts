import Router from '@koa/router';
import {
  absurd,
  assert,
  check,
  errorFactories,
  errorMessage,
  isStandardError,
  StandardError,
} from '@opvious/stl-errors';
import {noopTelemetry, Telemetry} from '@opvious/stl-telemetry';
import {default as ajv, ErrorObject} from 'ajv';
import {
  extractOperationDefinitions,
  OpenapiDocument,
  OperationHookEnv,
} from 'yasdk-openapi';
import {
  ByMimeType,
  isResponseTypeValid,
  JSON_MIME_TYPE,
  MimeType,
  OperationDefinition,
  OperationTypes,
  PLAIN_MIME_TYPE,
  ResponseClauseMatcher,
  ResponseCode,
  TEXT_MIME_TYPE,
} from 'yasdk-openapi/preamble';

import {
  isAsyncIterable,
  mapAsyncIterable,
  packageInfo,
  routerPath,
} from '../common.js';
import {
  jsonDecoder,
  jsonEncoder,
  KoaDecoder,
  KoaDecodersFor,
  KoaEncoder,
  KoaEncodersFor,
  textDecoder,
  textEncoder,
} from './codecs.js';
import {
  DefaultOperationContext,
  DefaultOperationTypes,
  KoaHandlersFor,
} from './handlers.js';

export {KoaDecoder, KoaEncoder} from './codecs.js';
export {
  KoaContextsFor,
  KoaHandlerFor,
  KoaHandlersFor,
  KoaValuesFor,
} from './handlers.js';

const [errors, codes] = errorFactories({
  definitions: {
    invalidRequest: (origin: RequestError) => ({
      message: 'Invalid request: ' + origin.message,
      tags: {origin},
    }),
    invalidResponseData: (errors: ReadonlyArray<ErrorObject>) => ({
      message: 'Invalid response data: ' + formatValidationErrors(errors),
      tags: {errors},
    }),
    unacceptableResponseType: (
      oid: string,
      type: string,
      accepted: Iterable<string>,
      declared: Iterable<string> | undefined
    ) => ({
      message:
        `Response type ${type} does not belong to the set of acceptable ` +
        `values for operation ${oid} (accepted=[${[...accepted].join(', ')}]` +
        `, declared=[${[...(declared ?? [])].join(', ')}])`,
    }),
    unexpectedResponseBody: {
      message: 'This response should not have a body',
    },
    unwritableResponseType: (type: string) => ({
      message: `Response type ${type} does not have a matching encoder`,
    }),
  },
});

export const errorCodes = codes;

type RequestError = StandardError<{readonly status: number}>;

const [requestErrors] = errorFactories({
  definitions: {
    unacceptable: () => ({
      message:
        'Request must accept at least one content type for each response code',
      tags: {status: 406},
    }),
    missingParameter: (name: string) => ({
      message: `Parameter ${name} is required but was missing`,
      tags: {status: 400},
    }),
    invalidParameters: (errors: ReadonlyArray<ErrorObject>) => ({
      message: 'Invalid parameters: ' + formatValidationErrors(errors),
      tags: {status: 400, errors},
    }),
    unsupportedContentType: (type: string) => ({
      message: `Content-type ${type} is not supported`,
      tags: {status: 415},
    }),
    missingBody: () => ({
      message: 'This operation expects a body but none was found',
      tags: {status: 400},
    }),
    unexpectedBody: () => ({
      message:
        'This operation does not support requests with a body. Please make ' +
        'sure that the request does not have a body or `content-type` ' +
        'header.',
      tags: {status: 400},
    }),
    unreadableBody: (cause: unknown) => ({
      message: 'Body could not be decoded: ' + errorMessage(cause),
      tags: {status: 400},
      cause,
    }),
    invalidBody: (errors: ReadonlyArray<ErrorObject>) => ({
      message: 'Invalid body: ' + formatValidationErrors(errors),
      tags: {status: 400, errors},
    }),
  },
  prefix: 'ERR_REQUEST_',
});

const Ajv = ajv.default ?? ajv;

const ERROR_CODE_HEADER = 'error-code';

/** Creates a type-safe router for operations defined in the document. */
export function createOperationsRouter<
  O extends OperationTypes<keyof O & string> = DefaultOperationTypes,
  S = {},
  M extends MimeType = typeof JSON_MIME_TYPE
>(args: {
  /** Fully resolved OpenAPI document. */
  readonly doc: OpenapiDocument;

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
  readonly fallback?: (ctx: DefaultOperationContext<S>) => Promise<void>;

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
}): Router<S> {
  const {doc, fallback} = args;
  const tel = args.telemetry?.via(packageInfo) ?? noopTelemetry();
  const handlers: any = args.handlers;
  const handlerContext = args.handlerContext ?? defaultHandlerContext(handlers);
  const defaultType = args.defaultType ?? JSON_MIME_TYPE;

  const decoders = ByMimeType.create<KoaDecoder<any, any> | undefined>(
    undefined
  );
  decoders.add(JSON_MIME_TYPE, jsonDecoder);
  decoders.add(TEXT_MIME_TYPE, textDecoder);
  decoders.addAll(args.decoders as any);

  const encoders = ByMimeType.create(fallbackEncoder);
  encoders.add(JSON_MIME_TYPE, jsonEncoder);
  encoders.add(TEXT_MIME_TYPE, textEncoder);
  encoders.addAll(args.encoders as any);

  const registry = new Registry();
  const defs = extractOperationDefinitions(doc, (schema, env) => {
    registry.register(schema, env);
  });

  const router = new Router<any>().use(async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      if (!isStandardError(err, codes.InvalidRequest)) {
        throw err;
      }
      tel.logger.info({err}, 'OpenAPI router request was invalid.');
      const {origin} = err.tags;
      ctx.status = origin.tags.status;
      ctx.set(ERROR_CODE_HEADER, origin.code);
      if (ctx.accepts([PLAIN_MIME_TYPE, JSON_MIME_TYPE]) === JSON_MIME_TYPE) {
        ctx.body = {message: err.message, code: origin.code, tags: origin.tags};
      } else {
        ctx.body = err.message;
      }
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
        if (isAsyncIterable(data)) {
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

const fallbackEncoder: KoaEncoder<any, any> = (_data, ctx) => {
  throw errors.unwritableResponseType(ctx.type);
};

function defaultHandlerContext(obj: any): unknown {
  const name = obj?.constructor?.name;
  return name == null || name === 'Object' ? undefined : obj;
}

class Registry {
  private readonly parameters = new Ajv({coerceTypes: true});
  private readonly bodies = new Ajv();

  register(schema: any, env: OperationHookEnv): void {
    const {operationId, target} = env;
    if (target.kind === 'parameter') {
      const {name} = target;
      const key = schemaKey(operationId, name);
      // Nest within an object to enable coercion and better error reporting.
      this.parameters.addSchema(
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
      this.bodies.addSchema(schema, key);
    }
  }

  injectParameters(
    ctx: DefaultOperationContext,
    oid: string,
    def: OperationDefinition
  ): void {
    const {parameters} = this;
    const errs: ErrorObject[] = [];
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
      const validate = parameters.getSchema(key);
      assert(validate, 'Missing parameter schema', key);
      const obj = {[name]: str};
      if (validate(obj)) {
        Object.assign(ctx.params, obj);
      } else {
        errs.push(...check.isPresent(validate.errors));
      }
    }
    if (errs.length) {
      throw errors.invalidRequest(requestErrors.invalidParameters(errs));
    }
  }

  validateRequestBody(body: unknown, oid: string, type: string): void {
    const key = schemaKey(oid, bodySchemaSuffix(type));
    const validate = this.bodies.getSchema(key);
    assert(validate, 'Missing request body schema', key);
    if (!validate(body)) {
      throw errors.invalidRequest(
        requestErrors.invalidBody([...check.isPresent(validate.errors)])
      );
    }
  }

  validateResponse(
    data: unknown,
    oid: string,
    type: string,
    code: ResponseCode
  ): void {
    const key = schemaKey(oid, bodySchemaSuffix(type, code));
    const validate = this.bodies.getSchema(key);
    assert(validate, 'Missing response schema', key);
    if (!validate(data)) {
      throw errors.invalidResponseData([...check.isPresent(validate.errors)]);
    }
  }
}

function schemaKey(oid: string, suffix: string): string {
  return `${oid}#${suffix}`;
}

function bodySchemaSuffix(type: MimeType, code?: ResponseCode): string {
  return code == null ? type : `${type}@${code}`;
}

function formatValidationErrors(errs: ReadonlyArray<ErrorObject>): string {
  return errs.map((e) => `path $${e.instancePath} ${e.message}`).join(', ');
}
