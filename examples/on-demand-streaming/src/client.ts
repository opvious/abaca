import {jsonSeqDecoder, jsonSeqEncoder} from 'abaca-codecs/node/json-seq';
import net from 'net';
import fetch from 'node-fetch';

import {createSdk, Sdk} from './sdk.gen.js';

/** Returns a streaming-compatible SDK powered by `node-fetch` */
export function messagesSdk(address: net.AddressInfo | string): MessagesSdk {
  return createSdk({
    address,
    fetch,
    // The decoder and encoder are just a few lines of code each. Their source
    // can be found in the `packages/abaca-codecs` folder in this repository.
    decoders: {'application/json-seq': jsonSeqDecoder()},
    encoders: {'application/json-seq': jsonSeqEncoder()},
  });
}

/**
 * `node-fetch`-compatible SDK. This allows type-safe access to `fetch`'s
 * options by SDK users. The `options` attribute in all SDK methods will
 * automatically be extended to support `node-fetch`'s custom options (for
 * example `agent` and `compress`).
 */
export type MessagesSdk = Sdk<typeof fetch>;
