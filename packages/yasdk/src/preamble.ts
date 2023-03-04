import {
  AllBodyMimeTypes,
  AllResponseMimeTypes,
  AllResponsesMatchingMimeType,
  AsyncOrSync,
  BodiesMatchingMimeType,
  ByMimeType,
  Exact,
  Get,
  Has,
  JSON_MIME_TYPE,
  Lookup,
  MimeType,
  OperationDefinition,
  OperationDefinitions,
  OperationType,
  OperationTypes,
  ParametersType,
  PLAIN_MIME_TYPE,
  ResponseClauseMatcher,
  ResponseCode,
  ResponseMimeTypes,
  ResponsesMatchingMimeType,
  ResponsesType,
  TEXT_MIME_TYPE,
  Values,
  ValuesMatchingMimeTypes,
  WithMimeTypeGlobs,
} from 'yasdk-openapi/preamble';

type EncodersFor<O extends OperationTypes, F extends BaseFetch> = {
  readonly [G in WithMimeTypeGlobs<AllBodyMimeTypes<O>>]?: Encoder<
    BodiesMatchingMimeType<O, G>,
    F
  >;
};

export type Encoder<B, F extends BaseFetch = typeof fetch> = (
  body: B,
  ctx: EncoderContext<F>
) => AsyncOrSync<BodyInitFor<F>>;

export interface EncoderContext<F> {
  readonly contentType: string;
  readonly headers: RequestHeaders;
  readonly options?: RequestOptionsFor<F>;
}

type DecodersFor<O extends OperationTypes, F extends BaseFetch> = {
  readonly [G in WithMimeTypeGlobs<AllResponseMimeTypes<O>>]?: Decoder<
    AllResponsesMatchingMimeType<O, G>,
    F
  >;
};

export type Decoder<R, F extends BaseFetch = typeof fetch> = (
  res: ResponseFor<F>,
  ctx: DecoderContext<F>
) => AsyncOrSync<R>;

export interface DecoderContext<F> {
  readonly contentType: string;
  readonly headers: RequestHeaders;
  readonly options?: RequestOptionsFor<F>;
}

const jsonEncoder: Encoder<any> = (body) => JSON.stringify(body);
const jsonDecoder: Decoder<any> = (res) => res.json();

const textEncoder: Encoder<any> = (body) => (body == null ? '' : '' + body);
const textDecoder: Decoder<any> = (res) => res.text();

const fallbackEncoder: Encoder<any> = (_body, ctx) => {
  throw new Error('Unsupported request content-type: ' + ctx.contentType);
};
const fallbackDecoder: Decoder<any> = (_res, ctx) => {
  throw new Error('Unsupported response content-type: ' + ctx.contentType);
};

export type Coercer<F> = (
  res: ResponseFor<F>,
  ctx: CoercerContext
) => MimeType | undefined;

export interface CoercerContext {
  readonly path: string;
  readonly method: string;
  readonly contentType: MimeType | undefined;
  readonly eligible: ReadonlySet<MimeType>;
}

const defaultCoercer: Coercer<BaseFetch> = (res, ctx) => {
  const mtype = ctx.contentType;
  if (mtype === PLAIN_MIME_TYPE) {
    return undefined;
  }
  throw new Error(
    `Unexpected ${ctx.path} ${ctx.method} response content type ${mtype} ` +
      `for status ${res.status}`
  );
};

type RequestInitFor<F> = F extends (url: any, init?: infer R) => any
  ? R
  : never;

type BodyInitFor<F> = Lookup<RequestInitFor<F>, 'body'>;

type ResponseFor<F> = F extends (url: any, init?: any) => Promise<infer R>
  ? R
  : never;

type Input<
  O,
  F extends BaseFetch,
  M extends MimeType
> = O extends OperationType<infer R, infer P>
  ? CommonInput<F> &
      MaybeBodyInput<Lookup<Lookup<O, 'requestBody'>, 'content'>, F, M> &
      MaybeAcceptInput<R, F, M> &
      MaybeParamInput<P>
  : never;

interface CommonInput<F> {
  readonly headers?: RequestHeaders;
  readonly options?: RequestOptionsFor<F>;
}

type RequestHeaders = Record<string, string>;

export type RequestOptionsFor<F> = Omit<
  RequestInitFor<F>,
  'body' | 'headers' | 'method'
>;

type MaybeBodyInput<B, F extends BaseFetch, M> = undefined extends B
  ? {}
  : B extends undefined
  ? BodyInput<Exclude<B, undefined>, F, M> | {}
  : BodyInput<B, F, M>;

type BodyInput<B, F extends BaseFetch, M> =
  | DefaultBodyInput<B, F, M>
  | CustomBodyInput<B, F>;

type DefaultBodyInput<B, F extends BaseFetch, M> = M extends keyof B
  ? {
      readonly headers?: {'content-type'?: M};
      readonly body: B[M];
      readonly encoder?: Encoder<B[M], F>;
    }
  : never;

