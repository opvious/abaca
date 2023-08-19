import events from 'events';
import http from 'http';
import Koa from 'koa';

import {createRouter, createSdk, Sdk} from '../src/index.js';

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

test('upload urlencoded', async () => {
  const res = await sdk.upload({
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: {
      name: 'ann',
      tags: ['a', 'b', 'c'],
    },
  });
  expect(res.code).toEqual(204);
});

test('upload multipart', async () => {
  const res = await sdk.upload({
    headers: {'content-type': 'multipart/form-data'},
    body: {
      metadata: {
        name: 'ann',
        tags: ['a', 'b', 'c'],
      },
      logoImage: new Blob(['abcd']),
    },
  });
  expect(res.code).toEqual(204);
});
