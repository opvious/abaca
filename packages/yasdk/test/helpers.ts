import events from 'events';
import http from 'http';
import Koa from 'koa';

export async function startApp(app: Koa): Promise<http.Server> {
  const server = http.createServer(app.callback());
  process.nextTick(() => {
    server.listen(0, 'localhost');
  });
  await events.once(server, 'listening');
  return server;
}

// Compile-time type assertion.
export function touch<V>(_val: V): void {}
