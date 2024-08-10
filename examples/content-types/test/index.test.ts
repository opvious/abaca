import events from 'events';
import http from 'http';
import Koa from 'koa';

import {createRouter, createSdk, Schema, Sdk} from '../src/index.js';

let server: http.Server;
let sdk: Sdk;

beforeAll(async () => {
  const router = await createRouter();
  server = new Koa().use(router.routes()).listen();
  await events.once(server, 'listening');
  sdk = createSdk(server.address()!);
});

beforeEach(async () => {
  await sdk.clearTables();
});

afterAll(() => {
  server.close();
});

test('uploads table from JSON', async () => {
  await sdk.setTable({
    params: {id: 'id1'},
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
    params: {id: 'id2'},
    headers: {'content-type': 'text/csv'},
    body: 'r1\nr2',
  });
});

test('fetches missing table as JSON', async () => {
  const res = await sdk.getTable({
    params: {id: 'id3'},
    headers: {accept: 'application/json'},
  });
  assert(res.code === 404);
  expect(res.body).toBeUndefined();
});

describe('fetches existing table', () => {
  const table = {rows: [['r1', 'v1']]};

  beforeEach(async () => {
    await sdk.setTable({params: {id: 'id4'}, body: table});
  });

  test('as JSON', async () => {
    const res = await sdk.getTable({params: {id: 'id4'}});
    assert(res.code === 200);
    assertType<Schema<'Table'>>(res.body);
    expect(res.body).toEqual(table);
  });

  test('fetches tables as CSV', async () => {
    const res = await sdk.getTable({
      params: {id: 'id4'},
      headers: {accept: 'text/csv'},
    });
    assert(res.code === 200);
    assertType<string>(res.body);
    expect(res.body).toEqual('r1,v1');
  });
});

test('fetches table using glob', async () => {
  const res = await sdk.getTable({
    params: {id: 'id5'},
    headers: {accept: '*/*'},
  });
  switch (res.code) {
    case 200:
      expect<Schema<'Table'> | string>(res.body).toEqual('');
      break;
    case 404:
      expect<undefined>(res.body).toBeUndefined();
      break;
  }
});
