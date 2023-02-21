// This file was auto-generated

type Has<N extends number | string | symbol, V> = {
  readonly [K in N]: V;
};

type Get<O, N extends keyof O | string, D = never> = O extends Has<N, infer V>
  ? V & {}
  : D;

type Lookup<O, N extends keyof O | string, D = undefined> = O extends Has<
  N,
  infer V
>
  ? V & {}
  : O extends Partial<Has<N, infer V>>
  ? (V & {}) | undefined
  : D;

type Exact<T, V> = T extends V
  ? Exclude<keyof T, keyof V> extends never
    ? T
    : never
  : never;

type Values<O> = O[keyof O];

type KeysOfValues<O> = Values<{
  [K in keyof O]: keyof O[K];
}>;

type AsyncOrSync<V> = V | Promise<V>;

type MimeType = string;

class ByMimeType<V> {
  private constructor(private readonly entries: Map<MimeType, V>) {}

  static create<V>(fallback: V): ByMimeType<V> {
    return new ByMimeType(new Map([[FALLBACK_MIME_TYPE, fallback]]));
  }

  add(key: MimeType, val: V): void {
    this.entries.set(key, val);
  }

  addAll(items: Record<MimeType, V> | undefined): void {
    for (const [key, val] of Object.entries(items ?? {})) {
      this.add(key, val);
    }
  }

  getBest(key: MimeType): V {
    const exact = this.entries.get(key);
    if (exact) {
      return exact;
    }
    const partial = this.entries.get(key.replace(/\/.+/, '/*'));
    if (partial) {
      return partial;
    }
    return this.entries.get(FALLBACK_MIME_TYPE)!;
  }
}

type WithGlobs<M> = M | MimeTypePrefixes<M> | '*/*';

type MimeTypePrefixes<M> = M extends `${infer P}/${infer _S}`
  ? `${P}/*`
  : never;

type ValuesMatchingMimeType<O, G> = Values<{
  [M in keyof O]: G extends WithGlobs<M> ? O[M] : never;
}>;

const JSON_MIME_TYPE = 'application/json';

const jsonEncoder: Encoder<any> = (body) => JSON.stringify(body);

const jsonDecoder: Decoder<any> = (res) => res.json();

const TEXT_MIME_TYPE = 'text/*';

const textEncoder: Encoder<any> = (body) => (body == null ? '' : '' + body);

const textDecoder: Decoder<any> = (res) => res.text();

const FALLBACK_MIME_TYPE = '*/*';

const fallbackEncoder: Encoder<any> = (_body, ctx) => {
  throw new Error('Unsupported request content-type: ' + ctx.contentType);
};

const fallbackDecoder: Decoder<any> = (_res, ctx) => {
  throw new Error('Unsupported response content-type: ' + ctx.contentType);
};

type OperationTypes<N extends string = string> = {
  readonly [K in N]: OperationType;
};

interface OperationType<
  R extends ResponsesType = {},
  P extends ParametersType = {}
> {
  readonly parameters?: P;
  readonly requestBody?: {readonly content: ContentTypes};
  readonly responses: R;
}

interface ParametersType<P = {}, Q = {}, H = {}> {
  readonly path?: P;
  readonly query?: Q;
  readonly headers?: H;
}

interface ResponsesType {
  readonly [C: ResponseCode]:
    | never
    | {
        readonly content: ContentTypes;
      };
}

interface ContentTypes {
  readonly [M: MimeType]: ContentType;
}

type ContentType = unknown;

export type ResponseCode = number | ResponseCodeRange | 'default' | string;

type ResponseCodeRange = '2XX' | '3XX' | '4XX' | '5XX';

class ResponseCodeMatcher {
  private constructor(
    readonly data: ReadonlyMap<MimeType | '', ReadonlySet<ResponseCode>>
  ) {}

  static create(codes: OperationDefinition['codes']): ResponseCodeMatcher {
    const data = new Map<MimeType, Set<ResponseCode>>();
    for (const [mtype, mcodes] of Object.entries(codes)) {
      data.set(mtype, new Set(mcodes));
    }
    return new ResponseCodeMatcher(data);
  }

  getBest(mtype: MimeType | '', status: number): ResponseCode {
    const mcodes = this.data.get(mtype);
    if (!mcodes) {
      return 'default';
    }
    if (mcodes.has('' + status)) {
      return status;
    }
    const partial = ((status / 100) | 0) + 'XX';
    if (mcodes.has(partial)) {
      return partial;
    }
    return 'default';
  }
}

type OperationDefinitions<O> = {
  readonly [K in keyof O]: OperationDefinition;
};

interface OperationDefinition {
  readonly path: string;
  readonly method: string;
  readonly parameters: Record<string, ParameterLocation>;
  readonly codes: Record<MimeType | '', ReadonlyArray<ResponseCode>>;
}

type ParameterLocation = 'header' | 'path' | 'query';

type Encoders<O extends OperationTypes, F> = {
  readonly [G in WithGlobs<AllBodyMimeTypes<O>>]?: Encoder<
    BodiesMatchingMimeType<O, G>,
    F
  >;
};

