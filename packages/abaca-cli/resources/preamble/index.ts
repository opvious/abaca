import {
  acceptedMimeTypes,
  BaseFetch,
  ByMimeType,
  Coercer,
  Decoder,
  DEFAULT_ACCEPT,
  DEFAULT_CONTENT_TYPE,
  Encoder,
  Exact,
  FORM_MIME_TYPE,
  Has,
  isContentCompatible,
  JSON_MIME_TYPE,
  Lookup,
  MimeType,
  MULTIPART_FORM_MIME_TYPE,
  OCTET_STREAM_MIME_TIME,
  OperationDefinitions,
  OperationType,
  OperationTypes,
  ParametersType,
  PLAIN_MIME_TYPE,
  RequestHeaders,
  RequestOptions,
  ResponseClauseMatcher,
  ResponseCode,
  ResponseFor,
  ResponseMimeTypes,
  ResponsesType,
  SdkConfig,
  SdkFunction,
  SdkRequest,
  SdkResponse,
  SplitMimeTypes,
  TEXT_MIME_TYPE,
  Values,
  ValuesMatchingMimeTypes,
  WithMimeTypeGlobs,
} from 'abaca';

type DA = typeof DEFAULT_ACCEPT;
type DM = typeof DEFAULT_CONTENT_TYPE;

const binaryEncoder: Encoder = (body) => body;
const binaryDecoder: Decoder = (res) => res.blob();

const jsonEncoder: Encoder = (body) => JSON.stringify(body);
const jsonDecoder: Decoder = (res) => res.json();

const textEncoder: Encoder = (body) => (body == null ? '' : '' + body);
const textDecoder: Decoder = (res) => res.text();

// This doesn't supported nested objects. See also
// https://stackoverflow.com/a/37562814 for information on why we can return the
// params directly.
const formEncoder: Encoder = (body) => {
  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(body as any)) {
    if (Array.isArray(val)) {
      for (const elem of val) {
        params.append(key, '' + elem);
      }
    } else {
      params.set(key, '' + val);
    }
  }
  return params;
};

const multipartFormEncoder: Encoder = (body) => {
  const form = new FormData();
  if (!body || typeof body != 'object') {
    throw new Error('Unsupported multipart-form input: ' + body);
  }
  for (const [key, val] of Object.entries(body)) {
    if (val instanceof Blob) {
      form.set(key, val, val instanceof File ? val.name : undefined);
    } else {
      form.set(
        key,
        typeof val == 'string'
          ? val
          : new Blob([JSON.stringify(val)], {type: JSON_MIME_TYPE})
      );
    }
  }
  return form;
};

const fallbackEncoder: Encoder = (_body, ctx) => {
  // TODO: Support blob pass-through.
  throw new Error('Unsupported request content-type: ' + ctx.content.mimeType);
};
const fallbackDecoder: Decoder = (res, ctx) => {
  if (ctx.content.isBinary) {
    return res.blob();
  }
  throw new Error('Unsupported response content-type: ' + ctx.content.mimeType);
};

const defaultCoercer: Coercer<BaseFetch> = async (res, ctx) => {
  const mtype = ctx.received;
  if (
    (mtype && ctx.declared == null) ||
    (mtype === PLAIN_MIME_TYPE && !ctx.declared?.has(mtype))
  ) {
    return undefined;
  }
  await res.text(); // Consume response body
  throw new Error(
    `Unexpected ${ctx.method.toUpperCase()} ${ctx.path} response content ` +
      `type ${mtype} for status ${res.status} (accepted: ` +
      `[${[...ctx.accepted]}], declared: ` +
      `${ctx.declared ? `[${[...ctx.declared]}]` : '<none>'})`
  );
};

type Input<O, F extends BaseFetch> =
  O extends OperationType<infer R, infer P>
    ? CommonInput<F> &
        MaybeBodyInput<Lookup<Lookup<O, 'requestBody'>, 'content'>, F> &
        MaybeAcceptInput<R, F> &
        MaybeParamInput<P>
    : never;

interface CommonInput<F> {
  readonly headers?: RequestHeaders;
  readonly options?: RequestOptions<F>;
}

type MaybeBodyInput<B, F extends BaseFetch> = [B] extends [undefined]
  ? {}
  : undefined extends B
    ? BodyInput<Exclude<B, undefined>, F> | {readonly body?: never}
    : BodyInput<B, F>;

type BodyInput<B, F extends BaseFetch> =
  | DefaultBodyInput<B, F>
  | CustomBodyInput<B, F>;

type DefaultBodyInput<B, F extends BaseFetch> = DM extends keyof B
  ? {
      readonly headers?: {'content-type'?: DM};
      readonly body: B[DM];
      readonly encoder?: Encoder<F>;
    }
  : never;

