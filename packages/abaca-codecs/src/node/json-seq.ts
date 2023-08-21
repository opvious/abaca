import {Decoder, Encoder} from 'abaca-runtime';
import jsonSeq from 'json-text-sequence';
import fetch from 'node-fetch';
import stream from 'stream';

export function jsonSeqDecoder<V = any>(): Decoder<
  AsyncIterable<V>,
  typeof fetch
> {
  return (res) => {
    const parser = new jsonSeq.Parser();
    res.body!.pipe(parser);
    return parser;
  };
}

export function jsonSeqEncoder<V = any>(): Encoder<
  AsyncIterable<V>,
  typeof fetch
> {
  return (iter) => {
    const encoder = new jsonSeq.Generator();
    stream.Readable.from(iter).pipe(encoder);
    return encoder;
  };
}