export type Encoder<B, F = typeof fetch> = (
  body: B,
  ctx: EncoderContext<F>
) => AsyncOrSync<BodyInitFor<F>>;

export interface EncoderContext<F> {
  readonly contentType: string;
  readonly input: CommonInput<F>;
  // TODO: Pass in information about operation from OpenAPI spec.
}

type AllBodyMimeTypes<O extends OperationTypes> = Values<{
  [K in keyof O]: keyof Lookup<O[K]['requestBody'], 'content'>;
}>;

type BodiesMatchingMimeType<O extends OperationTypes, G> = Values<{
  [K in keyof O]: ValuesMatchingMimeType<
    Lookup<O[K]['requestBody'], 'content'>,
    G
  >;
}>;

type Decoders<O extends OperationTypes, F> = {
  readonly [G in WithGlobs<AllResponseMimeTypes<O>>]?: Decoder<
    AllResponsesMatchingMimeType<O, G>,
    F
  >;
};

export type Decoder<R, F = typeof fetch> = (
  res: ResponseFor<F>,
  ctx: DecoderContext
) => AsyncOrSync<R>;

export interface DecoderContext {
  readonly contentType: string;
}

type AllResponseMimeTypes<O extends OperationTypes<keyof O & string>> = Values<{
  [K in keyof O]: ResponseMimeTypes<O[K]['responses']>;
}>;

type ResponseMimeTypes<R extends ResponsesType> = KeysOfValues<{
  [C in keyof R]: R[C]['content'];
}>;

type AllResponsesMatchingMimeType<O extends OperationTypes, G> = Values<{
  [K in keyof O]: ResponsesMatchingMimeType<O[K]['responses'], G>;
}>;

type ResponsesMatchingMimeType<R extends ResponsesType, G> = Values<{
  [C in keyof R]: R[C] extends Has<'content', infer O>
    ? ValuesMatchingMimeType<O, G>
    : never;
}>;

type RequestInitFor<F> = F extends (url: any, init?: infer R) => any
  ? R
  : never;

type BodyInitFor<F> = Lookup<RequestInitFor<F>, 'body'>;

type ResponseFor<F> = F extends (url: any, init?: any) => Promise<infer R>
  ? R
  : never;

type Input<O, F, M extends MimeType> = O extends OperationType<infer R, infer P>
  ? CommonInput<F> &
      MaybeBodyInput<Lookup<Lookup<O, 'requestBody'>, 'content'>, F, M> &
      MaybeAcceptInput<R, F, M> &
      MaybeParamInput<P>
  : never;

interface CommonInput<F> {
  readonly headers?: RequestHeaders;
  readonly options?: RequestOptions<F>;
}

type RequestHeaders = Record<string, string>;

type RequestOptions<F> = Omit<RequestInitFor<F>, 'body' | 'headers' | 'method'>;

type MaybeBodyInput<B, F, M> = undefined extends B
  ? {}
  : B extends undefined
  ? BodyInput<Exclude<B, undefined>, F, M> | {}
  : BodyInput<B, F, M>;

type BodyInput<B, F, M> = DefaultBodyInput<B, F, M> | CustomBodyInput<B, F>;

type DefaultBodyInput<B, F, M> = M extends keyof B
  ? {
      readonly headers?: {'content-type'?: M};
      readonly body: B[M];
      readonly encoder?: Encoder<B[M], F>;
    }
  : never;

type CustomBodyInput<B, F> = Values<{
  [K in keyof B]: {
    readonly headers: {'content-type': K};
    readonly body: B[K];
    readonly encoder?: Encoder<B[K], F>;
  };
}>;

type MaybeAcceptInput<
  R extends ResponsesType,
  F,
  M extends MimeType
> = {} extends R ? {} : DefaultAcceptInput<R, F, M> | CustomAcceptInput<R, F>;

type DefaultAcceptInput<
  R extends ResponsesType,
  F,
  M extends MimeType
> = M extends ResponseMimeTypes<R>
  ? {
      readonly headers?: {readonly accept?: M};
      readonly decoder?: AcceptDecoder<R, F, M>;
    }
  : never;

type CustomAcceptInput<R extends ResponsesType, F> = Values<{
  [M in WithGlobs<ResponseMimeTypes<R>> & string]: {
    readonly headers: {readonly accept: M};
    readonly decoder?: AcceptDecoder<R, F, M>;
  };
}>;

type AcceptDecoder<R extends ResponsesType, F, M extends MimeType> = Decoder<
  ResponsesMatchingMimeType<R, M>,
  F
>;

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
  | MaybeUnknownOutput<M, R>;

type ExpectedDataOutput<M extends MimeType, R extends ResponsesType> = Values<{
  [C in keyof R]: R[C] extends never
    ? WithCode<C, undefined>
    : WithCode<C, ValuesMatchingMimeType<R[C]['content'], M>>;
}>;

type WithCode<C, D> = D extends never ? never : CodedData<C, D>;

