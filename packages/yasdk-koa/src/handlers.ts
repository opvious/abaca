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
  (ctx: Koa.ParameterizedContext<S, ContextFor<O>>) => AsyncOrSync<ResponseDataFor<O>>;

type ContextFor<_O extends OperationType> = Values<{
}>;

type ResponseDataFor<_O> = any; // TODO: number | D | {code, data, type}
