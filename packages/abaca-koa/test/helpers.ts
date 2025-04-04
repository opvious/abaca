import {assert} from '@mtth/stl-errors';
import {ResourceLoader} from '@mtth/stl-utils/files';
import {loadOpenapiDocument, OpenapiDocument} from 'abaca';
import events from 'events';
import http from 'http';
import Koa from 'koa';

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

const loader = ResourceLoader.enclosing(import.meta.url).scoped('test');

export function loadResourceDocument(name: string): Promise<OpenapiDocument> {
  return loadOpenapiDocument({path: loader.localUrl(name), loader});
}