type CustomBodyInput<B, F extends BaseFetch> = Values<{
  [K in keyof B]: {
    readonly headers: {'content-type': K};
    readonly body: B[K];
    readonly encoder?: Encoder<B[K], F>;
  };
}>;

type MaybeAcceptInput<
  R extends ResponsesType,
  F extends BaseFetch,
  M extends MimeType
> = Values<R> extends never
  ? {}
  :
      | DefaultAcceptInput<R, F, M>
      | SingleAcceptInput<R, F>
      | MultiAcceptInput<R, F>;

type DefaultAcceptInput<
  R extends ResponsesType,
  F extends BaseFetch,
  M extends MimeType
> = M extends ResponseMimeTypes<R>
  ? {
      readonly headers?: {readonly accept?: M};
      readonly decoder?: AcceptDecoder<R, F, M>;
    }
  : never;

type SingleAcceptInput<R extends ResponsesType, F extends BaseFetch> = Values<{
  [M in WithMimeTypeGlobs<ResponseMimeTypes<R>> & string]: {
    readonly headers: {readonly accept: M};
    readonly decoder?: AcceptDecoder<R, F, M>;
  };
}>;

type MultiAcceptInput<R extends ResponsesType, F extends BaseFetch> = Values<{
  [M in WithMimeTypeGlobs<ResponseMimeTypes<R>> & string]: {
    readonly headers: {readonly accept: PrefixedMimeType<M>};
    readonly decoder?: AcceptDecoder<R, F, ResponseMimeTypes<R>>;
  };
}>;

type PrefixedMimeType<
  M extends MimeType,
  S extends string = string
> = `${M}, ${S}`;

type AcceptDecoder<
  R extends ResponsesType,
  F extends BaseFetch,
  M extends MimeType
> = Decoder<ResponsesMatchingMimeType<R, M>, F>;

type MaybeParamInput<P extends ParametersType> = MaybeParam<
  Lookup<P, 'path', {}> & Lookup<P, 'query', {}> & Lookup<P, 'headers', {}>
>;

type MaybeParam<V> = keyof V extends never
  ? {}
  : {} extends V
  ? {readonly parameters?: V}
  : {readonly parameters: V};

type Output<O, A, F, M extends MimeType> = O extends OperationType<infer R>
  ? CommonOutput<F> & DataOutput<GetHeader<A, 'accept', M> & MimeType, R>
  : never;

type GetHeader<A, H extends string, D> = A extends HasHeader<H, infer V>
  ? V
  : D;

interface HasHeader<H extends string, V extends string> {
  readonly headers: {
    readonly [K in H]: V;
  };
}

interface CommonOutput<F> {
  readonly code: ResponseCode;
  readonly raw: ResponseFor<F>;
}

type DataOutput<M extends MimeType, R extends ResponsesType> =
  | ExpectedDataOutput<M, R>
  | MaybeUnknownOutput<R>;

type ExpectedDataOutput<M extends MimeType, R extends ResponsesType> = Values<{
  [C in keyof R]: R[C] extends Has<'content', infer O>
    ? WithCode<C, ValuesMatchingMimeTypes<O, M>>
    : CodedData<C, undefined>;
}>;

type WithCode<C, D> = CodedData<C, D extends never ? undefined : D>;

interface CodedData<C, D = unknown> {
  readonly code: C;
  readonly data: D;
}

type MaybeUnknownOutput<R extends ResponsesType> = 'default' extends keyof R
  ? never
  : CodedData<'default'>;

type SdkFor<
  O extends OperationTypes<keyof O & string>,
  F extends BaseFetch = typeof fetch,
  M extends MimeType = typeof JSON_MIME_TYPE
> = {
  readonly [K in keyof O]: SdkFunction<O[K], Input<O[K], F, M>, F, M>;
};

// We use this convoluted approach instead of a union of overloaded function
// interfaces (or types) to allow reference lookups to see-through this
// definition and link directly to the underlying operation type.
type SdkFunction<O, I, F, M extends MimeType> = {} extends I
  ? <A extends I = I>(
      args?: A
    ) => Output<O, Exact<I, A> extends never ? A : {}, F, M>
  : <A extends I>(args: A) => Output<O, A, F, M>;

export type BaseFetch = (url: URL, init: BaseInit) => Promise<BaseResponse>;

interface BaseInit<B = any> {
  readonly body?: B;
  readonly headers: RequestHeaders;
  readonly method: string;
}

interface BaseResponse {
  readonly status: number;
  readonly headers: {
    get(name: string): string | null | undefined;
  };
}

export function createSdkFor<
  O extends OperationTypes<keyof O & string>,
  F extends BaseFetch = typeof fetch,
  M extends MimeType = typeof JSON_MIME_TYPE
