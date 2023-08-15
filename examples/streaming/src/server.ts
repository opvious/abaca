import Router from '@koa/router';
import {createOperationsRouter} from 'abaca-koa';
import {loadOpenapiDocument} from 'abaca-openapi';
import jsonSeq from 'json-text-sequence';
import stream from 'stream';
import {setTimeout} from 'timers/promises';

import {operations, Schema} from './sdk.gen.js';

export async function messagesRouter(): Promise<Router> {
  // Load OpenAPI specification from resources/ folder
  const document = await loadOpenapiDocument();

  // Create the router from type-checked operation handlers
  return createOperationsRouter<operations>({
    document,
    handlers: {
      echoMessages: (ctx) => {
        async function* messages(): AsyncIterable<Schema<'Message'>> {
          for await (const msg of ctx.request.body) {
            yield msg;
          }
        }
        return {type: 'application/json-seq', data: messages()};
      },
      ingestMessages: async (ctx) => {
        for await (const msg of ctx.request.body) {
          console.log(`Ingesting ${msg.contents}...`);
        }
        return 204 as const;
      },
      repeatMessage: (ctx) => {
        async function* messages(): AsyncIterable<Schema<'Message'>> {
          const contents = ctx.request.body;
          let {count} = ctx.params;
          while (count-- > 0) {
            console.log(`Repeating ${contents}...`);
            yield {contents};
            await setTimeout(50);
          }
        }
        return {type: 'application/json-seq', data: messages()};
      },
    },
    decoders: {
      'application/json-seq': (ctx) => {
        const decoder = new jsonSeq.Parser();
        ctx.req.pipe(decoder);
        return decoder;
      },
    },
    encoders: {
      'application/json-seq': (iter, ctx) => {
        const encoder = new jsonSeq.Generator();
        stream.Readable.from(iter).pipe(encoder);
        ctx.body = encoder;
      },
    },
  });
}
