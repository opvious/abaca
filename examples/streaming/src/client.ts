import jsonSeq from 'json-text-sequence';
import fetch from 'node-fetch';
import stream from 'stream';

import {createSdk, Sdk} from './sdk.gen.js';

export type MessagesSdk = Sdk<typeof fetch>;

export function messagesSdk(address: string): MessagesSdk {
  return createSdk(address, {
    fetch,
    decoders: {
      'application/json-seq': (res) => {
        const parser = new jsonSeq.Parser();
        res.body!.pipe(parser);
        return parser;
      },
    },
    encoders: {
      'application/json-seq': (iter) => {
        const encoder = new jsonSeq.Generator();
        stream.Readable.from(iter).pipe(encoder);
        return encoder;
      },
    },
  });
}
