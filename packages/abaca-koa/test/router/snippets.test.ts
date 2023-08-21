import {OpenapiDocument} from 'abaca-openapi';
import http from 'http';
import Koa from 'koa';
import fetch from 'node-fetch';

import * as sut from '../../src/router/index.js';
import {loadResourceDocument, serverAddress, startApp} from '../helpers.js';
import {createSdk, Operations, Sdk} from '../snippets-sdk.gen.js';

describe('snippets', async () => {
  let document: OpenapiDocument;
  let sdk: Sdk<typeof fetch>;
  let server: http.Server;

  async function resetHandlers(
    handlers: sut.KoaHandlersFor<Operations>
  ): Promise<void> {
    const router = sut.createOperationsRouter<Operations>({
      document,
      handlers,
      handleInvalidRequests: true,
    });
    const app = new Koa().use(router.routes());
    server = await startApp(app);
    sdk = createSdk({address: serverAddress(server), fetch});
  }

  beforeAll(async () => {
    document = await loadResourceDocument('snippets.openapi.yaml');
  });

  afterEach(() => {
    server?.close();
  });

  test('echos binary data', async () => {
    await resetHandlers({
      '/binary-echo#post': (ctx) => {
        return {type: 'application/octet-stream', data: ctx.request.body};
      },
    });

    const res = await sdk['/binary-echo#post']({
      headers: {
        accept: 'application/octet-stream',
        'content-type': 'application/octet-stream',
      },
      body: new Blob(['abc']),
    });
    assert(res.code === 200);
    expect(await res.data.text()).toEqual('abc');
  });
});
