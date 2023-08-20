import {statusErrors} from '@opvious/stl-errors';
import {EventConsumer, typedEmitter} from '@opvious/stl-utils/events';
import {
  AllBodyMimeTypes,
  AllResponseMimeTypes,
  AllResponsesMatchingMimeType,
  AsyncOrSync,
  BodiesMatchingMimeType,
  JSON_MIME_TYPE,
  OCTET_STREAM_MIME_TIME,
  OperationTypes,
  WithMimeTypeGlobs,
} from 'abaca-runtime';
import busboy from 'busboy';
import * as coBody from 'co-body';
import Koa from 'koa';
import stream from 'stream';

import {errors, requestErrors} from './index.errors.js';

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

export const multipartFormDecoder: KoaDecoder<MultipartForm> = (ctx) => {
  const ee = typedEmitter<MultipartFormListeners>();

  const bb = busboy({headers: ctx.headers})
    .on('error', (cause) => {
      const err = requestErrors.unreadableBody(cause);
      ee.emit('error', errors.invalidRequest(err));
    })
    .on('field', (name, val) => {
      ee.emit('value', name, val);
    })
    .on('file', (name, stream, info) => {
      switch (info.mimeType) {
        case JSON_MIME_TYPE:
          jsonValue(stream, (err, val) => {
            if (err) {
              bb.destroy(err);
              return;
            }
            ee.emit('value', name, val);
          });
          break;
        case OCTET_STREAM_MIME_TIME:
          ee.emit('stream', name, stream);
          break;
        default: {
          bb.destroy();
          const err = requestErrors.unsupportedContentType(info.mimeType);
          ee.emit('error', errors.invalidRequest(err));
        }
      }
    })
    .on('close', () => void ee.emit('done'));

  ee.on('newListener', (name) => {
    if (name !== 'done' || ee.listenerCount('done')) {
      return;
    }
    // Wait until the listener is added to start piping
    process.nextTick(() => {
      ctx.req
        .on('error', (err) => void bb.destroy(err))
        .on('aborted', () => bb.destroy())
        // We don't use `stream.pipeline` to avoid destroying the request
        // stream. Destroying one causes Koa to output an error to stdout and
        // abort the response before we could handle termination ourselves.
        .pipe(bb);
    });
  }).on('removeListener', (name) => {
    if (name === 'done' && !ee.listenerCount('done')) {
      // We stopped listening to the form
      bb.destroy();
    }
  });

  return ee;
};

export type MultipartForm = EventConsumer<MultipartFormListeners>;

interface MultipartFormListeners {
  value(name: string, data: any): void;
  stream(name: string, data: stream.Readable): void;
  done(): void;
}

// Listening to a stream's data event is faster than async iteration.
// https://github.com/nodejs/node/issues/31979
function jsonValue(
  readable: stream.Readable,
  cb: (err?: Error, val?: any) => void
): void {
  const chunks: Buffer[] = [];
  readable
    .on('error', cb)
    .on('data', (chunk) => void chunks.push(chunk))
    .on('end', () => {
      let val;
      try {
        val = JSON.parse(Buffer.concat(chunks).toString());
      } catch (err: any) {
        cb(err);
        return;
      }
      cb(undefined, val);
    });
}
