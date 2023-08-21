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
import {typedEmitter} from '@opvious/stl-utils/events';
import {atMostOnce, ifPresent} from '@opvious/stl-utils/functions';
import {KindAmong} from '@opvious/stl-utils/objects';
import {
  extractOperationDefinitions,
  incompatibleValueError,
  OpenapiDocument,
  OperationHookEnv,
  parseOpenapiDocument,
} from 'abaca-openapi';
import {
  ByMimeType,
  contentTypeMatches,
  FORM_MIME_TYPE,
  isResponseTypeValid,
  JSON_MIME_TYPE,
  MimeType,
  MULTIPART_FORM_MIME_TYPE,
  MULTIPART_MIME_TYPE,
  OCTET_STREAM_MIME_TIME,
  OperationDefinition,
  OperationTypes,
  ResponseClauseMatcher,
  ResponseCode,
  TEXT_MIME_TYPE,
} from 'abaca-runtime';
import ajv_ from 'ajv';
import events from 'events';
import stream from 'stream';

import {packageInfo, routerPath} from '../common.js';
import {
  binaryDecoder,
  binaryEncoder,
  fallbackDecoder,
  fallbackEncoder,
  formDecoder,
  jsonDecoder,
  jsonEncoder,
  KoaDecodersFor,
  KoaEncodersFor,
  MultipartForm,
  multipartFormDecoder,
  textDecoder,
  textEncoder,
} from './codecs.js';
import codes, {errors, requestErrors} from './index.errors.js';
import {
  AdditionalMultipartProperty,
  KoaHandlersFor,
  Multipart,
  MultipartListeners,
} from './types.js';

export {KoaDecoder, KoaEncoder} from './codecs.js';
export {
  KoaContextsFor,
  KoaHandlerFor,
  KoaHandlersFor,
  KoaValuesFor,
} from './types.js';