>(
  operations: OperationDefinitions<O>,
  url: string | URL,
  opts?: CreateSdkOptionsFor<O, F, M>
): SdkFor<O, F, M> {
  const realFetch: BaseFetch = (opts?.fetch as any) ?? fetch;
  const defaultContentType = opts?.defaultContentType ?? JSON_MIME_TYPE;
  const root = url.toString().replace(/\/+$/, '');
  const base: any = opts?.options ?? {};
  const baseHeaders = opts?.headers;
  const coercer: Coercer<any> = opts?.coercer ?? defaultCoercer;

  const encoders = ByMimeType.create(fallbackEncoder);
  encoders.add(JSON_MIME_TYPE, jsonEncoder);
  encoders.add(TEXT_MIME_TYPE, textEncoder);
  encoders.addAll(opts?.encoders as any);

  const decoders = ByMimeType.create(fallbackDecoder);
  decoders.add(JSON_MIME_TYPE, jsonDecoder);
  decoders.add(TEXT_MIME_TYPE, textDecoder);
  decoders.addAll(opts?.decoders as any);

  const fetchers: any = {};
  for (const [id, op] of Object.entries<OperationDefinition>(operations)) {
    const clauseMatcher = ResponseClauseMatcher.create(op.responses);
    fetchers[id] = async (init: any): Promise<any> => {
      const {body: rawBody, encoder, decoder, ...input} = init ?? {};
      const params = input?.parameters ?? {};

      const url = new URL(root + formatPath(op.path, params));
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

      const accept = init?.headers?.['accept'] ?? defaultContentType;
      const requestType = init?.headers?.['content-type'] ?? defaultContentType;
      const headers = {
        ...baseHeaders,
        ...init?.headers,
        ...paramHeaders,
        'content-type': requestType,
        accept,
      };

      let body;
      if (rawBody !== undefined) {
        const encode = encoder ?? encoders.getBest(requestType);
        body = await encode(rawBody, {
          contentType: requestType,
          headers,
          options: init?.options,
        });
      }
      if (body === undefined) {
        delete headers['content-type'];
      }

      const res = await realFetch(url, {
        ...base,
        ...input.options,
        headers,
        method: op.method,
        body,
      });

      const received = res.headers.get('content-type')?.split(';')?.[0] ?? '';
      const clause = clauseMatcher.getBest({
        status: res.status,
        accepted: [accept],
        proposed: received,
        coerce: (eligible) =>
          coercer(res, {
            path: op.path,
            method: op.method,
            contentType: received,
            eligible,
          }),
      });
      let data;
      if (clause.contentType) {
        const decode = decoder ?? decoders.getBest(clause.contentType);
        data = await decode(res, {
          contentType: clause.contentType,
          headers,
          options: init?.options,
        });
      }
      return {code: clause.code, data, raw: res};
    };
  }
  return fetchers;
}

function formatPath(p: string, o: Record<string, unknown>): string {
  return p.replace(/{[^}]+}/, (s) => {
    const r = o[s.slice(1, -1)];
    return r == null ? s : '' + r;
  });
}

export interface CreateSdkOptionsFor<
  O extends OperationTypes<keyof O & string>,
  F extends BaseFetch = typeof fetch,
  M extends MimeType = typeof JSON_MIME_TYPE
> {
  /** Global request headers, overridable in individual requests. */
  readonly headers?: RequestHeaders;

  /**
   * Other global request options. These can similarly be overriden in
   * individual fetch calls.
   */
  readonly options?: RequestOptionsFor<F>;

  /** Global request body encoders. */
  readonly encoders?: EncodersFor<O, F>;

  /** Global response decoders. */
  readonly decoders?: DecodersFor<O, F>;

  /** Underlying fetch method. */
  readonly fetch?: (
    url: URL,
    init: BaseInit<BodyInitFor<F>> & RequestOptionsFor<F>
  ) => Promise<ResponseFor<F>>;

  /**
   * Default content-type used for request bodies and responses (sent as
   * `accept` header in requests).
   */
  readonly defaultContentType?: M;

  /**
   * Unexpected response coercion. The default will coerce undeclared
   * `text/plain` responses to empty contents when none of the accepted headers
   * are declared and throw an error otherwise.
   */
  readonly coercer?: Coercer<F>;
}

export type RequestBodyFor<
  O extends OperationType,
  M extends MimeType = typeof JSON_MIME_TYPE
> = Get<Lookup<Lookup<O, 'requestBody'>, 'content'>, M>;

export type RequestParametersFor<O extends OperationType> = Lookup<
  O['parameters'],
  'path',
  {}
> &
  Lookup<O['parameters'], 'query', {}> &
  Lookup<O['parameters'], 'headers', {}>;

export type ResponseDataFor<
  O extends OperationType,
  C extends keyof O['responses'],
  M extends MimeType = typeof JSON_MIME_TYPE
> = Get<Lookup<O['responses'][C], 'content'>, M>;
