import {absurd, fail} from '@mtth/stl-errors';
import {fromAsyncIterable, toAsyncIterable} from '@mtth/stl-utils/collections';
import {waitForEvent} from '@mtth/stl-utils/events';
import {FORM_MIME_TYPE, JSON_SEQ_MIME_TYPE, OpenapiDocument} from 'abaca';
import {jsonSeqDecoder, jsonSeqEncoder} from 'abaca/codecs/node/json-seq';
import http from 'http';
import Koa from 'koa';
import fetch from 'node-fetch';
import qs from 'qs';

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
    sdk = createSdk({
      address: serverAddress(server),
      fetch,
      decoders: {
        [JSON_SEQ_MIME_TYPE]: jsonSeqDecoder(),
      },
      encoders: {
        [FORM_MIME_TYPE]: (body) => qs.stringify(body),
        [JSON_SEQ_MIME_TYPE]: jsonSeqEncoder(),
      },
    });
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
        return {type: 'application/octet-stream', body: ctx.request.body};
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
    expect(await res.body.text()).toEqual('abc');
  });

  test('echos object data', async () => {
    await resetHandlers({
      '/object-echo#post': (ctx) => {
        return {type: 'application/json-seq', body: ctx.request.body};
      },
    });

    const messages = [{contents: 'hi'}, {contents: ''}];
    const res = await sdk['/object-echo#post']({
      headers: {
        accept: 'application/json-seq',
        'content-type': 'application/json-seq',
      },
      body: toAsyncIterable(messages),
    });
    assert(res.code === 200);
    expect(await fromAsyncIterable(res.body)).toEqual(messages);
  });

  test('uploads URL encoded form', async () => {
    const metadata = {name: 'bob', tags: [{key: 'a'}]};

    await resetHandlers({
      '/upload-form#post': (ctx) => {
        assert(ctx.request.type === 'application/x-www-form-urlencoded');
        expect(ctx.request.body).toEqual(metadata);
        return 204;
      },
    });

    const res = await sdk['/upload-form#post']({
      headers: {'content-type': 'application/x-www-form-urlencoded'},
      body: metadata,
    });
    assert(res.code === 204);
  });

  test('uploads multipart form', async () => {
    const metadata = {name: 'ann'};
    const sig = Buffer.from([1, 2, 3]);

    await resetHandlers({
      '/upload-form#post': async (ctx) => {
        assert(ctx.request.type === 'multipart/form-data');

        const additional: string[] = [];
        ctx.request.body
          .on('property', async (prop) => {
            switch (prop.name) {
              case 'metadata':
                expect(prop.field).toEqual(metadata);
                break;
              case 'signature': {
                const buf = Buffer.concat(await fromAsyncIterable(prop.stream));
                expect(buf).toEqual(sig);
                break;
              }
              default:
                throw absurd(prop);
            }
          })
          .on('additionalProperty', (prop) => {
            additional.push(prop.name);
          });

        await waitForEvent(ctx.request.body, 'done');
        expect(additional).toEqual(['other']);
        return 204 as const;
      },
    });

    const res = await sdk['/upload-form#post']({
      headers: {'content-type': 'multipart/form-data'},
      body: {
        metadata,
        signature: new Blob([sig]),
        other: 1,
      },
    });
    assert(res.code === 204);

    expect.assertions(3);
  });

  test('handles invalid multipart form property', async () => {
    await resetHandlers({
      '/upload-form#post': async (ctx) => {
        assert(ctx.request.type === 'multipart/form-data');
        await waitForEvent(ctx.request.body, 'done');
        fail();
      },
    });

    const res = await sdk['/upload-form#post']({
      headers: {'content-type': 'multipart/form-data'},
      // @ts-expect-error missing name
      body: {metadata: {tag: 'bb'}},
    });
    assert(res.raw.status === 400);
  });

  test('fetches binary data without explicit codecs', async () => {
    await resetHandlers({
      '/custom-binary-response#get': async () => {
        return {
          type: 'application/vnd.opvious.example',
          body: new Blob(['123']),
        };
      },
    });

    const res = await sdk['/custom-binary-response#get']({
      headers: {accept: '*/*'},
    });
    assert(res.code === 200);
    const text = await res.body.text();
    expect(text).toEqual('123');
  });
});
