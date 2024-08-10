import {EventConsumer} from '@opvious/stl-utils/events';
import {
  AsyncOrSync,
  Get,
  JSON_MIME_TYPE,
  Lookup,
  MimeType,
  MimeTypePrefixes,
  MULTIPART_MIME_TYPE,
  OperationType,
  OperationTypes,
  ResponsesType,
  Values,
} from 'abaca-runtime';
import Koa from 'koa';
import stream from 'stream';

export type KoaHandlersFor<
  O extends OperationTypes<keyof O & string>,
  S = {},
  M extends MimeType = typeof JSON_MIME_TYPE,
> = {
  readonly [K in keyof O]?: KoaHandlerFor<O[K], S, M>;
};

export type KoaHandlerFor<
  O extends OperationType,
  S = {},
  M extends MimeType = typeof JSON_MIME_TYPE,
> = (ctx: KoaContext<O, S>) => AsyncOrSync<KoaValue<O, M>>;

export type KoaContextsFor<
  O extends OperationTypes<keyof O & string>,
  S = {},
> = {
  readonly [K in keyof O]: KoaContext<O[K], S>;
};

type KoaContext<O extends OperationType, S = {}> = Koa.ParameterizedContext<
  S,
  ContextFor<O>
>;

type MaybeBodyContent<O extends OperationType> = Lookup<
  Lookup<O, 'requestBody'>,
  'content'
>;

type ContextFor<O extends OperationType> = ContextForBody<MaybeBodyContent<O>> &
  ContextWithParams<OperationParams<O>>;

type ContextForBody<B> = [B] extends [undefined]
  ? ContextWithoutBody
  : undefined extends B
    ? ContextWithBody<Exclude<B, undefined>> | ContextWithoutBody
    : ContextWithBody<B>;

interface ContextWithoutBody {
  readonly request: {readonly type: ''};
}

type ContextWithBody<B> = Values<{
  [M in keyof B & MimeType]: {
    readonly request: {
      readonly type: M;
      readonly body: MimeTypePrefixes<M> &
        typeof MULTIPART_MIME_TYPE extends never
        ? B[M] extends Blob
          ? stream.Readable
          : B[M]
        : Multipart<B[M]>;
    };
  };
}>;

export type Multipart<O = unknown> = EventConsumer<MultipartListeners<O>>;

export interface MultipartListeners<O = unknown> {
  property(
    prop: unknown extends O ? AdditionalMultipartProperty : MultipartProperty<O>
  ): void;
  additionalProperty(prop: AdditionalMultipartProperty): void;
  done(): void;
}

type MultipartProperty<O> = Values<{
  readonly [K in keyof O as string extends K
    ? never
    : K]-?: MultipartPropertyValue<K, Exclude<O[K], undefined>>;
}>;

type MultipartPropertyValue<N, V> = V extends never
  ? never
  : V extends Blob
    ? MultipartStreamProperty<N>
    : MultipartFieldProperty<N, V>;

export type AdditionalMultipartProperty =
  | MultipartFieldProperty
  | MultipartStreamProperty;

export interface MultipartFieldProperty<N = string, V = unknown> {
  readonly kind: 'field';
  readonly name: N;
  readonly field: V;
}

export interface MultipartStreamProperty<N = string> {
  readonly kind: 'stream';
  readonly name: N;
  readonly stream: stream.Readable;
  // TODO: Add metadata
}

interface ContextWithParams<P> {
  readonly params: LookupObject<P, 'path'> &
    LookupObject<P, 'query'> &
    LookupObject<P, 'headers'>;
}

type LookupObject<O, K extends string> = Partialize<Lookup<O, K, {}>>;

type Partialize<V> = V extends undefined ? Partial<Exclude<V, undefined>> : V;

type OperationParams<O extends OperationType> =
  O extends OperationType<any, infer P> ? P : {};

export type KoaValuesFor<
  O extends OperationTypes<keyof O & string>,
  M extends MimeType = typeof JSON_MIME_TYPE,
> = {
  readonly [K in keyof O]: KoaValue<O[K], M>;
};

type KoaValue<O, M extends MimeType> =
  O extends OperationType<infer R> ? EmptyData<R> | NonEmptyData<R, M> : never;

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
      | (D[K] extends Blob | string ? Buffer | stream.Readable : never);
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
  D2 extends StatusDigit = StatusDigit,
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
