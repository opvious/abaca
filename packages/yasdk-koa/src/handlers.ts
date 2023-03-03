import Koa from 'koa';
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
  PLAIN_MIME_TYPE,
  ParametersType,
  ResponseClauseMatcher,
  ResponseCode,
  ResponseCodesMatching,
  ResponseMimeTypes,
  ResponsesMatchingMimeType,
  ResponsesType,
  TEXT_MIME_TYPE,
  Values,
  ValuesMatchingMimeType,
  WithGlobs,
} from 'yasdk-openapi/preamble';

export type HandlersFor<O extends OperationTypes, S = {}> = {
  readonly [K in keyof O]?: HandlerFor<O[K], S>;
}

export type HandlerFor<O extends OperationType, S = {}> =
  (ctx: Koa.ParameterizedContext<S, ContextFor<O>>) => AsyncOrSync<ValueFor<O>>;

type ContextFor<O extends OperationType> = ContextForBody<OperationBody<O>>;

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
  }
}>;

type OperationBody<O extends OperationType> = Lookup<Lookup<O, 'requestBody'>, 'content'>;

type OperationResponse<O extends OperationType> = O extends OperationType<infer R> ? R : never;

// TODO: number | D | {code, data, type}
type ValueFor<O> = O extends OperationType<infer R>
  ? (EmptyData<R> | ImplicitData<R> | ExplicitData<R>)
  : never;

type EmptyData<R extends ResponsesType> = Values<{
  [C in keyof R]: Get<Get<R[C], 'content'>, typeof JSON_MIME_TYPE> extends never
    ? ResponseCodesMatching<C>
    : never;
}>;

type ImplicitData<R extends ResponsesType> = Values<{
  [C in keyof R]: Get<R[C], 'content'> extends Has<typeof JSON_MIME_TYPE, infer V>
    ? {
      readonly code: ResponseCodesMatching<C, keyof R>;
      readonly data: V,
    }
    : never
}>

type ExplicitData<R extends ResponsesType> = Values<{
  [C in keyof R]: ExplicitDataForCode<C, Get<R[C], 'content'>, keyof R>
}>

type ExplicitDataForCode<C, D, X> = Values<{
  [M in keyof D]: {
    readonly code: ResponseCodesMatching<C, X>;
    readonly type: M;
    readonly data: D[M];
  }
}>;
