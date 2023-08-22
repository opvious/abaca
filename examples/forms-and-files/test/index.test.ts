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
    // Binary data is represented as built-in `Blob` instances. These can be
    // created easily from buffers, files, etc.
    body: new Blob(['some-binary-data']),
  });
  assert(res.code === 200);
  expect(res.data).toContain('a489'); // Computed SHA returned by the server
});

test('upload urlencoded form', async () => {
  // Uploading URL-encoded forms is similar to sending JSON requests...
  const res = await sdk.uploadForm({
    // ...the only difference is the content-type header...
    headers: {'content-type': 'application/x-www-form-urlencoded'},
    // ...everything else, including the request's body's type, is the same.
    body: {
      name: 'ann',
      tags: ['a', 'b', 'c'],
    },
  });
  expect(res.code).toEqual(204);
});

test('upload multipart form', async () => {
  // Multipart forms are also similar but also support binary properties
  // natively (while JSON and URL-encoded forms do not).
  const res = await sdk.uploadForm({
    headers: {'content-type': 'multipart/form-data'},
    // Binary properties are represented as built-in `Blob` instances, same as
    // the `application/octet-stream` content-type.
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

test('upload multipart form with incompatible field', async () => {
  // Similar to all other SDK requests, form uploads are typed. In particular
  // request bodies must match their specification. Omitting a field, using an
  // incompatible type, etc will all fail at compile time!
  const res = await sdk.uploadForm({
    headers: {'content-type': 'multipart/form-data'},
    body: {
      // @ts-expect-error incompatible metadata name type
      metadata: {name: 12}, // Should be string
      logoImage: new Blob(['abcd']),
    },
  });
  expect(res.raw.status).toEqual(400);
});