type CustomBodyInput<B, F extends BaseFetch> = Values<{
  [K in keyof B & MimeType]: {
    readonly headers: {'content-type': K};
    readonly body: B[K];
    readonly encoder?: Encoder<F>;
  };
}>;

type MaybeAcceptInput<R extends ResponsesType, F extends BaseFetch> =
  ResponseMimeTypes<R> extends never
    ? {}
    :
        | DefaultAcceptInput<R, F>
        | SimpleAcceptInput<R, F>
        | CustomAcceptInput<R, F>;

type DefaultAcceptInput<
  R extends ResponsesType,
  F extends BaseFetch,
> = SplitMimeTypes<DA> & WithMimeTypeGlobs<ResponseMimeTypes<R>> extends never
  ? never
  : {
      readonly headers?: {readonly accept?: DA};
      readonly decoder?: Decoder<F>;
    };

type SimpleAcceptInput<R extends ResponsesType, F extends BaseFetch> = Values<{
  [M in WithMimeTypeGlobs<ResponseMimeTypes<R>> & string]: {
    readonly headers: {readonly accept: M};
    readonly decoder?: Decoder<F>;
  };
}>;

type CustomAcceptInput<R extends ResponsesType, F extends BaseFetch> = Values<{
  [M in WithMimeTypeGlobs<ResponseMimeTypes<R>> & string]: {
    readonly headers: {readonly accept: PrefixedMimeType<M>};
    readonly decoder?: Decoder<F>;
  };
}>;

type PrefixedMimeType<M extends MimeType> = `${M}${string}`;

type MaybeParamInput<P extends ParametersType> = MaybeParam<
  Lookup<P, 'path', {}> & Lookup<P, 'query', {}> & Lookup<P, 'headers', {}>
>;

type MaybeParam<V> = keyof V extends never
  ? {}
  : {} extends V
    ? {readonly params?: V}
    : {readonly params: V};

type Output<O extends OperationType, F extends BaseFetch, X> =
  O extends OperationType<infer R>
    ? CommonOutput<F> & BodyOutput<GetHeader<X, 'accept', DA> & MimeType, R>
    : never;

type GetHeader<X, H extends string, D> =
  X extends HasHeader<H, infer V> ? V : D;

interface HasHeader<H extends string, V extends string> {
  readonly headers: {
    readonly [K in H]: V;
  };
}

interface CommonOutput<F> {
  readonly code: ResponseCode;
  readonly raw: ResponseFor<F>;
  readonly debug?: string;
}

type BodyOutput<M extends MimeType, R extends ResponsesType> =
  | ExpectedBodyOutput<M, R>
  | MaybeUnknownOutput<R>;

type ExpectedBodyOutput<M extends MimeType, R extends ResponsesType> = Values<{
  [C in keyof R]: R[C] extends Has<'content', infer O>
    ? WithCode<C, ValuesMatchingMimeTypes<O, M>>
    : WithCode<C, undefined>;
}>;

type MaybeUnknownOutput<R extends ResponsesType> = 'default' extends keyof R
  ? never
  : WithCode<'default'>;

interface WithCode<C, B = unknown> {
  readonly code: C;
  readonly body: B extends never ? undefined : B;
}

type SdkFor<
  O extends OperationTypes<keyof O & string>,
  F extends BaseFetch = BaseFetch,
> = SdkFunction<F> & {
  readonly [K in keyof O]: SdkOperationFunction<O[K], F, Input<O[K], F>>;
};

// We use this convoluted approach instead of a union of overloaded function
// interfaces (or types) to allow reference lookups to see-through this
// definition and link directly to the underlying operation type.
// TODO: Check that the see-through still works.
type SdkOperationFunction<
  O extends OperationType,
  F extends BaseFetch,
  I extends Input<OperationType, F>,
> = {} extends I
  ? <X extends I = I>(
      args?: X & NeverAdditional<I, X>
    ) => Promise<Output<O, F, Exact<I, X> extends never ? X : {}>>
  : <X extends I>(args: X & NeverAdditional<I, X>) => Promise<Output<O, F, X>>;

type NeverAdditional<I, X> = I extends boolean | null | number | string
  ? I
  : unknown extends I
    ? unknown
    : I extends ReadonlyArray<infer E>
      ? X extends ReadonlyArray<infer F>
        ? ReadonlyArray<NeverAdditional<E, F>>
        : never
      : {
          readonly [K in keyof X]: K extends keyof I
            ? NeverAdditional<I[K], NonNullable<X[K]>>
            : never;
        };

