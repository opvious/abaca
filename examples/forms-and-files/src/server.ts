import Router from '@koa/router';
import {absurd} from '@opvious/stl-errors';
import {createOperationsRouter} from 'abaca-koa';
import {loadOpenapiDocument} from 'abaca-openapi';
import crypto from 'crypto';
import events from 'events';
import stream from 'stream';

import {Operations} from './sdk.gen.js';

export async function createRouter(): Promise<Router> {
  const document = await loadOpenapiDocument();
  return createOperationsRouter<Operations>({
    document,
    handlers: {
      uploadData: async (ctx) => {
        const sha = await computeSha(ctx.request.body);
        return {type: 'text/plain', data: sha};
      },
      uploadForm: async (ctx) => {
        switch (ctx.request.type) {
          case 'application/x-www-form-urlencoded': {
            const metadata = ctx.request.body; // Metadata type
            console.log(`Got metadata. [name=${metadata.name}]`);
            break;
          }
          case 'multipart/form-data': {
            ctx.request.body.on('property', async (prop) => {
              switch (prop.name) {
                case 'metadata':
                  console.log(`Got metadata. [name=${prop.field.name}]`);
                  break;
                case 'logoImage': {
                  const sha = await computeSha(prop.stream);
                  console.log(`Got logo image. [sha=${sha}]`);
                  break;
                }
                default:
                  throw absurd(prop);
              }
            });
            await events.once(ctx.request.body, 'done');
            break;
          }
          default:
            throw absurd(ctx.request); // Static exhaustive check
        }
        return 204 as const;
      },
    },
    handleInvalidRequests: true,
  });
}

async function computeSha(readable: stream.Readable): Promise<string> {
  const hash = crypto.createHash('sha256');
  readable.pipe(hash);
  await events.once(hash, 'readable');
  return hash.read().toString('hex');
}
