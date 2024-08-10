import events from 'events';
import http from 'http';
import Koa from 'koa';

import {createSdk, Sdk} from './snippets-sdk.gen.js';

let server: http.Server;
let sdk: Sdk;

beforeAll(async () => {
  server = new Koa().listen();
  await events.once(server, 'listening');
  sdk = createSdk(server.address()!);
});

afterAll(() => {
  server.close();
});

describe('snippets', () => {
  test('sdk unknown method', () => {
    // @ts-expect-error invalid operation ID
    sdk.unknownOperation?.();
  });

  test('undeclared content-type', async () => {
    const res = await sdk['/optional-body#post']({
      // @ts-expect-error content-type
      headers: {'content-type': 'application/json'},
      body: {name: 'ann'},
    });
    expect(res.code).toEqual('default');
  });

  test('optional mutiple body additional fields', async () => {
    const res = await sdk['/optional-body#post']({
      headers: {'content-type': 'application/x-www-form-urlencoded'},
      // @ts-expect-error additional fields
      body: {name: 'ann', logoImage: new Blob(['abc'])}, // logoImage
    });
    expect(res.code).toEqual('default');
  });
});
