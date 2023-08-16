import Router from '@koa/router';
import {assert} from '@opvious/stl-errors';
import http from 'http';
import Koa from 'koa';
import koaBody from 'koa-body';
import fetch from 'node-fetch';

import {startApp} from './helpers';
import {createSdk, Schema, Sdk} from './tables-sdk.gen';

describe('tables', () => {
  let sdk: Sdk<typeof fetch, 'application/json', 'application/json'>;
  let app: Koa<any, any>;
  let server: http.Server;

  beforeAll(async () => {
    const router = newRouter();
    app = new Koa().use(router.allowedMethods()).use(router.routes());
    server = await startApp(app);
    const addr = server.address();
    assert(addr, 'Missing server address');
    sdk = createSdk(
      typeof addr == 'string' ? addr : `http://localhost:${addr.port}`,
      {
        defaultAccept: 'application/json',
        fetch,
      }
    );
  });

  afterAll(() => {
    server?.close();
  });

  test('upload JSON', async () => {
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

  test('upload CSV', async () => {
    await sdk.setTable({
      params: {id: 'id2'},
      headers: {'content-type': 'text/csv'},
      body: 'r1\nr2',
    });
  });

  test('fetch JSON', async () => {
    const res = await sdk.getTable({params: {id: 'id3'}});
    switch (res.code) {
      case 200:
        expect<Schema<'Table'>>(res.data).toEqual([]);
        break;
      case 404:
        expect<undefined>(res.data).toBeUndefined();
        break;
    }
  });

  test('fetch CSV', async () => {
    const res = await sdk.getTable({
      params: {id: 'id4'},
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

  test('fetch any with glob', async () => {
    const res = await sdk.getTable({
      params: {id: 'id5'},
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

  test('fetch any with list', async () => {
    const res = await sdk.getTable({
      params: {id: 'id5'},
      headers: {accept: 'application/json, text/csv'},
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

  test('fetch any with partial overlap list', async () => {
    const res = await sdk.getTable({
      params: {id: 'id5'},
      headers: {accept: 'application/json, application/xml'},
    });
    switch (res.code) {
      case 200:
        expect<Schema<'Table'>>(res.data).toEqual('');
        break;
      case 404:
        expect<undefined>(res.data).toBeUndefined();
        break;
    }
  });
});

function newRouter(): Router {
  const tables = new Map<string, Schema<'Table'>>();
  return new Router()
    .use(koaBody())
    .get('/tables/:id', (ctx) => {
      const table = tables.get(ctx.params.id!);
      if (!table) {
        ctx.status = 404;
        return;
      }
      switch (ctx.accepts(['application/json', 'text/csv'])) {
        case 'application/json':
          ctx.body = table;
          break;
        case 'text/csv':
          ctx.body = table.rows.map((r) => r.join(',')).join('\n');
          break;
        default:
          ctx.status = 406;
      }
    })
    .put('/tables/:id', (ctx) => {
      let table: Schema<'Table'> | undefined;
      switch (ctx.type) {
        case 'application/json':
          table = ctx.request.body;
          break;
        case 'text/csv':
          table = ctx.request.body.split('\n').map((r) => r.split(','));
          break;
      }
      if (!table) {
        ctx.status = 415;
        return;
      }
      tables.set(ctx.params.id!, table);
    });
}
