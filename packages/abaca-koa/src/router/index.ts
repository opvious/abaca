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
  ContentFormat,
  dereferencePointer,
  extractPathOperationDefinitions,
  incompatibleValueError,
  isContentCompatible,
  JSON_MIME_TYPE,
  JsonPointer,
  matchingMimeType,
  MimeType,
  MULTIPART_MIME_TYPE,
  OpenapiDocument,
  OperationDefinition,
  OperationListeners,
  OperationTypes,
  parseOpenapiDocument,
  ResponseClauseMatcher,
  ResponseCode,
} from 'abaca';
import Ajv_ from 'ajv';
import events from 'events';
import stream from 'stream';

import {packageInfo, routerPath} from '../common.js';
import {
  defaultDecoders,
  defaultEncoders,
  KoaDecoders,
  KoaEncoders,
  MultipartForm,
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

const Ajv = Ajv_.default ?? Ajv_;

/** Creates a type-safe router for operations defined in the document */
export function createOperationsRouter<
  O extends OperationTypes<keyof O & string>,
  S = {},
  M extends MimeType = typeof JSON_MIME_TYPE,
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
   * Additional request decoders. The default supports uncompressed `text/*`,
   * `application/json`, `application/json-seq`, forms (multipart or not), and
   * binary content-types.
   */
  readonly decoders?: KoaDecoders<S>;

  /**
   * Additional response encoders. The default supports uncompressed `text/*`,
   * `application/json`, `application/json-seq`, and binary content-types.
   */
  readonly encoders?: KoaEncoders<S>;

  /**
   * Handle invalid request errors by returning plain text responses with
   * appropriate status. By default these errors are rethrown with status
   * `INVALID_ARGUMENT` and code `InvalidRequest`.
   */
  readonly handleInvalidRequests?: boolean;
}): Router<S> {
  const {fallback} = args;
  const tel = args.telemetry?.via(packageInfo) ?? noopTelemetry();
  const handlers: any = args.handlers;
  const handlerContext = args.handlerContext ?? defaultHandlerContext(handlers);
  const defaultType = args.defaultType ?? JSON_MIME_TYPE;
  const rethrow = !args.handleInvalidRequests;

  const doc =
    typeof args.document == 'string'
      ? parseOpenapiDocument(args.document)
      : args.document;

  const decoders = defaultDecoders();
  decoders.addAll(args.decoders as any);

  const encoders = defaultEncoders();
  encoders.addAll(args.encoders as any);

  const registry = Registry.create(doc, tel);
  const defs = extractPathOperationDefinitions({
    document: doc,
    producer: typedEmitter<OperationListeners>()
      .on('parameter', (oid, ptr, name) => {
        registry.registerParameter(oid, ptr, name);
      })
      .on('requestBody', (oid, ptr, mime) => {
        registry.registerRequestBody(oid, ptr, mime);
      })
      .on('response', (oid, ptr, mime, code) => {
        registry.registerResponseBody(oid, ptr, mime, code);
      }),
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
          let reqBody;
          try {
            reqBody = await decoder(ctx);
          } catch (err) {
            throw errors.invalidRequest(requestErrors.unreadableBody(err));
          }
          if (
            reqBody instanceof stream.Readable &&
            !reqBody.readableObjectMode
          ) {
            // Binary mode stream
            registry.validateRequestBody(reqBody, oid, qtype);
          } else if (isAsyncIterable(reqBody)) {
            // Object-mode stream or native async iterable
            reqBody = mapAsyncIterable(reqBody, (b) => {
              registry.validateRequestBody(b, oid, qtype);
              return b;
            });
          } else if (reqBody instanceof events.EventEmitter) {
            // Multipart instance
            reqBody = registry.translateRequestBody(reqBody, oid, qtype);
          } else {
            // Decoded value
            registry.validateRequestBody(reqBody, oid, qtype);
          }
          Object.assign(ctx.request, {body: reqBody});
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
        let resBody = typeof res == 'number' ? undefined : res.body;
        const {code, declared} = matcher.getBest(status);
        if (!isContentCompatible({received: atype, declared, accepted})) {
          throw errors.unacceptableResponseType(
            oid,
            atype,
            accepted,
            declared?.keys()
          );
        }
        if (!atype) {
          if (resBody != null) {
            throw errors.unexpectedResponseBody();
          }
          ctx.body = null;
          // We must set the status after the body since setting the body to
          // `null` automatically changes the status to 204.
          ctx.status = status;
          return;
        }
        const content = declared?.get(atype);
        assert(content, 'undeclared content for type %s', atype);
        // TODO: Check that content.isStream matches the branches below.
        if (isAsyncIterable(resBody) && !(resBody instanceof stream.Readable)) {
          resBody = mapAsyncIterable(resBody, (d) => {
            registry.validateResponse(d, oid, atype, code, content);
            return d;
          });
        } else {
          registry.validateResponse(resBody, oid, atype, code, content);
        }
        const encoder = encoders.getBest(atype);
        try {
          await encoder(resBody, ctx, content);
        } finally {
          ctx.status = status;
        }
        ctx.type = atype;
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

// ID used for the OpenAPI specification
const DOCUMENT_ID = 'file:///openapi.yaml';

function documentReference(ptr: JsonPointer): {readonly $ref: string} {
  return {$ref: `${DOCUMENT_ID}#${ptr}`};
}

class Registry {
  // Coercion is useful for encodings which do not retain enough information,
  // for example URL encoding (mostly in parameters but also in request bodies).
  private readonly cache = new Ajv({
    coerceTypes: 'array',
    formats: {binary: true, stream: true},
    strict: false,
    validateSchema: false,
  });
  private constructor(
    private readonly document: OpenapiDocument,
    private readonly telemetry: Telemetry
  ) {}

  static create(doc: OpenapiDocument, tel: Telemetry): Registry {
    const ret = new Registry(doc, tel);
    ret.cache.addSchema(doc, DOCUMENT_ID);
    return ret;
  }

  registerParameter(oid: string, ptr: JsonPointer, name: string): void {
    // Nest within an object to enable coercion and better error reporting.
    this.cache.addSchema(
      {
        type: 'object',
        properties: {[name]: documentReference(ptr)},
        required: [name],
      },
      schemaId(oid, {kind: 'parameter', name})
    );
  }

  registerRequestBody(
    oid: string,
    ptr: JsonPointer,
    contentType: string
  ): void {
    const key = schemaId(oid, {kind: 'requestBody', contentType});

    const schema = dereferencePointer(ptr, this.document);
    this.cache.addSchema(
      documentReference(
        schema.type === 'string' && schema.format === 'stream'
          ? ptr + '/items'
          : ptr
      ),
      key
    );

    // Add individual multipart properties to be able to validate them as they
    // are streamed in.
    if (matchingMimeType(contentType, [MULTIPART_MIME_TYPE]) != null) {
      assert(
        schema.type === 'object',
        'Non-object multipart request body: %j',
        schema
      );
      for (const name of Object.keys(schema.properties ?? {})) {
        const propKey = schemaId(oid, {
          kind: 'requestBodyProperty',
          contentType,
          name,
        });
        this.cache.addSchema(
          documentReference(`${ptr}/properties/${name}`),
          propKey
        );
      }
    }
  }

  registerResponseBody(
    oid: string,
    ptr: JsonPointer,
    contentType: string,
    code: ResponseCode
  ): void {
    const schema = dereferencePointer(ptr, this.document);
    this.cache.addSchema(
      documentReference(
        schema.type === 'string' && schema.format === 'stream'
          ? ptr + '/items'
          : ptr
      ),
      schemaId(oid, {kind: 'responseBody', code, contentType})
    );
  }

  injectParameters(
    ctx: Router.RouterContext,
    oid: string,
    def: OperationDefinition
  ): void {
    const {cache} = this;
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
      const key = schemaId(oid, {kind: 'parameter', name});
      const validate = cache.getSchema(key);
      assert(validate, 'Missing parameter schema', key);
      const obj = {[name]: str};
      ifPresent(incompatibleValueError(validate, {value: obj}), (err) => {
        throw errors.invalidRequest(requestErrors.invalidParameter(name, err));
      });
      Object.assign(ctx.params, obj);
    }
  }

  validateRequestBody(body: unknown, oid: string, contentType: string): void {
    const key = schemaId(oid, {kind: 'requestBody', contentType});
    const validate = this.cache.getSchema(key);
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
      const key = schemaId(oid, {
        kind: 'requestBodyProperty',
        contentType,
        name,
      });
      const val = kind === 'field' ? prop.field : '';
      const validate = this.cache.getSchema(key);
      try {
        if (validate) {
          ifPresent(incompatibleValueError(validate, {value: val}), (cause) => {
            const err = requestErrors.invalidMultipartProperty(name, cause);
            throw errors.invalidRequest(err);
          });
          ee.emit('property', prop);
        } else {
          if (ee.listenerCount('additionalProperty')) {
            ee.emit('additionalProperty', prop);
          } else if (kind === 'stream') {
            // Consume the stream to allow decoding to proceed
            prop.stream.resume();
          }
        }
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
    code: ResponseCode,
    content: ContentFormat
  ): void {
    const key = schemaId(oid, {kind: 'responseBody', contentType, code});
    const validate = this.cache.getSchema(key);
    assert(validate, 'Missing response schema', key);
    if (
      content.isBinary &&
      (Buffer.isBuffer(data) ||
        data instanceof stream.Readable ||
        data instanceof Blob)
    ) {
      return;
    }
    ifPresent(incompatibleValueError(validate, {value: data}), (err) => {
      throw errors.invalidResponseBody(err);
    });
  }
}

function schemaId(oid: string, qual: SchemaQualifier): string {
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
