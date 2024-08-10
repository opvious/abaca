import {assert, statusErrors} from '@opvious/stl-errors';
import {EventConsumer, typedEmitter} from '@opvious/stl-utils/events';
import {
  AsyncOrSync,
  ByMimeType,
  ContentFormat,
  FORM_MIME_TYPE,
  JSON_MIME_TYPE,
  JSON_SEQ_MIME_TYPE,
  MimeType,
  MULTIPART_FORM_MIME_TYPE,
  OCTET_STREAM_MIME_TIME,
  TEXT_MIME_TYPE,
} from 'abaca';
import busboy from 'busboy';
import * as coBody from 'co-body';
import * as jsonSeq from 'json-text-sequence';
import Koa from 'koa';
import stream from 'stream';

import {errors, requestErrors} from './index.errors.js';

// Types

export interface KoaDecoders<S = {}> {
  readonly [mimeType: MimeType]: KoaDecoder<S>;
}

export type KoaDecoder<S = {}> = (
  ctx: Koa.ParameterizedContext<S>
) => AsyncOrSync<unknown>;

export interface KoaEncoders<S = {}> {
  readonly [mimeType: MimeType]: KoaEncoder<S>;
}

export type KoaEncoder<S = {}> = (
  data: unknown,
  ctx: Koa.ParameterizedContext<S>,
  content: ContentFormat
) => AsyncOrSync<void>;

// Implementations

export function defaultDecoders(): ByMimeType<KoaDecoder> {
  const ret = ByMimeType.create<KoaDecoder>((ctx) => {
    throw statusErrors.unimplemented(errors.unreadableRequestType(ctx.type));
  });
  ret.add(FORM_MIME_TYPE, (ctx) => coBody.form(ctx.req));
  ret.add(JSON_MIME_TYPE, (ctx) => coBody.json(ctx.req));
  ret.add(JSON_SEQ_MIME_TYPE, jsonSeqDecoder);
  ret.add(MULTIPART_FORM_MIME_TYPE, multipartFormDecoder);
  ret.add(OCTET_STREAM_MIME_TIME, (ctx) => ctx.req);
  ret.add(TEXT_MIME_TYPE, (ctx) => coBody.text(ctx.req));
  return ret;
}

export function defaultEncoders(): ByMimeType<KoaEncoder> {
  const ret = ByMimeType.create<KoaEncoder>(async (data, ctx, content) => {
    if (content.isBinary) {
      if (data instanceof Blob) {
        const buf = await data.arrayBuffer();
        data = Buffer.from(buf);
      }
      ctx.body = data;
      return;
    }
    throw errors.unwritableResponseType(ctx.type);
  });
  ret.add(JSON_MIME_TYPE, (data, ctx) => {
    ctx.body = JSON.stringify(data);
  });
  ret.add(JSON_SEQ_MIME_TYPE, jsonSeqEncoder);
  ret.add(OCTET_STREAM_MIME_TIME, (data, ctx) => {
    ctx.body = data;
  });
  ret.add(TEXT_MIME_TYPE, (data, ctx) => {
    ctx.body = data;
  });
  return ret;
}

const multipartFormDecoder: KoaDecoder = (ctx) => {
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

const jsonSeqDecoder: KoaDecoder = (ctx) => {
  const decoder = new jsonSeq.Parser();
  ctx.req.pipe(decoder);
  return decoder;
};

const jsonSeqEncoder: KoaEncoder = (arg, ctx) => {
  assert(
    arg &&
      typeof arg == 'object' &&
      (Symbol.iterator in arg || Symbol.asyncIterator in arg),
    'Not an iterable: %s',
    arg
  );
  const encoder = new jsonSeq.Generator();
  stream.Readable.from(arg as any).pipe(encoder);
  ctx.body = encoder;
};
