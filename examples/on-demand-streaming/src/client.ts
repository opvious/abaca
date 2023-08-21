import {jsonSeqDecoder, jsonSeqEncoder} from 'abaca-codecs/node/json-seq';
import net from 'net';
import fetch from 'node-fetch';

import {createSdk, Sdk} from './sdk.gen.js';

export type MessagesSdk = Sdk<typeof fetch>;

export function messagesSdk(address: net.AddressInfo | string): MessagesSdk {
  return createSdk({
    address,
    fetch,
    decoders: {'application/json-seq': jsonSeqDecoder()},
    encoders: {'application/json-seq': jsonSeqEncoder()},
  });
}
