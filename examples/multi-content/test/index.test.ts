import events from 'events';
import http from 'http';
import Koa from 'koa';

import {createRouter, createSdk, Schema,Sdk} from '../src/index.js';

let server: http.Server;
let sdk: Sdk;

beforeAll(async () => {
  const router = await createRouter();
  server = new Koa().use(router.routes()).listen();
  await events.once(server, 'listening');
  sdk = createSdk(`http://localhost:${(server.address() as any).port}`);
});

beforeEach(async () => {
  await sdk.clearTables();
});

afterAll(() => {
  server.close();
});

test('uploads table from JSON', async () => {
  await sdk.setTable({
    parameters: {id: 'id1'},
    body: {
      rows: [
        ['r1', 'v1'],
        ['r2', 'v2'],
      ],
    },
  });
});

test('uploads table from CSV', async () => {
  await sdk.setTable({
    parameters: {id: 'id2'},
    headers: {'content-type': 'text/csv'},
    body: 'r1\nr2',
  });
});

test('fetches table as JSON', async () => {
  const res = await sdk.getTable({
    parameters: {id: 'id3'},
    headers: {accept: 'application/json'},
  });
  switch (res.code) {
    case 200:
      expect<Schema<'Table'>>(res.data).toEqual([]);
      break;
    case 404:
      expect<undefined>(res.data).toBeUndefined();
      break;
  }
});

test('fetches tables as CSV', async () => {
  const res = await sdk.getTable({
    parameters: {id: 'id4'},
    headers: {accept: 'text/csv'},
  });
  switch (res.code) {
    case 200:
      expect<string>(res.data).toEqual('');
      break;
    case 404:
      expect<undefined>(res.data).toBeUndefined();
      break;
  }
});

test('fetches table using glob', async () => {
  const res = await sdk.getTable({
    parameters: {id: 'id5'},
    headers: {accept: '*/*'},
  });
  switch (res.code) {
    case 200:
      expect<Schema<'Table'> | string>(res.data).toEqual('');
      break;
    case 404:
      expect<undefined>(res.data).toBeUndefined();
      break;
  }
});
