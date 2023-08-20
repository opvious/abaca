import Router from '@koa/router';
import {absurd} from '@opvious/stl-errors';
import {createOperationsRouter} from 'abaca-koa';
import {loadOpenapiDocument} from 'abaca-openapi';
import events from 'events';

import {Operations} from './sdk.gen.js';

export async function createRouter(): Promise<Router> {
  const document = await loadOpenapiDocument();
  return createOperationsRouter<Operations>({
    document,
    handlers: {
      upload: async (ctx) => {
        switch (ctx.request.type) {
          case 'application/x-www-form-urlencoded': {
            const metadata = ctx.request.body; // Metadata type
            console.log(`Got metadata. [name=${metadata.name}]`);
            break;
          }
          case 'multipart/form-data': {
            ctx.request.body
              .on('property', (prop) => {
                switch (prop.name) {
                  case 'metadata':
                    console.log(`Got metadata. [name=${prop.field.name}]`);
                    break;
                  case 'logoImage':
                    prop.stream.resume(); // Consume the stream.
                    console.log('Got logo image.');
                    break;
                  case 'coverImage':
                    prop.stream.resume(); // Consume the stream.
                    console.log('Got cover image.');
                    break;
                  default:
                    throw absurd(prop);
                }
              })
              .on('additionalProperty', (p) => {
                if (p.kind === 'field') {
                  console.log(p.field);
                }
              });
            console.log('WAITING');
            try {
              await events.once(ctx.request.body, 'done');
            } catch (err) {
              console.log('THREW');
              throw err;
            }
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
