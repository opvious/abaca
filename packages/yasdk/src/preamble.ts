import {
  acceptedMimeTypes,
  BaseFetch,
  ByMimeType,
  Coercer,
  CreateSdkOptionsFor,
  Decoder,
  DEFAULT_ACCEPT,
  Encoder,
  Exact,
  Get,
  Has,
  isResponseTypeValid,
  JSON_MIME_TYPE,
  Lookup,
  MimeType,
  OperationDefinition,
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
  ResponsesMatchingMimeType,
  ResponsesType,
  SplitMimeTypes,
  TEXT_MIME_TYPE,
  Values,
  ValuesMatchingMimeTypes,
  WithMimeTypeGlobs,
} from 'yasdk-runtime';

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

const defaultCoercer: Coercer<BaseFetch> = async (res, ctx) => {
  const mtype = ctx.received;
  if (
    (mtype && ctx.declared == null) ||
    (mtype === PLAIN_MIME_TYPE && !ctx.declared?.has(mtype))
  ) {
    await res.text(); // Consume response body.
    return undefined;
  }
  throw new Error(
    `Unexpected ${ctx.method.toUpperCase()} ${ctx.path} response content ` +
      `type ${mtype} for status ${res.status} (accepted: ` +
      `[${[...ctx.accepted]}], declared: ` +
      `${ctx.declared ? `[${[...ctx.declared]}]` : '<none>'})`
  );
};

type Input<
  O,
  F extends BaseFetch,
  M extends MimeType,
  A extends MimeType
> = O extends OperationType<infer R, infer P>
  ? CommonInput<F> &
      MaybeBodyInput<Lookup<Lookup<O, 'requestBody'>, 'content'>, F, M> &
      MaybeAcceptInput<R, F, A> &
      MaybeParamInput<P>
  : never;

interface CommonInput<F> {
  readonly headers?: RequestHeaders;
  readonly options?: RequestOptions<F>;
}

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
      | SimpleAcceptInput<R, F>
      | CustomAcceptInput<R, F>;

type DefaultAcceptInput<
  R extends ResponsesType,
  F extends BaseFetch,
  A extends MimeType
> = SplitMimeTypes<A> & ResponseMimeTypes<R> extends never
  ? never
  : {
      readonly headers?: {readonly accept?: A};
      readonly decoder?: AcceptDecoder<R, F, A>;
    };

type SimpleAcceptInput<R extends ResponsesType, F extends BaseFetch> = Values<{
  [M in WithMimeTypeGlobs<ResponseMimeTypes<R>> & string]: {
    readonly headers: {readonly accept: M};
    readonly decoder?: AcceptDecoder<R, F, M>;
  };
}>;

type CustomAcceptInput<R extends ResponsesType, F extends BaseFetch> = Values<{
  [M in WithMimeTypeGlobs<ResponseMimeTypes<R>> & string]: {
    readonly headers: {readonly accept: PrefixedMimeType<M>};
    readonly decoder?: AcceptDecoder<R, F, ResponseMimeTypes<R>>;
  };
}>;

type PrefixedMimeType<M extends MimeType> = `${M}${string}`;

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

type Output<O, X, F, A extends MimeType> = O extends OperationType<infer R>
  ? CommonOutput<F> & DataOutput<GetHeader<X, 'accept', A> & MimeType, R>
  : never;

type GetHeader<X, H extends string, D> = X extends HasHeader<H, infer V>
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
  M extends MimeType = typeof JSON_MIME_TYPE,
  A extends MimeType = typeof DEFAULT_ACCEPT
> = {
  readonly [K in keyof O]: SdkFunction<O[K], Input<O[K], F, M, A>, F, A>;
};

// We use this convoluted approach instead of a union of overloaded function
// interfaces (or types) to allow reference lookups to see-through this
// definition and link directly to the underlying operation type.
type SdkFunction<O, I, F, A extends MimeType> = {} extends I
  ? <X extends I = I>(
      args?: X
    ) => Output<O, Exact<I, X> extends never ? X : {}, F, A>
  : <X extends I>(args: X) => Output<O, X, F, A>;

export function createSdkFor<
  O extends OperationTypes<keyof O & string>,
  F extends BaseFetch = typeof fetch,
  M extends MimeType = typeof JSON_MIME_TYPE,
  A extends MimeType = typeof DEFAULT_ACCEPT
>(
  operations: OperationDefinitions<O>,
  url: string | URL,
  opts?: CreateSdkOptionsFor<O, F, M, A>
): SdkFor<O, F, M, A> {
  const realFetch: BaseFetch = (opts?.fetch as any) ?? fetch;
  const defaultContentType = opts?.defaultContentType ?? JSON_MIME_TYPE;
  const defaultAccept = opts?.defaultAccept ?? DEFAULT_ACCEPT;
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

      const accept = init?.headers?.['accept'] ?? defaultAccept;
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

      const res = await realFetch('' + url, {
        ...base,
        ...input.options,
        headers,
        method: op.method,
        body,
      });

      let responseType =
        res.headers.get('content-type')?.split(';')?.[0] || undefined;
      const accepted = acceptedMimeTypes(accept);
      const {code, declared} = clauseMatcher.getBest(res.status);
      if (!isResponseTypeValid({value: responseType, declared, accepted})) {
        responseType = await coercer(res, {
          path: op.path,
          method: op.method,
          received: responseType,
          declared,
          accepted,
        });
      }

      let data;
      if (responseType) {
        const decode = decoder ?? decoders.getBest(responseType);
        data = await decode(res, {
          contentType: responseType,
          headers,
          options: init?.options,
        });
      }
      return {code, data, raw: res};
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

type Iterated<V> = V extends AsyncIterable<infer I> ? I : V;

export type ResponseDataFor<
  O extends OperationType,
  C extends keyof O['responses'],
  M extends MimeType = typeof JSON_MIME_TYPE
> = Iterated<Get<Lookup<O['responses'][C], 'content'>, M>>;