export function createSdkFor<
  O extends OperationTypes<keyof O & string>,
  F extends BaseFetch,
>(operations: OperationDefinitions<O>, config: SdkConfig<F>): SdkFor<O, F> {
  const realFetch: BaseFetch = (config.fetch as any) ?? fetch;

  const target = config.address;
  const root =
    typeof target == 'string' || target instanceof URL
      ? target.toString().replace(/\/+$/, '')
      : `http://${
          target.address.includes(':') ? `[${target.address}]` : target.address
        }:${target.port}`;

  const base: any = config.options ?? {};
  const baseHeaders = config.headers;
  const coercer: Coercer<any> = config.coercer ?? defaultCoercer;

  const encoders = ByMimeType.create<Encoder>(fallbackEncoder);
  encoders.add(MULTIPART_FORM_MIME_TYPE, multipartFormEncoder);
  encoders.add(FORM_MIME_TYPE, formEncoder);
  encoders.add(JSON_MIME_TYPE, jsonEncoder);
  encoders.add(OCTET_STREAM_MIME_TIME, binaryEncoder);
  encoders.add(TEXT_MIME_TYPE, textEncoder);
  encoders.addAll(config.encoders as any);

  const decoders = ByMimeType.create<Decoder>(fallbackDecoder);
  decoders.add(JSON_MIME_TYPE, jsonDecoder);
  decoders.add(OCTET_STREAM_MIME_TIME, binaryDecoder);
  decoders.add(TEXT_MIME_TYPE, textDecoder);
  decoders.addAll(config.decoders as any);

  async function sdk(id: string, arg: any): Promise<any> {
    const op = (operations as any)[id];
    if (!op) {
      throw new Error('Unknown operation ID: ' + id);
    }
    const clauseMatcher = ResponseClauseMatcher.create(op.responses);

    const {body: rawReqBody, encoder, decoder, ...input} = arg ?? {};
    const params = input?.params ?? {};

    const url = new URL(
      root + formatPath(op.path, params),
      typeof document == 'undefined' ? undefined : document.baseURI
    );
    const paramHeaders: any = {};
    for (const [name, val] of Object.entries<any>(params)) {
      switch (op.parameters[name]?.location) {
        case 'header':
          paramHeaders[name] = encodeURIComponent(val);
          break;
        case 'query':
          url.searchParams.set(name, encodeURIComponent(val));
          break;
      }
    }

    const accept = arg?.headers?.['accept'] ?? DEFAULT_ACCEPT;
    const requestType = arg?.headers?.['content-type'] ?? DEFAULT_CONTENT_TYPE;
    const headers = {
      ...baseHeaders,
      ...arg?.headers,
      ...paramHeaders,
      'content-type': requestType,
      accept,
    };

    let reqBody;
    if (rawReqBody !== undefined) {
      const encode = encoder ?? encoders.getBest(requestType);
      reqBody = await encode(rawReqBody, {
        operationId: id,
        contentType: requestType,
        headers,
        options: arg?.options,
      });
    }
    if (reqBody === undefined || reqBody instanceof FormData) {
      delete headers['content-type'];
    }

    const res = await realFetch('' + url, {
      ...base,
      ...input.options,
      headers,
      method: op.method,
      body: reqBody,
    });

    let resType = res.headers.get('content-type')?.split(';')?.[0] || undefined;
    const accepted = acceptedMimeTypes(accept);
    const {code, declared} = clauseMatcher.getBest(res.status);
    if (!isContentCompatible({received: resType, declared, accepted})) {
      resType = await coercer(res, {
        path: op.path,
        method: op.method,
        received: resType,
        declared,
        accepted,
      });
    }

    let resBody, debug;
    if (resType) {
      const decode = decoder ?? decoders.getBest(resType);
      resBody = await decode(res, {
        operationId: id,
        content: declared?.get(resType) ?? {
          mimeType: resType,
          isBinary: false,
        },
        headers,
        options: arg?.options,
      });
    } else {
      // We add any response text here to help debug.
      debug = await res.text();
    }
    const ret = {code, body: resBody, debug};
    // Add the raw response as non-enumerable property so that it doesn't get
    // displayed in error messages.
    Object.defineProperty(ret, 'raw', {value: res});
    return ret;
  }

  const ret: any = sdk;
  for (const id of Object.keys(operations)) {
    ret[id] = (arg: SdkRequest): Promise<SdkResponse> => sdk(id, arg);
  }
  return ret;
}

function formatPath(p: string, o: Record<string, unknown>): string {
  return p.replace(/{[^}]+}/, (s) => {
    const r = o[s.slice(1, -1)];
    return r == null ? s : '' + r;
  });
}
