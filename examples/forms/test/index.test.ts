import events from 'events';
import http from 'http';
import Koa from 'koa';

import {
  createRouter,
  createSdk,
  Sdk,
} from '../src/index.js';

let server: http.Server;
let sdk: Sdk;

beforeAll(async () => {
  const router = await createRouter();
  server = new Koa().use(router.routes()).listen();
  await events.once(server, 'listening');
  sdk = createSdk(server.address()!);
});

afterAll(() => {
  server.close();
});

test('upload', async () => {
  sdk.upload({
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: {
      name: 'aa',
      signature: new Blob(['abc']),
    },
  });
});

// type B = RequestBody<'upload', 'application/x-www-form-urlencoded'>;
// const b: B = {
// };
