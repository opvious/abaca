import {assert} from '@mtth/stl-errors';
import * as jsonSeq from 'json-text-sequence';
import fetch from 'node-fetch';
import stream from 'stream';

import {Decoder, Encoder} from '../../index.js';

/** Decoder for `application/json-seq` content-types */
export function jsonSeqDecoder(): Decoder<typeof fetch> {
  return (res) => {
    const parser = new jsonSeq.Parser();
    assert(res.body, 'Missing response body');
    res.body.pipe(parser);
    return parser;
  };
}

/** Encoder for `application/json-seq` content-types */
export function jsonSeqEncoder(): Encoder<typeof fetch> {
  return (arg) => {
    assert(
      arg &&
        typeof arg == 'object' &&
        (Symbol.iterator in arg || Symbol.asyncIterator in arg),
      'Not an iterable: %s',
      arg
    );
    const encoder = new jsonSeq.Generator();
    stream.Readable.from(arg as any).pipe(encoder);
    return encoder;
  };
}
