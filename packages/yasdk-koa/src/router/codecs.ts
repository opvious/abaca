import * as coBody from 'co-body';
import Koa from 'koa';
import {
  AllBodyMimeTypes,
  AllResponseMimeTypes,
  AllResponsesMatchingMimeType,
  AsyncOrSync,
  BodiesMatchingMimeType,
  OperationTypes,
  WithMimeTypeGlobs,
} from 'yasdk-openapi/preamble';

export type DecodersFor<O extends OperationTypes, S = {}> = {
  readonly [G in WithMimeTypeGlobs<AllResponseMimeTypes<O>>]?: Decoder<
    AllResponsesMatchingMimeType<O, G>,
    S
  >;
};

export type Decoder<B, S = {}> = (
  ctx: Koa.ParameterizedContext<S>
) => AsyncOrSync<B>;

export type EncodersFor<O extends OperationTypes, S = {}> = {
  readonly [G in WithMimeTypeGlobs<AllBodyMimeTypes<O>>]?: Encoder<
    BodiesMatchingMimeType<O, G>,
    S
  >;
};

export type Encoder<D, S = {}> = (
  data: D,
  ctx: Koa.ParameterizedContext<S>
) => AsyncOrSync<void>;

export const jsonDecoder: Decoder<any> = (ctx) => coBody.json(ctx.req);

export const jsonEncoder: Encoder<any> = (data, ctx) => {
  ctx.body = JSON.stringify(data);
};

export const textDecoder: Decoder<any> = (ctx) => coBody.text(ctx.req);

export const textEncoder: Encoder<any> = (data, ctx) => {
  ctx.body = '' + data;
};

export const fallbackEncoder: Encoder<any, any> = (_data, ctx) => {
  throw new Error('Unsupported response content-type: ' + ctx.type);
};
