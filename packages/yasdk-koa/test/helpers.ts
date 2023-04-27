import {assert} from '@opvious/stl-errors';
import {ResourceLoader} from '@opvious/stl-utils/files';
import events from 'events';
import http from 'http';
import Koa from 'koa';
import {
  assertIsOpenapiDocument,
  loadResolvableResource,
  OpenapiDocument,
} from 'yasdk-openapi';

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

export async function loadResourceDocument(
  name: string
): Promise<OpenapiDocument> {
  const {resolved} = await loadResolvableResource(name, {loader});
  assertIsOpenapiDocument(resolved);
  return resolved;
}
