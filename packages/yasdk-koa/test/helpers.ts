import events from 'events';
import http from 'http';
import Koa from 'koa';
import {loadOpenapiDocument, OpenapiDocument} from 'yasdk-openapi';

export async function startApp(app: Koa): Promise<http.Server> {
  const server = http.createServer(app.callback());
  process.nextTick(() => {
    server.listen(0, 'localhost');
  });
  await events.once(server, 'listening');
  return server;
}

export function resourceUrl(name: string): URL {
  return new URL(`./resources/${name}`, import.meta.url);
}

export function loadDocument(name: string): Promise<OpenapiDocument> {
  return loadOpenapiDocument(resourceUrl(name));
}
