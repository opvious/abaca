import {assert} from '@opvious/stl-errors';
import events from 'events';
import http from 'http';
import Koa from 'koa';
import {loadDocument, OpenapiDocument} from 'yasdk-openapi';

export async function startApp(app: Koa<any, any>): Promise<http.Server> {
  const server = http.createServer(app.callback());
  process.nextTick(() => {
    server.listen(0, 'localhost');
  });
  await events.once(server, 'listening');
  return server;
}

export function serverAddress(server: http.Server): string {
  const addr = server.address();
  assert(addr, 'Missing server address');
  return typeof addr == 'string' ? addr : `http://localhost:${addr.port}`;
}

export function resourceUrl(name: string): URL {
  return new URL(`./resources/${name}`, import.meta.url);
}

export function loadResourceDocument(name: string): Promise<OpenapiDocument> {
  return loadDocument(resourceUrl(name), {resolveAllReferences: true});
}
