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

test('upload binary data', async () => {
  const res = await sdk.uploadData({
    headers: {'content-type': 'application/octet-stream'},
    body: new Blob(['some-binary-data']),
  });
  assert(res.code === 200);
  expect(res.data).toContain('a489');
});

test('upload urlencoded form', async () => {
  const res = await sdk.uploadForm({
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: {
      name: 'ann',
      tags: ['a', 'b', 'c'],
    },
  });
  expect(res.code).toEqual(204);
});

test('upload multipart form', async () => {
  const res = await sdk.uploadForm({
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

test('upload multipart form with unexpected fields', async () => {
  const res = await sdk.uploadForm({
    headers: {'content-type': 'multipart/form-data'},
    body: {
      // @ts-expect-error unexpected name field
      metadata: {nam: 'ann'},
      name: 'unexpected',
      logoImage: new Blob(['abcd']),
    },
  });
  expect(res.raw.status).toEqual(400);
});
