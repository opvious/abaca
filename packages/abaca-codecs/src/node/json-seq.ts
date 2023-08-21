import {assert} from '@opvious/stl-errors';
import {Decoder, Encoder} from 'abaca-runtime';
import jsonSeq from 'json-text-sequence';
import fetch from 'node-fetch';
import stream from 'stream';

/** Decoder for `application/json-seq` content-types */
export function jsonSeqDecoder<V = unknown>(): Decoder<
  AsyncIterable<V>,
  typeof fetch
> {
  return (res) => {
    const parser = new jsonSeq.Parser();
    assert(res.body, 'Missing response body');
    res.body.pipe(parser);
    return parser;
  };
}

/** Encoder for `application/json-seq` content-types */
export function jsonSeqEncoder<V = unknown>(): Encoder<
  AsyncIterable<V>,
  typeof fetch
> {
  return (iter) => {
    const encoder = new jsonSeq.Generator();
    stream.Readable.from(iter).pipe(encoder);
    return encoder;
  };
}
