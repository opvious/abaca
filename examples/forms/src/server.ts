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
            ctx.request.body.on('part', (part) => {
              switch (part.name) {
                case 'metadata':
                  console.log(`Got metadata. [name=${part.value.name}]`);
                  break;
                case 'logoImage':
                  part.stream.resume(); // Consume the stream.
                  console.log('Got logo image.');
                  break;
                case 'coverImage':
                  part.stream.resume(); // Consume the stream.
                  console.log('Got cover image.');
                  break;
                default:
                  throw absurd(part);
              }
            });
            await events.once(ctx.request.body, 'done');
            break;
          }
          case '':
            // If no body is present, the type will be set to the empty string.
            // Consider also setting the body as required in the specification
            // to reject such requests with status 400.
            console.log('Empty body');
        }
        return 204 as const;
      },
    },
    handleInvalidRequests: true,
  });
}