interface CodedData<C, D = unknown> {
  readonly code: C;
  readonly data: D;
}

type MaybeUnknownOutput<
  M extends MimeType,
  R extends ResponsesType
> = 'default' extends keyof R
  ? M extends keyof R['default']['content']
    ? never
    : CodedData<'default'>
  : CodedData<'default'>;

type SdkFor<
  O extends OperationTypes<keyof O & string>,
  F = typeof fetch,
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

const defaultEmptyTypes = ['text/plain'];

// eslint-disable-next-line unused-imports/no-unused-vars
function createSdkFor<
  O extends OperationTypes<keyof O & string>,
  F = typeof fetch,
  M extends MimeType = typeof JSON_MIME_TYPE
>(
  operations: OperationDefinitions<O>,
  url: string | URL,
  opts?: CreateSdkOptionsFor<O, F, M>
): SdkFor<O, F, M> {
  const realFetch: typeof fetch = (opts?.fetch as any) ?? fetch;
  const defaultContentType = opts?.defaultContentType ?? JSON_MIME_TYPE;
  const root = url.toString().replace(/\/+$/, '');
  const base: any = opts?.options ?? {};
  const baseHeaders = opts?.headers;
  const emptyTypes = new Set(opts?.emptyContentTypes ?? defaultEmptyTypes);

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
    const codeMatcher = ResponseCodeMatcher.create(op.codes);
    fetchers[id] = async (init: any): Promise<any> => {
      const {body: rawBody, encoder, decoder, ...input} = init ?? {};
      const params = input?.parameters ?? {};

      const requestType = init?.headers?.['content-type'] ?? defaultContentType;
      let body;
      if (rawBody !== undefined) {
        const encode = encoder ?? encoders.getBest(requestType);
        body = await encode(rawBody, {contentType: requestType, input});
      }

      const url = new URL(root + formatPath(op.path, params));
      const paramHeaders: any = {};
      for (const [name, val] of Object.entries(params)) {
        switch (op.parameters[name]) {
          case 'header':
            paramHeaders[name] = val;
            break;
          case 'query':
            url.searchParams.set(name, '' + val);
            break;
        }
      }

      const headers = {
        ...baseHeaders,
        ...init?.headers,
        ...paramHeaders,
        'content-type': requestType,
        accept: init?.headers?.['accept'] ?? defaultContentType,
      };
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

      let responseType = extractResponseType(res);
      let code = codeMatcher.getBest(responseType, res.status);
      if (code === 'default' && emptyTypes.has(responseType)) {
        code = codeMatcher.getBest('', res.status);
        if (code !== 'default') {
          responseType = '';
        }
      }
      let data;
      if (responseType) {
        const decode = decoder ?? decoders.getBest(responseType);
        data = await decode(res, {contentType: responseType});
      }

      return {code, data, raw: res};
    };
  }
  return fetchers;
}

function extractResponseType(res: Response): string | '' {
  const val = res.headers.get('content-type');
  return val?.split(';')[0] ?? '';
}

function formatPath(p: string, o: Record<string, unknown>): string {
  return p.replace(/{[^}]+}/, (s) => {
    const r = o[s.slice(1, -1)];
    return r == null ? s : '' + r;
  });
}

interface CreateSdkOptionsFor<
  O extends OperationTypes<keyof O & string>,
  F = typeof fetch,
  M extends MimeType = typeof JSON_MIME_TYPE
> {
  /** Global request headers, overridable in individual requests. */
  readonly headers?: RequestHeaders;

  /**
   * Other global request options. These can similarly be overriden in
   * individual fetch calls.
   */
  readonly options?: RequestOptions<F>;

  /** Global request body encoders. */
  readonly encoders?: Encoders<O, F>;

  /** Global response decoders. */
  readonly decoders?: Decoders<O, F>;

  /** Underlying fetch method. */
  readonly fetch?: F;

  /**
   * Default content-type used for request bodies and responses (sent as
   * `accept` header in requests).
   */
  readonly defaultContentType?: M;

  /**
   * Content types which are allowed for responses with no content. Defaults to
   * `text/plain`.
   */
  readonly emptyContentTypes?: ReadonlyArray<string>;
}

// eslint-disable-next-line unused-imports/no-unused-vars
type RequestBodyFor<
  O extends OperationType,
  M extends MimeType = typeof JSON_MIME_TYPE
> = Get<Lookup<Lookup<O, 'requestBody'>, 'content'>, M>;

// eslint-disable-next-line unused-imports/no-unused-vars
type RequestParametersFor<O extends OperationType> = Lookup<
  O['parameters'],
  'path',
  {}
> &
  Lookup<O['parameters'], 'query', {}> &
  Lookup<O['parameters'], 'headers', {}>;

// eslint-disable-next-line unused-imports/no-unused-vars
type ResponseDataFor<
  O extends OperationType,
  C extends keyof O['responses'],
  M extends MimeType = typeof JSON_MIME_TYPE
> = Get<Lookup<O['responses'][C], 'content'>, M>;
