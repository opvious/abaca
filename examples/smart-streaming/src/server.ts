import Router from '@koa/router';
import {loadOpenapiDocument} from 'abaca';
import {createOperationsRouter} from 'abaca-koa';
import {setTimeout} from 'timers/promises';

import {Operations, Schema} from './sdk.gen.js';

/**
 * Returns a Koa router which supports various JSON sequence streaming
 * operations, including on-demand server streaming.
 */
export async function messagesRouter(): Promise<Router> {
  // Load OpenAPI specification from resources/ folder
  const document = await loadOpenapiDocument();

  // Create the router from type-checked operation handlers
  return createOperationsRouter<Operations>({
    document,
    handlers: {
      processMessages: async (ctx) => {
        // Placeholder processing function with a timeout for illustrative
        // purposes. In practice this loop may include any business logic, etc.
        async function* processedMessages(): AsyncIterable<Schema<'Message'>> {
          for (const msg of ctx.request.body) {
            yield {contents: msg.contents.toUpperCase()};
            await setTimeout(50);
          }
        }

        if (ctx.accepts('application/json-seq')) {
          // The client accepts streaming responses. We can directly return an
          // `AsyncIterable` of messages as body. Each message will be sent back
          // to the client as it becomes available here.
          return {type: 'application/json-seq', body: processedMessages()};
        }
        // Otherwise the client only accepts unary responses. We wait for all
        // messages to be processed locally to be able to gather the entire
        // response and send it back.
        const body: Schema<'Message'>[] = [];
        for await (const msg of processedMessages()) {
          body.push(msg);
        }
        return {type: 'application/json', body};
      },
      ingestMessages: async (ctx) => {
        // The body of a request with a streaming type is a standard
        // `AsyncIterable`. It can for example be consumed via an asynchronous
        // loop, which will yield inputs as soon as they are received.
        let body = 0;
        for await (const msg of ctx.request.body) {
          body += msg.contents.length;
        }
        return {body};
      },
      echoMessages: (ctx) => {
        // Since streaming request bodies are also typed as `AsyncIterable`
        // instances so we can simply return it as body to echo each message to
        // the client right as it is received here!
        return {type: 'application/json-seq', body: ctx.request.body};
      },
    },
  });
}
