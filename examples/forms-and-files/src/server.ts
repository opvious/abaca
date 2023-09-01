import Router from '@koa/router';
import {absurd} from '@opvious/stl-errors';
import {createOperationsRouter} from 'abaca-koa';
import {loadOpenapiDocument} from 'abaca-openapi';
import crypto from 'crypto';
import events from 'events';
import stream from 'stream';

import {Operations} from './sdk.gen.js';

/** Returns a Koa router for our API's operations */
export async function createRouter(): Promise<Router> {
  const document = await loadOpenapiDocument();
  return createOperationsRouter<Operations>({
    document,
    handlers: {
      uploadData: async (ctx) => {
        // This operation accepts requests with an `application/octet-stream`
        // body, available as a binary `stream.Readable`. In this example we
        // simply compute its SHA, but you can use it as any standard stream
        // (save to a file, decode, etc.).
        const sha = await computeSha(ctx.request.body);
        // We now return the computed SHA to be sent back to the client.
        return {type: 'text/plain', data: sha};
      },
      uploadForm: async (ctx) => {
        // This operations accepts requests with form bodies, either as
        // `application/x-www-form-urlencoded` or `multipart/form-data`. The
        // request's `type` field can be used to narrow the body's type
        // accordingly.
        switch (ctx.request.type) {
          case 'application/x-www-form-urlencoded': {
            // URL-encoded forms are automatically decoded and available via a
            // correspondingly typed body. This representation is the simplest
            // but does not support streaming files.
            const metadata = ctx.request.body; // Typed `Metadata` object
            console.log(`Got URL-encoded metadata. [name=${metadata.name}]`);
            break;
          }
          case 'multipart/form-data': {
            // Multipart forms may contain files and as such are best exposed
            // via emitters which emit (typed!) events asynchronously. This
            // allows efficient and safe processing of forms with large files.
            ctx.request.body.on('property', async (prop) => {
              // The `property` event is emitted each time a property is
              // available. There are two types of properties:
              switch (prop.name) {
                case 'metadata':
                  // Field properties (such as this `metadata` property), which
                  // are decoded automatically and typed according to their
                  // schema.
                  console.log(`Got metadata. [name=${prop.field.name}]`);
                  break;
                case 'logoImage': {
                  // Stream properties (such as this `logoImage` property),
                  // which are exposed as readable streams. They correspond to
                  // `string` properties with `binary` format. Each of these
                  // streams must be consumed in order for the rest of the form
                  // to be decoded. In this example we consume it by computing
                  // its SHA.
                  const sha = await computeSha(prop.stream);
                  console.log(`Got logo image. [sha=${sha}]`);
                  break;
                }
                default:
                  // For additional safety, we add a static check to ensure that
                  // our branches are exhaustive. This will detect (at compile
                  // time!) if any new properties are added without a
                  // corresponding branch here.
                  throw absurd(prop);
              }
            });
            // The `done` event is emitted once the form's data has been fully
            // consumed. It also validates that all required fields are present.
            await events.once(ctx.request.body, 'done');
            break;
          }
          default:
            // Similar to the multipart switch above, we add a static check to
            // guard against new content types being added without a
            // corresponding branch here.
            throw absurd(ctx.request);
        }
        return 204 as const;
      },
    },
    handleInvalidRequests: true,
  });
}

/** Computes a binary stream's SHA */
async function computeSha(readable: stream.Readable): Promise<string> {
  const hash = crypto.createHash('sha256');
  readable.pipe(hash);
  await events.once(hash, 'readable');
  return hash.read().toString('hex');
}
