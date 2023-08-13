import {
  AllBodyMimeTypes,
  AllResponseMimeTypes,
  AllResponsesMatchingMimeType,
  AsyncOrSync,
  BodiesMatchingMimeType,
  OperationTypes,
  WithMimeTypeGlobs,
} from 'abaca-runtime';
import * as coBody from 'co-body';
import Koa from 'koa';
import stream from 'stream';

export type KoaDecodersFor<O extends OperationTypes, S = {}> = {
  readonly [G in WithMimeTypeGlobs<AllBodyMimeTypes<O>>]?: KoaDecoder<
    BodiesMatchingMimeType<O, G>,
    S
  >;
};

export type KoaDecoder<B, S = {}> = (
  ctx: Koa.ParameterizedContext<S>
) => AsyncOrSync<B>;

export type KoaEncodersFor<O extends OperationTypes, S = {}> = {
  readonly [G in WithMimeTypeGlobs<AllResponseMimeTypes<O>>]?: KoaEncoder<
    AllResponsesMatchingMimeType<O, G>,
    S
  >;
};

export type KoaEncoder<D, S = {}> = (
  data: D | (D extends string ? Buffer | stream.Readable : never),
  ctx: Koa.ParameterizedContext<S>
) => AsyncOrSync<void>;

export const jsonDecoder: KoaDecoder<any> = (ctx) => coBody.json(ctx.req);

export const jsonEncoder: KoaEncoder<any> = (data, ctx) => {
  ctx.body = JSON.stringify(data);
};

export const textDecoder: KoaDecoder<any> = (ctx) => coBody.text(ctx.req);

export const textEncoder: KoaEncoder<any> = (data, ctx) => {
  ctx.body = data;
};