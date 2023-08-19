import {statusErrors} from '@opvious/stl-errors';
import {withTypedEmitter} from '@opvious/stl-utils/events';
import {
  AllBodyMimeTypes,
  AllResponseMimeTypes,
  AllResponsesMatchingMimeType,
  AsyncOrSync,
  BodiesMatchingMimeType,
  JSON_MIME_TYPE,
  OperationTypes,
  PLAIN_MIME_TYPE,
  WithMimeTypeGlobs,
} from 'abaca-runtime';
import busboy from 'busboy';
import * as coBody from 'co-body';
import Koa from 'koa';
import stream from 'stream';

import {MultipartListeners} from './handlers.js';
import {errors} from './index.errors.js';

export type KoaDecodersFor<O extends OperationTypes, S = {}> = {
  readonly [G in WithMimeTypeGlobs<AllBodyMimeTypes<O>>]?: KoaDecoder<
    BodiesMatchingMimeType<O, G>,
    S
  >;
};

export type KoaDecoder<B = any, S = {}> = (
  ctx: Koa.ParameterizedContext<S>
) => AsyncOrSync<B>;

export type KoaEncodersFor<O extends OperationTypes, S = {}> = {
  readonly [G in WithMimeTypeGlobs<AllResponseMimeTypes<O>>]?: KoaEncoder<
    AllResponsesMatchingMimeType<O, G>,
    S
  >;
};

export type KoaEncoder<D = any, S = {}> = (
  data: D | (D extends string ? Buffer | stream.Readable : never),
  ctx: Koa.ParameterizedContext<S>
) => AsyncOrSync<void>;

export const fallbackDecoder: KoaDecoder = (ctx) => {
  throw statusErrors.unimplemented(errors.unreadableRequestType(ctx.type));
};

export const fallbackEncoder: KoaEncoder = (_data, ctx) => {
  throw errors.unwritableResponseType(ctx.type);
};

export const jsonDecoder: KoaDecoder = (ctx) => coBody.json(ctx.req);

export const jsonEncoder: KoaEncoder = (data, ctx) => {
  ctx.body = JSON.stringify(data);
};

export const textDecoder: KoaDecoder = (ctx) => coBody.text(ctx.req);

export const textEncoder: KoaEncoder = (data, ctx) => {
  ctx.body = data;
};

export const formDecoder: KoaDecoder = (ctx) => coBody.form(ctx.req);

export const multipartFormDecoder: KoaDecoder = (ctx) =>
  withTypedEmitter<MultipartListeners<any>>(async (ee) => {
    const bb = busboy({headers: ctx.headers})
      .on('error', (err) => void ee.emit('error', err))
      .on('field', (name, data, info) => {
        let value;
        switch (info.mimeType) {
          case JSON_MIME_TYPE:
            value = JSON.parse(data);
            break;
          case PLAIN_MIME_TYPE:
            value = data;
            break;
          default: {
            const err = errors.unreadableRequestType(info.mimeType);
            ee.emit('error', statusErrors.unimplemented(err));
          }
        }
        ee.emit('part', {kind: 'field', name, value});
      })
      .on('file', (name, stream) => {
        ee.emit('part', {kind: 'stream', name, stream});
      })
      .on('close', () => void ee.emit('done'));

    ctx.req
      .on('error', (err) => void bb.destroy(err))
      .on('aborted', () => bb.destroy(new Error('Request aborted')))
      // We don't use `stream.pipeline` to avoid destroying the request stream.
      // Destroying one causes Koa to output an error to stdout and abort the
      // response before we could handle termination ourselves.
      .pipe(bb);
  });