const Ajv = ajv_.default ?? ajv_;

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
  decoders.add(FORM_MIME_TYPE, formDecoder);
  decoders.add(JSON_MIME_TYPE, jsonDecoder);
  decoders.add(MULTIPART_FORM_MIME_TYPE, multipartFormDecoder);
  decoders.add(OCTET_STREAM_MIME_TIME, binaryDecoder);
  decoders.add(TEXT_MIME_TYPE, textDecoder);
  decoders.addAll(args.decoders as any);

  const encoders = ByMimeType.create(fallbackEncoder);
  encoders.add(JSON_MIME_TYPE, jsonEncoder);
  encoders.add(OCTET_STREAM_MIME_TIME, binaryEncoder);
  encoders.add(TEXT_MIME_TYPE, textEncoder);
  encoders.addAll(args.encoders as any);

  const registry = new Registry(tel);
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
          if (body instanceof stream.Readable && !body.readableObjectMode) {
            // Binary mode stream
            registry.validateRequestBody(body, oid, qtype);
          } else if (isAsyncIterable(body)) {
            // Object-mode stream or native iterable
            body = mapAsyncIterable(body, (b) => {
              registry.validateRequestBody(b, oid, qtype);
              return b;
            });
          } else if (body instanceof events.EventEmitter) {
            // Multipart instance
            body = registry.translateRequestBody(body, oid, qtype);
          } else {
            // Decoded value
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
  private readonly ajv = new Ajv({
    coerceTypes: true, // Needed for parameters
    formats: {binary: true},
  });
  constructor(private readonly telemetry: Telemetry) {}

  register(schema: any, env: OperationHookEnv): void {
    const {operationId: oid, target} = env;
    switch (target.kind) {
      case 'parameter':
        this.registerParameter(oid, target.name, schema);
        break;
      case 'requestBody':
        this.registerRequestBody(oid, target.type, schema);
        break;
      case 'response':
        this.registerResponseBody(oid, target.type, target.code, schema);
        break;
      default:
        throw absurd(target);
    }
  }

  private registerParameter(oid: string, name: string, schema: any): void {
    // Nest within an object to enable coercion and better error reporting.
    this.ajv.addSchema(
      {
        type: 'object',
        properties: {[name]: schema ?? {type: 'string'}},
        required: [name],
      },
      schemaKey(oid, {kind: 'parameter', name})
    );
  }

  private registerRequestBody(
    oid: string,
    contentType: string,
    schema: any
  ): void {
    const key = schemaKey(oid, {kind: 'requestBody', contentType});
    this.ajv.addSchema(schema, key);

    // Add individual multipart properties to be able to validate them as they
    // are streamed in.
    if (contentTypeMatches(contentType, [MULTIPART_MIME_TYPE])) {
      assert(
        schema.type === 'object',
        'Non-object multipart request body: %j',
        schema
      );
      for (const [name, propSchema] of Object.entries<any>(
        schema.properties ?? {}
      )) {
        const propKey = schemaKey(oid, {
          kind: 'requestBodyProperty',
          contentType,
          name,
        });
        this.ajv.addSchema(propSchema, propKey);
      }
    }
  }

  private registerResponseBody(
    oid: string,
    contentType: string,
    code: ResponseCode,
    schema: any
  ): void {
    this.ajv.addSchema(
      schema,
      schemaKey(oid, {kind: 'responseBody', code, contentType})
    );
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
      const key = schemaKey(oid, {kind: 'parameter', name});
      const validate = ajv.getSchema(key);
      assert(validate, 'Missing parameter schema', key);
      const obj = {[name]: str};
      ifPresent(incompatibleValueError(validate, {value: obj}), (err) => {
        throw errors.invalidRequest(requestErrors.invalidParameter(name, err));
      });
      Object.assign(ctx.params, obj);
    }
  }

  validateRequestBody(body: unknown, oid: string, contentType: string): void {
    const key = schemaKey(oid, {kind: 'requestBody', contentType});
    const validate = this.ajv.getSchema(key);
    assert(validate, 'Missing request body schema', key);
    const value =
      Buffer.isBuffer(body) || body instanceof stream.Readable ? '' : body;
    ifPresent(incompatibleValueError(validate, {value}), (err) => {
      throw errors.invalidRequest(requestErrors.invalidBody(err));
    });
  }

  translateRequestBody(
    form: MultipartForm,
    oid: string,
    contentType: string
  ): Multipart {
    const {logger} = this.telemetry;
    // We capture rejections to make it easier for callers to use async
    // listeners for property events.
    const ee = typedEmitter<MultipartListeners>({captureRejections: true});

    // Object used to accumulate properties as they get decoded. They are
    // validated one by one and at the very end, to make sure the object as a
    // whole is not missing any required data.
    const obj: {[name: string]: unknown} = {};
    const onDone = (): void => {
      try {
        this.validateRequestBody(obj, oid, contentType);
      } catch (err) {
        onError(err);
        return;
      }
      ee.emit('done');
    };

    const onError = atMostOnce(
      (err) => {
        form.removeListener('done', onDone);
        ee.emit('error', err);
      },
      (err) => {
        logger.debug({err}, 'Ignoring subsequent multipart body error.');
      }
    );

    const emitProperty = (prop: AdditionalMultipartProperty): void => {
      const {kind, name} = prop;
      const key = schemaKey(oid, {
        kind: 'requestBodyProperty',
        contentType,
        name,
      });
      const val = kind === 'field' ? prop.field : '';
      const validate = this.ajv.getSchema(key);
      try {
        if (!validate) {
          if (ee.listenerCount('additionalProperty')) {
            ee.emit('additionalProperty', prop);
          } else if (kind === 'stream') {
            // Consume the stream to allow decoding to proceed
            prop.stream.resume();
          }
          return;
        }
        ifPresent(incompatibleValueError(validate, {value: val}), (cause) => {
          const err = requestErrors.invalidMultipartProperty(name, cause);
          throw errors.invalidRequest(err);
        });
        ee.emit('property', prop);
      } catch (err) {
        onError(err);
      }
      obj[name] = val;
    };

    form
      .on('error', (err) => void onError(err))
      .on('value', (name, val) => {
        emitProperty({name, kind: 'field', field: val});
      })
      .on('stream', (name, stream) => {
        emitProperty({name, kind: 'stream', stream});
      });

    ee.on('newListener', (name) => {
      if (name === 'done' && !form.listenerCount('done')) {
        form.on('done', onDone);
      }
    });

    return ee;
  }

  validateResponse(
    data: unknown,
    oid: string,
    contentType: string,
    code: ResponseCode
  ): void {
    const key = schemaKey(oid, {kind: 'responseBody', contentType, code});
    const validate = this.ajv.getSchema(key);
    assert(validate, 'Missing response schema', key);
    const value =
      Buffer.isBuffer(data) || data instanceof stream.Readable ? '' : data;
    ifPresent(incompatibleValueError(validate, {value}), (err) => {
      throw errors.invalidResponseData(err);
    });
  }
}

function schemaKey(oid: string, qual: SchemaQualifier): string {
  let suffix: string;
  switch (qual.kind) {
    case 'parameter':
      suffix = `/p/${qual.name}`;
      break;
    case 'requestBody':
      suffix = `/q/${qual.contentType}`;
      break;
    case 'requestBodyProperty':
      suffix = `/q/${qual.contentType}/${qual.name}`;
      break;
    case 'responseBody':
      suffix = `/a/${qual.contentType}/${qual.code}`;
      break;
    default:
      throw absurd(qual);
  }
  return oid + suffix;
}

type SchemaQualifier = KindAmong<{
  parameter: {readonly name: string};
  requestBody: {readonly contentType: MimeType};
  requestBodyProperty: {readonly contentType: MimeType; readonly name: string};
  responseBody: {readonly contentType: MimeType; readonly code: ResponseCode};
}>;
