import Koa from 'koa';
import stream from 'stream';
import {
  AsyncOrSync,
  Get,
  JSON_MIME_TYPE,
  Lookup,
  MimeType,
  OperationType,
  OperationTypes,
  ResponsesType,
  Values,
} from 'yasdk-runtime';

export type KoaHandlersFor<
  O extends OperationTypes<keyof O & string> = DefaultOperationTypes,
  S = {},
  M extends MimeType = typeof JSON_MIME_TYPE
> = {
  readonly [K in keyof O]?: KoaHandlerFor<O[K], S, M>;
};

export type KoaHandlerFor<
  O extends OperationType = DefaultOperationType,
  S = {},
  M extends MimeType = typeof JSON_MIME_TYPE
> = (ctx: KoaContext<O, S>) => AsyncOrSync<KoaValue<O, M>>;

export interface DefaultOperationTypes {
  readonly [id: string]: DefaultOperationType;
}

export type DefaultOperationType = OperationType<
  ResponsesType,
  DefaultParametersType
>;

interface DefaultParametersType {
  readonly path: UnknownRecord;
  readonly query: UnknownRecord;
  readonly headers: UnknownRecord;
}

type UnknownRecord = Record<string, unknown>;

export type KoaContextsFor<
  O extends OperationTypes<keyof O & string>,
  S = {}
> = {
  readonly [K in keyof O]: KoaContext<O[K], S>;
};

type KoaContext<O extends OperationType, S = {}> = Koa.ParameterizedContext<
  S,
  ContextFor<O>
>;

export type DefaultOperationContext<S = {}> = KoaContext<
  DefaultOperationType,
  S
>;

type ContextFor<O extends OperationType> = ContextForBody<OperationBody<O>> &
  ContextWithParams<OperationParams<O>>;

type ContextForBody<B> = undefined extends B
  ? {}
  : B extends undefined
  ? ContextWithBody<Exclude<B, undefined>> | {}
  : ContextWithBody<B>;

type ContextWithBody<B> = Values<{
  [M in keyof B]: {
    readonly request: {
      readonly type: M;
      readonly body: B[M];
    };
  };
}>;

type OperationBody<O extends OperationType> = Lookup<
  Lookup<O, 'requestBody'>,
  'content'
>;

interface ContextWithParams<P> {
  readonly params: LookupObject<P, 'path'> &
    LookupObject<P, 'query'> &
    LookupObject<P, 'headers'>;
}

type LookupObject<O, K extends string> = Partialize<Lookup<O, K, {}>>;

type Partialize<V> = V extends undefined ? Partial<Exclude<V, undefined>> : V;

type OperationParams<O extends OperationType> = O extends OperationType<
  any,
  infer P
>
  ? P
  : {};

export type KoaValuesFor<
  O extends OperationTypes<keyof O & string>,
  M extends MimeType = typeof JSON_MIME_TYPE
> = {
  readonly [K in keyof O]: KoaValue<O[K], M>;
};

type KoaValue<O, M extends MimeType> = O extends OperationType<infer R>
  ? EmptyData<R> | NonEmptyData<R, M>
  : never;

type EmptyData<R extends ResponsesType> = Values<{
  [C in keyof R]: Get<R[C], 'content'> extends never
    ? StatusesMatching<C>
    : never;
}>;

type NonEmptyData<R extends ResponsesType, M extends MimeType> = Values<{
  [C in keyof R]: DataForCode<C, Get<R[C], 'content'>, keyof R, M>;
}>;

type DataForCode<C, D, X, M> = Values<{
  [K in keyof D]: {
    readonly data:
      | D[K]
      | (D[K] extends string ? Buffer | stream.Readable : never);
  } & WithType<K, M> &
    WithStatus<StatusesMatching<C, X>>;
}>;

type WithType<K, M> = K extends M ? {readonly type?: K} : {readonly type: K};

type WithStatus<C> = C extends 200
  ? {readonly status?: C}
  : {readonly status: C};

type StatusPrefix = '2' | '3' | '4' | '5';

type StatusDigit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

type StatusString<
  P extends StatusPrefix = StatusPrefix,
  D1 extends StatusDigit = StatusDigit,
  D2 extends StatusDigit = StatusDigit
> = `${P}${D1}${D2}`;

type CodeRangeFor<P extends StatusPrefix> = `${P}XX`;

type AllCodes = StatusString extends `${infer N extends number}` ? N : never;

type StatusesMatching<C, X = never> = C extends number
  ? `${C}` extends StatusString
    ? C
    : never
  : C extends CodeRangeFor<infer P>
  ? StatusString<P> extends `${infer N extends number}`
    ? Exclude<N, X>
    : never
  : C extends 'default'
  ? Exclude<AllCodes, StatusesMatching<Exclude<X, 'default'>>>
  : never;
